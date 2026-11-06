from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional, List, Dict, Any
import asyncio
import datetime
import io
import json
import re
import httpx
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from database import get_db
from schemas import (
    MarketplaceAccountCreate, MarketplaceAccountUpdate,
    MarketplaceOrderSyncRequest, MarketplaceSkuMapCreate,
    MarketplaceAIChatRequest, ShopeeTestConnectionRequest,
    MarketplaceOrderJsonImportRequest, MarketplaceAutoCookieRequest,
    MarketplaceOrderBulkDeleteRequest, PancakeTestRequest, PancakeSyncRequest,
    PancakeCommissionRules, PancakeSellerUpdate,
    KocInspectSheetRequest, KocInspectColumnsRequest, KocCommissionRulesIn, KocSourceSaveRequest,
    KocManualVideoAddRequest, KocVideoUpdateRequest, KocBulkKpiRequest
)
from services import pancake as pancake_svc
from services import koc_service as koc_svc
from logger_config import get_module_logger
from services.marketplace_stock import sync_order_stock, sync_orders_stock
from dependencies import get_optional_user, require_role

logger = get_module_logger("marketplace")

router = APIRouter(prefix="/api/marketplace", tags=["Marketplace TMĐT"])

def parse_shopee_session(input_str: str) -> tuple[str, str]:
    if not input_str:
        return "", ""

    raw = input_str.strip()
    spc_cds = ""
    cookie_str = ""

    # 1. Nếu người dùng dán JSON: {"spc_cds": "...", "cookie": "..."}
    if raw.startswith("{") and raw.endswith("}"):
        try:
            d = json.loads(raw)
            spc_cds = d.get("spc_cds") or d.get("SPC_CDS") or ""
            cookie_str = d.get("cookie") or d.get("cookies") or ""
        except Exception:
            pass

    # 2. Tìm SPC_CDS từ query param (?SPC_CDS=... hoặc &SPC_CDS=...)
    if not spc_cds:
        m_url = re.search(r"SPC_CDS=([a-zA-Z0-9_\-]+)", raw)
        if m_url:
            spc_cds = m_url.group(1)

    # 3. Tìm Cookie từ cURL (-b '...' hoặc -H 'cookie: ...' hoặc -H 'Cookie: ...')
    if not cookie_str:
        m_curl_cookie = re.search(r"(?:-H\s+['\"]cookie:\s*|--cookie\s+['\"]|-b\s+['\"])([^'\"]+)", raw, flags=re.I)
        if m_curl_cookie:
            cookie_str = m_curl_cookie.group(1).strip()
        elif "SPC_" in raw or ";" in raw:
            # Người dùng dán trực tiếp chuỗi Cookie
            cookie_str = raw

    # 4. Nếu chưa có spc_cds nhưng cookie_str có SPC_CDS=
    if not spc_cds and cookie_str:
        m_c = re.search(r"SPC_CDS=([a-zA-Z0-9_\-]+)", cookie_str)
        if m_c:
            spc_cds = m_c.group(1)

    # 5. Nếu input ngắn và chỉ gồm ký tự token (UUID / hex / token)
    if not spc_cds and len(raw) < 100 and re.match(r"^[a-zA-Z0-9_\-]+$", raw):
        spc_cds = raw

    return spc_cds, cookie_str

def extract_spc_cds(cookie_str: str) -> str:
    spc_cds, _ = parse_shopee_session(cookie_str)
    return spc_cds

# ─────────────────────────────────────────────────────────────────
# 1. QUẢN LÝ TÀI KHOẢN SÀN & COOKIES
# ─────────────────────────────────────────────────────────────────
@router.get("/accounts")
def list_accounts(platform: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT a.id, a.platform, a.shop_name, a.is_active, a.last_sync_at,
               a.created_at, a.updated_at, a.extra_config,
               CASE WHEN a.cookies IS NOT NULL AND LENGTH(a.cookies) > 5 THEN 1 ELSE 0 END as has_cookies,
               (SELECT COUNT(*) FROM marketplace_orders WHERE account_id = a.id) as order_count
        FROM marketplace_accounts a
        WHERE 1=1
    """
    params = []
    if platform:
        query += " AND a.platform = ?"
        params.append(platform)
    query += " ORDER BY a.id ASC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/accounts")
def create_account(req: MarketplaceAccountCreate, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO marketplace_accounts (platform, shop_name, cookies, extra_config, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
    """, (req.platform.lower(), req.shop_name.strip(), (req.cookies or "").strip(), req.extra_config or "", now_vn, now_vn))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id, "message": f"Đã kết nối gian hàng [{req.shop_name}]"}

@router.post("/accounts/auto-cookie")
async def auto_save_cookie(req: MarketplaceAutoCookieRequest):
    conn = get_db()
    cur = conn.cursor()
    platform = req.platform.lower().strip()
    spc_cds = (req.spc_cds or "").strip()
    raw_cookies = (req.cookies or "").strip()

    full_cookies = raw_cookies
    if spc_cds and "SPC_CDS=" not in full_cookies:
        full_cookies = f"SPC_CDS={spc_cds}; {full_cookies}"

    now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cur.execute("SELECT id, shop_name FROM marketplace_accounts WHERE platform = ? ORDER BY id ASC LIMIT 1", (platform,))
    row = cur.fetchone()
    if row:
        acc_id = row[0]
        cur.execute("""
            UPDATE marketplace_accounts 
            SET cookies = ?, is_active = 1, updated_at = ?
            WHERE id = ?
        """, (full_cookies, now_vn, acc_id))
    else:
        shop_name = req.shop_name or ("Shopee Seller" if platform == "shopee" else "TikTok Shop")
        cur.execute("""
            INSERT INTO marketplace_accounts (platform, shop_name, cookies, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
        """, (platform, shop_name, full_cookies, now_vn, now_vn))
        acc_id = cur.lastrowid

    conn.commit()
    conn.close()

    synced_count = 0
    sync_msg = ""
    try:
        if platform == "shopee":
            sync_res = await sync_shopee_orders(MarketplaceOrderSyncRequest(account_id=acc_id, days_back=1))
            synced_count = sync_res.get("synced_orders", 0)
            sync_msg = sync_res.get("message", "")
    except Exception as e:
        sync_msg = str(e)

    return {
        "status": "ok",
        "account_id": acc_id,
        "synced_orders": synced_count,
        "message": f"Đã tự động nạp Cookie cho {platform.upper()}! {sync_msg}"
    }

@router.put("/accounts/{account_id}")
def update_account(account_id: int, req: MarketplaceAccountUpdate, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM marketplace_accounts WHERE id = ?", (account_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản gian hàng")

    updates = []
    params = []
    if req.shop_name is not None:
        updates.append("shop_name = ?")
        params.append(req.shop_name.strip())
    if req.cookies is not None:
        updates.append("cookies = ?")
        params.append(req.cookies.strip())
    if req.extra_config is not None:
        updates.append("extra_config = ?")
        params.append(req.extra_config)
    if req.is_active is not None:
        updates.append("is_active = ?")
        params.append(req.is_active)

    updates.append("updated_at = ?")
    params.append(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    params.append(account_id)

    cur.execute(f"UPDATE marketplace_accounts SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã cập nhật thông tin gian hàng"}

@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM marketplace_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã xóa gian hàng"}

# ─────────────────────────────────────────────────────────────────
# 1b. PANCAKE (POSCAKE pos.pages.fm) — API key + shop_id, đồng bộ đơn, hoa hồng NV bán
# ─────────────────────────────────────────────────────────────────
def _pancake_account(cur, account_id: int):
    cur.execute("SELECT * FROM marketplace_accounts WHERE id = ? AND platform = 'pancake'", (account_id,))
    acc = cur.fetchone()
    if not acc:
        raise HTTPException(status_code=404, detail="Không tìm thấy shop Pancake")
    try:
        shop_id = str(json.loads(acc["extra_config"] or "{}").get("shop_id") or "").strip()
    except ValueError:
        shop_id = ""
    if not shop_id or not (acc["cookies"] or "").strip():
        raise HTTPException(status_code=400, detail=f"Shop [{acc['shop_name']}] chưa nhập đủ Shop ID và API Key")
    return acc, shop_id, acc["cookies"].strip()


def _parse_day(s: str) -> datetime.datetime:
    try:
        return datetime.datetime.strptime(s.strip().replace("/", "-"), "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Ngày không hợp lệ: {s} (cần YYYY-MM-DD)")


@router.post("/pancake/test")
async def test_pancake_connection(req: PancakeTestRequest, user=Depends(get_optional_user)):
    key = (req.api_key or "").strip()
    if not key and req.account_id:
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT cookies FROM marketplace_accounts WHERE id = ? AND platform = 'pancake'", (req.account_id,))
            r = cur.fetchone()
            key = (r["cookies"] or "").strip() if r else ""
        finally:
            conn.close()
    if not key or not req.shop_id.strip():
        return {"status": "error", "message": "Cần nhập Shop ID và API Key"}
    now = int(datetime.datetime.now().timestamp())
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(f"{pancake_svc.BASE_URL}/shops/{req.shop_id.strip()}/orders",
                                   params={"api_key": key, "page": 1, "page_size": 1,
                                           "startDateTime": now - 30 * 86400, "endDateTime": now})
        data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if res.status_code != 200 or not data.get("success"):
            return {"status": "error", "message": f"POSCAKE từ chối: {data.get('message') or res.status_code}"}
        return {"status": "ok", "message": f"Kết nối thành công! 30 ngày qua có {data.get('total_entries', 0)} đơn."}
    except Exception as e:
        return {"status": "error", "message": f"Lỗi kết nối POSCAKE: {e}"}


@router.post("/pancake/sync")
async def sync_pancake_orders(req: PancakeSyncRequest, user=Depends(get_optional_user)):
    d_from, d_to = _parse_day(req.date_from), _parse_day(req.date_to)
    if d_to < d_from:
        raise HTTPException(status_code=400, detail="Ngày kết thúc phải sau ngày bắt đầu")
    if (d_to - d_from).days > 92:
        raise HTTPException(status_code=400, detail="Mỗi lần đồng bộ tối đa 3 tháng")
    conn = get_db()
    cur = conn.cursor()
    try:
        if req.account_id:
            ids = [req.account_id]
        else:
            cur.execute("SELECT id FROM marketplace_accounts WHERE platform = 'pancake' AND is_active = 1 ORDER BY id")
            ids = [r[0] for r in cur.fetchall()]
        if not ids:
            raise HTTPException(status_code=400, detail="Chưa có shop Pancake nào. Bấm 'Thêm shop' để nhập Shop ID + API Key")
        accounts = [_pancake_account(cur, i) for i in ids]
    finally:
        conn.close()

    # Ngày theo giờ VN -> unix (POSCAKE lọc theo thời điểm tạo đơn)
    vn = datetime.timezone(datetime.timedelta(hours=7))
    start_unix = int(d_from.replace(tzinfo=vn).timestamp())
    end_unix = int(d_to.replace(hour=23, minute=59, second=59, tzinfo=vn).timestamp())
    results, total_orders, total_items = [], 0, 0
    for acc, shop_id, key in accounts:
        try:
            raw = await pancake_svc.fetch_orders(shop_id, key, start_unix, end_unix)
        except Exception as e:
            logger.error(f"Pancake sync shop {acc['shop_name']}: {e}")
            results.append(f"{acc['shop_name']}: lỗi {e}")
            continue
        conn = get_db()
        cur = conn.cursor()
        try:
            r = pancake_svc.save_orders(cur, acc["id"], raw)
            cur.execute("UPDATE marketplace_accounts SET last_sync_at = ? WHERE id = ?",
                        (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), acc["id"]))
            conn.commit()
        finally:
            conn.close()
        total_orders += r["orders"]
        total_items += r["items"]
        results.append(f"{acc['shop_name']}: {r['orders']} đơn")
    return {"status": "ok", "synced_orders": total_orders, "synced_items": total_items,
            "message": "Đồng bộ Pancake xong — " + "; ".join(results)}


@router.get("/pancake/sellers")
def list_pancake_sellers(date_from: str, date_to: str, user=Depends(get_optional_user)):
    _parse_day(date_from), _parse_day(date_to)
    conn = get_db()
    try:
        cur = conn.cursor()
        return {"sellers": pancake_svc.seller_summary(cur, date_from, date_to),
                "default_rules": pancake_svc.load_default_rules(cur)}
    finally:
        conn.close()


@router.put("/pancake/sellers")
def update_pancake_seller(req: PancakeSellerUpdate, user=Depends(require_role("owner", "accountant"))):
    conn = get_db()
    cur = conn.cursor()
    if req.staff_id:
        cur.execute("SELECT 1 FROM staff WHERE id = ?", (req.staff_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")
    rules = json.dumps(req.rules.model_dump()) if req.rules else None
    cur.execute("""INSERT INTO pancake_sellers (seller_name, staff_id, rules_json) VALUES (?, ?, ?)
                   ON CONFLICT(seller_name) DO UPDATE SET staff_id = excluded.staff_id, rules_json = excluded.rules_json""",
                (req.seller_name.strip(), req.staff_id or None, rules))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã lưu cài đặt cho [{req.seller_name}]"}


@router.put("/pancake/rules")
def update_pancake_rules(req: PancakeCommissionRules, user=Depends(require_role("owner", "accountant"))):
    conn = get_db()
    cur = conn.cursor()
    val = json.dumps(req.model_dump())
    cur.execute("INSERT INTO settings (key, value) VALUES ('pancake_commission_rules', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (val, val))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã lưu công thức hoa hồng chung"}


# ─────────────────────────────────────────────────────────────────
# 2. ĐỒNG BỘ ĐƠN HÀNG TỪ SHOPEE & TIKTOK SHOP
# ─────────────────────────────────────────────────────────────────
@router.post("/shopee/test-connection")
async def test_shopee_connection(req: ShopeeTestConnectionRequest, user=Depends(get_optional_user)):
    spc_cds, cookie_header = parse_shopee_session(req.cookies)
    if not cookie_header and req.cookies:
        cookie_header = req.cookies

    if not spc_cds:
        return {
            "status": "error",
            "message": "Không tìm thấy token SPC_CDS. Vui lòng copy cURL từ Network hoặc copy mã token SPC_CDS!"
        }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie_header,
        "Referer": "https://banhang.shopee.vn/portal/sale/order",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*"
    }

    url_index = f"https://banhang.shopee.vn/api/v3/order/search_order_list_index?SPC_CDS={spc_cds}&SPC_CDS_VER=2"
    payload_index = {
        "order_list_tab": 100,
        "entity_type": 1,
        "pagination": {"from_page_number": 1, "page_number": 1, "page_size": 10},
        "filter": {}
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url_index, headers=headers, json=payload_index)
            if res.status_code != 200:
                return {
                    "status": "error",
                    "message": f"Shopee phản hồi mã HTTP {res.status_code}: {res.text[:200]}"
                }
            data = res.json()
            if data.get("code") != 0 and data.get("code") is not None:
                msg = data.get("user_message") or data.get("message") or f"Lỗi Shopee code {data.get('code')}"
                return {
                    "status": "error",
                    "message": f"Shopee từ chối phiên: {msg}"
                }
            
            index_list = data.get("data", {}).get("index_list", [])
            total_orders = data.get("data", {}).get("total", len(index_list))
            return {
                "status": "ok",
                "message": f"Kết nối Shopee thành công! Tìm thấy {total_orders} đơn trong danh sách.",
                "spc_cds": spc_cds
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Lỗi kết nối tới server Shopee: {str(e)}"
        }

@router.post("/shopee/sync")
async def sync_shopee_orders(req: MarketplaceOrderSyncRequest, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM marketplace_accounts WHERE id = ? AND platform = 'shopee'", (req.account_id,))
    acc = cur.fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Shopee")

    cookies = acc["cookies"] or ""
    spc_cds, cookie_header = parse_shopee_session(cookies)
    if not cookie_header and cookies:
        cookie_header = cookies

    if not spc_cds:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Chưa tìm thấy mã token SPC_CDS của Shopee. Vui lòng dán chuỗi cURL (hoặc token SPC_CDS) vào ô cấu hình!"
        )

    # Lấy luật ánh xạ hiện tại để tự động map
    cur.execute("SELECT platform_sku, platform_item_name, platform_variation, product_id FROM marketplace_sku_mappings WHERE platform = 'shopee'")
    mappings = [dict(r) for r in cur.fetchall()]

    synced_orders = 0
    synced_items = 0
    last_error = ""
    touched_ids = set()

    # Duyệt qua các tab trạng thái Shopee (100: to_ship, 200: shipping, 300: completed, 400: cancelled)
    tabs_to_fetch = [req.order_tab] if req.order_tab else [100, 200, 300, 400]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie_header,
        "Referer": "https://banhang.shopee.vn/portal/sale/order",
        "Origin": "https://banhang.shopee.vn",
        "X-Shopee-Language": "vi",
        "X-Region": "vn",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for tab_code in tabs_to_fetch:
            try:
                # Bước 1: Search index
                url_index = f"https://banhang.shopee.vn/api/v3/order/search_order_list_index?SPC_CDS={spc_cds}&SPC_CDS_VER=2"
                payload_index = {
                    "order_list_tab": tab_code,
                    "entity_type": 1,
                    "pagination": {"from_page_number": 1, "page_number": 1, "page_size": 40},
                    "filter": {}
                }
                res_idx = await client.post(url_index, headers=headers, json=payload_index)
                if res_idx.status_code != 200:
                    last_error = f"Shopee HTTP {res_idx.status_code}: {res_idx.text[:150]}"
                    continue
                data_idx = res_idx.json()
                if data_idx.get("code") != 0 and data_idx.get("code") is not None:
                    last_error = data_idx.get("user_message") or data_idx.get("message") or f"Lỗi Shopee code {data_idx.get('code')}"
                    continue

                index_list = data_idx.get("data", {}).get("index_list", [])
                if not index_list:
                    continue

                # Bước 2: Get card details
                url_cards = f"https://banhang.shopee.vn/api/v3/order/get_order_list_card_list?SPC_CDS={spc_cds}&SPC_CDS_VER=2"
                payload_cards = {
                    "order_list_tab": tab_code,
                    "need_count_down_desc": False,
                    "order_param_list": index_list
                }
                res_cards = await client.post(url_cards, headers=headers, json=payload_cards)
                if res_cards.status_code != 200:
                    last_error = f"Shopee Cards HTTP {res_cards.status_code}: {res_cards.text[:150]}"
                    continue
                card_list = res_cards.json().get("data", {}).get("card_list", [])

                for entry in card_list:
                    c = entry.get("order_card") or entry.get("package_level_order_card") or entry
                    if not isinstance(c, dict):
                        continue
                    header = c.get("card_header", {})
                    order_sn = header.get("order_sn") or str(c.get("order_id", "")) or str(entry.get("order_sn", ""))
                    if not order_sn:
                        continue

                    order_status = header.get("status_desc") or str(tab_code)
                    buyer_username = header.get("buyer_user_name", "") or str(c.get("buyer_user_name", ""))
                    order_timestamp = header.get("create_time") or c.get("create_time") or datetime.datetime.now().timestamp()
                    try:
                        ts_val = float(order_timestamp)
                        if ts_val > 1e11:
                            ts_val = ts_val / 1000
                        order_date = datetime.datetime.fromtimestamp(ts_val).strftime("%Y-%m-%d %H:%M:%S")
                    except Exception:
                        order_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    total_price = float(c.get("total_price", 0.0) or header.get("total_price", 0.0) or c.get("final_total", 0.0) or 0.0)

                    # Lưu hoặc cập nhật đơn
                    cur.execute("""
                        INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount, buyer_username, raw_payload)
                        VALUES ('shopee', ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(platform, order_sn) DO UPDATE SET
                            order_status = excluded.order_status,
                            total_amount = excluded.total_amount,
                            updated_at = CURRENT_TIMESTAMP
                    """, (req.account_id, order_sn, order_status, order_date, total_price, buyer_username, json.dumps(c, ensure_ascii=False)))
                    
                    cur.execute("SELECT id FROM marketplace_orders WHERE platform = 'shopee' AND order_sn = ?", (order_sn,))
                    order_db_id = cur.fetchone()[0]
                    touched_ids.add(order_db_id)
                    synced_orders += 1

                    # Bóc tách mặt hàng
                    groups = []
                    if c.get("item_info_group") and c["item_info_group"].get("item_info_list"):
                        groups = c["item_info_group"]["item_info_list"]
                    elif c.get("package_list"):
                        for pkg in c["package_list"]:
                            if pkg.get("item_info_group") and pkg["item_info_group"].get("item_info_list"):
                                groups.extend(pkg["item_info_group"]["item_info_list"])
                    elif c.get("item_list"):
                        groups = c.get("item_list")

                    cur.execute("DELETE FROM marketplace_order_items WHERE order_id = ?", (order_db_id,))
                    for it in groups:
                        p_name = it.get("name") or it.get("item_name") or "Sản phẩm Shopee"
                        raw_desc = it.get("description") or it.get("model_name") or ""
                        p_var = re.sub(r"^Variation:\s*", "", str(raw_desc), flags=re.I).strip()
                        qty = float(it.get("amount") or it.get("quantity") or 1.0)
                        u_price = float(it.get("item_price", 0.0) or it.get("price", 0.0) or 0.0)
                        sub_amt = qty * u_price
                        p_sku = p_var or str(it.get("item_id", ""))

                        # Tự động map sản phẩm
                        mapped_pid = None
                        for m in mappings:
                            if m["platform_item_name"].lower() == p_name.lower():
                                if not m["platform_variation"] or m["platform_variation"].lower() == p_var.lower():
                                    mapped_pid = m["product_id"]
                                    break
                            elif m["platform_sku"] and m["platform_sku"].lower() == p_sku.lower():
                                mapped_pid = m["product_id"]
                                break

                        cur.execute("""
                            INSERT INTO marketplace_order_items (
                                order_id, platform_item_id, platform_product_name, platform_variation,
                                platform_sku, quantity, unit_price, subtotal, mapped_product_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (order_db_id, str(it.get("item_id", "")), p_name, p_var, p_sku, qty, u_price, sub_amt, mapped_pid))
                        synced_items += 1

            except Exception as e:
                logger.error(f"Lỗi sync Shopee tab {tab_code}: {e}")
                last_error = str(e)

    if synced_orders == 0:
        if last_error:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Shopee phản hồi lỗi: {last_error}. Vui lòng thử copy lại cURL từ Network!"
            )
        else:
            now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("UPDATE marketplace_accounts SET last_sync_at = ? WHERE id = ?", (now_vn, req.account_id))
            conn.commit()
            conn.close()
            return {
                "status": "ok",
                "synced_orders": 0,
                "synced_items": 0,
                "message": "Đã quét các tab Shopee (Chờ giao, Đang giao, Đã giao) nhưng hiện không tìm thấy đơn hàng nào. Hãy kiểm tra trạng thái đơn trên Shopee hoặc dùng tính năng Dán JSON Đơn Hàng!"
            }

    sync_orders_stock(cur, touched_ids)
    now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("UPDATE marketplace_accounts SET last_sync_at = ? WHERE id = ?", (now_vn, req.account_id))
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "synced_orders": synced_orders,
        "synced_items": synced_items,
        "message": f"Đã đồng bộ thành công {synced_orders} đơn hàng Shopee ({synced_items} mặt hàng)!"
    }

@router.post("/orders/import-json")
def import_orders_json(req: MarketplaceOrderJsonImportRequest, user=Depends(get_optional_user)):
    try:
        raw_text = req.raw_json.strip()
        data = json.loads(raw_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu JSON không hợp lệ: {str(e)}")

    card_list = []
    if isinstance(data, list):
        card_list = data
    elif isinstance(data, dict):
        if "data" in data and isinstance(data["data"], dict) and "card_list" in data["data"]:
            card_list = data["data"]["card_list"]
        elif "card_list" in data:
            card_list = data["card_list"]
        elif "order_card" in data or "card_header" in data:
            card_list = [data]
        elif "data" in data and isinstance(data["data"], list):
            card_list = data["data"]

    if not card_list:
        raise HTTPException(status_code=400, detail="Không tìm thấy danh sách đơn hàng trong JSON. Vui lòng kiểm tra lại cấu trúc dữ liệu!")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT platform_sku, platform_item_name, platform_variation, product_id FROM marketplace_sku_mappings WHERE platform = ?", (req.platform.lower(),))
    mappings = [dict(r) for r in cur.fetchall()]

    synced_orders = 0
    synced_items = 0
    touched_ids = set()

    for entry in card_list:
        c = entry.get("order_card") or entry.get("package_level_order_card") or entry
        if not isinstance(c, dict):
            continue
        header = c.get("card_header") or {}
        order_sn = header.get("order_sn") or str(c.get("order_id", "")) or str(entry.get("order_sn", ""))
        if not order_sn:
            continue

        order_status = header.get("status_desc") or str(c.get("order_status", "Đang xử lý"))
        buyer_username = header.get("buyer_user_name", "") or str(c.get("buyer_user_name", ""))
        order_timestamp = header.get("create_time") or c.get("create_time") or datetime.datetime.now().timestamp()
        try:
            ts_val = float(order_timestamp)
            if ts_val > 1e11:
                ts_val = ts_val / 1000
            order_date = datetime.datetime.fromtimestamp(ts_val).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            order_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        total_price = float(c.get("total_price", 0.0) or header.get("total_price", 0.0) or c.get("final_total", 0.0) or 0.0)

        cur.execute("""
            INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount, buyer_username, raw_payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(platform, order_sn) DO UPDATE SET
                order_status = excluded.order_status,
                total_amount = excluded.total_amount,
                updated_at = CURRENT_TIMESTAMP
        """, (req.platform.lower(), req.account_id, order_sn, order_status, order_date, total_price, buyer_username, json.dumps(c, ensure_ascii=False)))

        cur.execute("SELECT id FROM marketplace_orders WHERE platform = ? AND order_sn = ?", (req.platform.lower(), order_sn))
        order_db_id = cur.fetchone()[0]
        touched_ids.add(order_db_id)
        synced_orders += 1

        groups = []
        if c.get("item_info_group") and c["item_info_group"].get("item_info_list"):
            groups = c["item_info_group"]["item_info_list"]
        elif c.get("package_list"):
            for pkg in c["package_list"]:
                if pkg.get("item_info_group") and pkg["item_info_group"].get("item_info_list"):
                    groups.extend(pkg["item_info_group"]["item_info_list"])
        elif c.get("item_list"):
            groups = c.get("item_list")

        cur.execute("DELETE FROM marketplace_order_items WHERE order_id = ?", (order_db_id,))
        for it in groups:
            p_name = it.get("name") or it.get("item_name") or "Sản phẩm Shopee"
            raw_desc = it.get("description") or it.get("model_name") or ""
            p_var = re.sub(r"^Variation:\s*", "", str(raw_desc), flags=re.I).strip()
            qty = float(it.get("amount") or it.get("quantity") or 1.0)
            u_price = float(it.get("item_price", 0.0) or it.get("price", 0.0) or 0.0)
            sub_amt = qty * u_price
            p_sku = p_var or str(it.get("item_id", ""))

            mapped_pid = None
            for m in mappings:
                if m["platform_item_name"].lower() == p_name.lower():
                    if not m["platform_variation"] or m["platform_variation"].lower() == p_var.lower():
                        mapped_pid = m["product_id"]
                        break
                elif m["platform_sku"] and m["platform_sku"].lower() == p_sku.lower():
                    mapped_pid = m["product_id"]
                    break

            cur.execute("""
                INSERT INTO marketplace_order_items (
                    order_id, platform_item_id, platform_product_name, platform_variation,
                    platform_sku, quantity, unit_price, subtotal, mapped_product_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (order_db_id, str(it.get("item_id", "")), p_name, p_var, p_sku, qty, u_price, sub_amt, mapped_pid))
            synced_items += 1

    sync_orders_stock(cur, touched_ids)
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "synced_orders": synced_orders,
        "synced_items": synced_items,
        "message": f"Đã nhập thành công {synced_orders} đơn hàng ({synced_items} mặt hàng) vào hệ thống!"
    }

@router.post("/tiktok/sync")
async def sync_tiktok_orders(req: MarketplaceOrderSyncRequest, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM marketplace_accounts WHERE id = ? AND platform = 'tiktok'", (req.account_id,))
    acc = cur.fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản TikTok Shop")

    cookies = acc["cookies"] or ""
    if not cookies:
        conn.close()
        raise HTTPException(status_code=400, detail="Vui lòng cấu hình Cookie / Token phiên TikTok Seller Center!")

    now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("UPDATE marketplace_accounts SET last_sync_at = ? WHERE id = ?", (now_vn, req.account_id))
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "synced_orders": 0,
        "synced_items": 0,
        "message": "Đã kết nối phiên TikTok Shop thành công! Sẵn sàng đồng bộ dữ liệu."
    }

@router.post("/orders/import-excel")
async def import_orders_excel(
    file: UploadFile = File(...),
    platform: str = Form("shopee"),
    account_id: Optional[int] = Form(None),
    user=Depends(get_optional_user)
):
    import io
    import openpyxl

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="File tải lên bị rỗng")

    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        sheet = wb.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể đọc file Excel (.xlsx): {str(e)}")

    rows = list(sheet.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="File Excel không có dữ liệu đơn hàng (ít hơn 2 dòng)")

    # Tìm dòng tiêu đề
    header_row_idx = 0
    headers = []
    for idx, r in enumerate(rows[:5]):
        str_cells = [str(c).strip().lower() for c in r if c is not None]
        if any("đơn hàng" in c or "order" in c for c in str_cells):
            header_row_idx = idx
            headers = [str(c).strip() if c is not None else "" for c in r]
            break

    if not headers:
        headers = [str(c).strip() if c is not None else "" for c in rows[0]]

    # Map cột tự động (dùng NFC để chuẩn hóa tiếng Việt)
    import unicodedata
    col_map = {}
    for idx, h in enumerate(headers):
        h_norm = unicodedata.normalize('NFC', h.lower().strip())
        if "mã đơn hàng đầy đủ" in h_norm:
            col_map["order_sn"] = idx
        elif "mã đơn hàng" in h_norm and "order_sn" not in col_map:
            col_map["order_sn"] = idx
        elif h_norm in ("order id", "order_id", "mã đơn", "order number"):
            col_map.setdefault("order_sn", idx)
        elif "mã vận đơn" in h_norm or h_norm in ("tracking number", "tracking_no", "tracking_number"):
            col_map.setdefault("tracking_number", idx)
        elif "tên sản phẩm" in h_norm or h_norm in ("product name",):
            col_map["product_name"] = idx
        elif "sản phẩm" in h_norm and "chi tiết" not in h_norm and "mã" not in h_norm and "product_name" not in col_map:
            col_map.setdefault("product_name", idx)
        elif "sku phân loại hàng" in h_norm or "mã sku phân loại" in h_norm or "variation sku" in h_norm:
            col_map["sku_variation"] = idx
        elif "sku sản phẩm" in h_norm or "mã sku sản phẩm" in h_norm or "product sku" in h_norm:
            col_map["sku_product"] = idx
        elif h_norm in ("sku", "mã hàng", "seller sku"):
            col_map.setdefault("sku_variation", idx)
        elif "tên phân loại hàng" in h_norm or h_norm in ("phân loại", "mẫu mã", "variation", "thuộc tính từng sản phẩm"):
            col_map.setdefault("variation", idx)
        elif "số lượng" in h_norm and "hoàn trả" not in h_norm and "trả hàng" not in h_norm:
            col_map.setdefault("quantity", idx)
        elif h_norm in ("quantity", "sl"):
            col_map.setdefault("quantity", idx)
        elif "sku subtotal after discount" in h_norm:
            col_map["subtotal_after_discount"] = idx
        elif "sku seller discount" in h_norm:
            col_map.setdefault("shop_voucher", idx)
        elif "giá ưu đãi" in h_norm or h_norm in ("đơn giá sau giảm giá", "giá sp"):
            col_map["unit_price"] = idx
        elif "đơn giá" in h_norm and "unit_price" not in col_map:
            col_map["unit_price"] = idx
        elif h_norm in ("unit price", "price", "sku unit original price"):
            col_map.setdefault("unit_price", idx)
        elif "order amount" in h_norm:
            col_map["total_amount"] = idx
        elif "tổng số tiền" in h_norm or "tổng giá trị đơn hàng" in h_norm or "trị giá đơn hàng" in h_norm:
            col_map.setdefault("total_amount", idx)
        elif "trạng thái" in h_norm or h_norm in ("order status", "trạng thái vc"):
            col_map.setdefault("status", idx)
        elif "ngày đặt hàng" in h_norm or "thời điểm tạo đơn" in h_norm or "ngày tạo đơn" in h_norm:
            col_map.setdefault("order_date", idx)
        elif h_norm in ("created time", "order date"):
            col_map.setdefault("order_date", idx)
        elif h_norm in ("người mua", "buyer username", "username"):
            col_map["buyer"] = idx
        elif "người mua" in h_norm and not any(k in h_norm for k in ("thanh toán", "trả", "nhận xét", "tiền")):
            col_map.setdefault("buyer", idx)
        elif "phí cố định" in h_norm:
            col_map.setdefault("fee_fixed", idx)
        elif "phí dịch vụ" in h_norm:
            col_map.setdefault("fee_service", idx)
        elif "phí xử lý giao dịch" in h_norm or "phí thanh toán" in h_norm:
            col_map.setdefault("fee_payment", idx)
        elif "mã giảm giá của shop" in h_norm and "shopee" not in h_norm:
            col_map.setdefault("shop_voucher", idx)
        elif "giảm giá từ combo của shop" in h_norm and "shopee" not in h_norm:
            col_map.setdefault("combo_voucher", idx)
        elif "phí vận chuyển (dự kiến)" in h_norm or "phí vận chuyển mà người mua trả" in h_norm:
            col_map.setdefault("shipping_fee", idx)

    if "order_sn" not in col_map or "product_name" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=f"Không nhận diện được cột Mã Đơn Hàng hoặc Tên Sản Phẩm trong file Excel. Các cột tìm thấy: {', '.join(headers[:10])}"
        )

    # Đọc dữ liệu gom nhóm theo đơn hàng
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT platform_sku, platform_item_name, platform_variation, product_id FROM marketplace_sku_mappings WHERE platform = ?", (platform.lower(),))
    mappings = [dict(r) for r in cur.fetchall()]

    orders_dict = {}
    for r in rows[header_row_idx + 1:]:
        if not any(r):
            continue
        # Bỏ qua dòng chú thích mô tả cột của TikTok (dòng 2 có 'Platform unique order ID')
        if any("platform unique order id" in str(c).lower() or "current order status" in str(c).lower() for c in r if c is not None):
            continue

        raw_sn = r[col_map["order_sn"]] if col_map["order_sn"] < len(r) else None
        if not raw_sn:
            continue
        order_sn = str(raw_sn).strip()
        if not order_sn or order_sn == "None":
            continue

        raw_prod = r[col_map["product_name"]] if col_map["product_name"] < len(r) else ""
        prod_name = str(raw_prod or "").strip()
        if not prod_name or prod_name == "None":
            continue

        raw_var = r[col_map["variation"]] if "variation" in col_map and col_map["variation"] < len(r) else ""
        variation = str(raw_var or "").strip() if raw_var != "None" else ""

        sku_v = str(r[col_map["sku_variation"]] or "").strip() if "sku_variation" in col_map and col_map["sku_variation"] < len(r) else ""
        sku_p = str(r[col_map["sku_product"]] or "").strip() if "sku_product" in col_map and col_map["sku_product"] < len(r) else ""
        effective_sku = sku_v or sku_p
        if effective_sku == "None":
            effective_sku = ""

        tracking_no = str(r[col_map["tracking_number"]] or "").strip() if "tracking_number" in col_map and col_map["tracking_number"] < len(r) else ""
        if tracking_no == "None":
            tracking_no = ""

        raw_qty = r[col_map["quantity"]] if "quantity" in col_map and col_map["quantity"] < len(r) else 1
        try:
            qty = float(raw_qty or 1.0)
        except Exception:
            qty = 1.0

        raw_price = r[col_map["unit_price"]] if "unit_price" in col_map and col_map["unit_price"] < len(r) else 0
        try:
            unit_price = float(raw_price or 0.0)
        except Exception:
            unit_price = 0.0

        # Nếu có cột Thành tiền sau chiết khấu (TikTok), tính lại đơn giá
        if "subtotal_after_discount" in col_map and col_map["subtotal_after_discount"] < len(r):
            try:
                sub_disc = float(r[col_map["subtotal_after_discount"]] or 0.0)
                if sub_disc > 0 and qty > 0:
                    unit_price = sub_disc / qty
            except Exception:
                pass

        raw_total = r[col_map["total_amount"]] if "total_amount" in col_map and col_map["total_amount"] < len(r) else 0
        try:
            total_amount = float(raw_total or (qty * unit_price))
        except Exception:
            total_amount = qty * unit_price

        raw_status = r[col_map["status"]] if "status" in col_map and col_map["status"] < len(r) else "Đã hoàn thành"
        order_status = str(raw_status or "Đã hoàn thành").strip()

        raw_buyer = r[col_map["buyer"]] if "buyer" in col_map and col_map["buyer"] < len(r) else ""
        buyer = str(raw_buyer or "").strip() if raw_buyer != "None" else ""

        raw_date = r[col_map["order_date"]] if "order_date" in col_map and col_map["order_date"] < len(r) else None
        order_date_str = ""
        if isinstance(raw_date, datetime.datetime):
            order_date_str = raw_date.strftime("%Y-%m-%d %H:%M:%S")
        elif isinstance(raw_date, datetime.date):
            order_date_str = f"{raw_date.strftime('%Y-%m-%d')} 00:00:00"
        elif raw_date:
            s_date = str(raw_date).strip()
            # Bắt dạng 01/09/2026 23:50:39 (TikTok) hoặc 01/09/2026
            m_vn = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?))?", s_date)
            if m_vn:
                d, m, y, t = m_vn.groups()
                time_part = t if t else "00:00:00"
                if len(time_part.split(":")) == 2:
                    time_part += ":00"
                order_date_str = f"{y}-{m.zfill(2)}-{d.zfill(2)} {time_part}"
            else:
                order_date_str = s_date
        if not order_date_str:
            order_date_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        fee_fixed = float(r[col_map["fee_fixed"]] or 0.0) if "fee_fixed" in col_map and col_map["fee_fixed"] < len(r) else 0.0
        fee_service = float(r[col_map["fee_service"]] or 0.0) if "fee_service" in col_map and col_map["fee_service"] < len(r) else 0.0
        fee_payment = float(r[col_map["fee_payment"]] or 0.0) if "fee_payment" in col_map and col_map["fee_payment"] < len(r) else 0.0
        shop_vouch = float(r[col_map["shop_voucher"]] or 0.0) if "shop_voucher" in col_map and col_map["shop_voucher"] < len(r) else 0.0
        combo_vouch = float(r[col_map["combo_voucher"]] or 0.0) if "combo_voucher" in col_map and col_map["combo_voucher"] < len(r) else 0.0
        ship_fee = float(r[col_map["shipping_fee"]] or 0.0) if "shipping_fee" in col_map and col_map["shipping_fee"] < len(r) else 0.0

        if order_sn not in orders_dict:
            orders_dict[order_sn] = {
                "order_sn": order_sn,
                "status": order_status,
                "order_date": order_date_str,
                "total_amount": total_amount,
                "buyer": buyer,
                "tracking_number": tracking_no,
                "fee_fixed": fee_fixed,
                "fee_service": fee_service,
                "fee_payment": fee_payment,
                "shop_voucher": shop_vouch + combo_vouch,
                "shipping_fee": ship_fee,
                "items": []
            }
        else:
            if tracking_no and not orders_dict[order_sn]["tracking_number"]:
                orders_dict[order_sn]["tracking_number"] = tracking_no
            if fee_fixed > orders_dict[order_sn]["fee_fixed"]:
                orders_dict[order_sn]["fee_fixed"] = fee_fixed
            if fee_service > orders_dict[order_sn]["fee_service"]:
                orders_dict[order_sn]["fee_service"] = fee_service
            if fee_payment > orders_dict[order_sn]["fee_payment"]:
                orders_dict[order_sn]["fee_payment"] = fee_payment
            if (shop_vouch + combo_vouch) > orders_dict[order_sn]["shop_voucher"]:
                orders_dict[order_sn]["shop_voucher"] = shop_vouch + combo_vouch
            if total_amount > orders_dict[order_sn]["total_amount"]:
                orders_dict[order_sn]["total_amount"] = total_amount

        orders_dict[order_sn]["items"].append({
            "product_name": prod_name,
            "variation": variation,
            "sku": effective_sku,
            "quantity": qty,
            "unit_price": unit_price,
            "subtotal": qty * unit_price
        })

    synced_orders = 0
    synced_items = 0
    touched_ids = set()

    # Tải trước bảng mã SKU sản phẩm vào RAM 1 lần (tránh N câu SELECT trong vòng lặp 2.000 đơn)
    cur.execute("SELECT id, UPPER(TRIM(code)) AS ucode FROM products WHERE is_active = 1 AND code IS NOT NULL AND TRIM(code) != ''")
    products_by_code = {r["ucode"]: r["id"] for r in cur.fetchall()}

    plat_lower = platform.lower()
    order_rows_to_upsert = []
    for sn, o in orders_dict.items():
        item_total = sum(it["subtotal"] for it in o["items"])
        total_fee = o["fee_fixed"] + o["fee_service"] + o["fee_payment"]
        net_payout = max(0.0, item_total - o["shop_voucher"] - total_fee)
        gross_total = item_total if item_total > 0 else o["total_amount"]
        order_rows_to_upsert.append((
            plat_lower, account_id, sn, o["status"], o["order_date"],
            gross_total, o["shipping_fee"], o["fee_fixed"], o["fee_service"], o["fee_payment"],
            o["shop_voucher"], net_payout, o["buyer"], o["tracking_number"]
        ))

    upsert_order_sql = """
        INSERT INTO marketplace_orders (
            platform, account_id, order_sn, order_status, order_date,
            total_amount, shipping_fee, fee_fixed, fee_service, fee_payment,
            shop_voucher, net_payout, buyer_username, tracking_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, order_sn) DO UPDATE SET
            order_status = excluded.order_status,
            total_amount = excluded.total_amount,
            shipping_fee = excluded.shipping_fee,
            fee_fixed = excluded.fee_fixed,
            fee_service = excluded.fee_service,
            fee_payment = excluded.fee_payment,
            shop_voucher = excluded.shop_voucher,
            net_payout = excluded.net_payout,
            tracking_number = COALESCE(excluded.tracking_number, marketplace_orders.tracking_number),
            updated_at = CURRENT_TIMESTAMP
    """
    chunk_size = 200
    for i in range(0, len(order_rows_to_upsert), chunk_size):
        cur.executemany(upsert_order_sql, order_rows_to_upsert[i:i + chunk_size])

    # Lấy map order_sn -> id theo từng lô 200 đơn
    all_sns = list(orders_dict.keys())
    sn_to_id = {}
    for i in range(0, len(all_sns), chunk_size):
        sn_chunk = all_sns[i:i + chunk_size]
        ph = ",".join("?" for _ in sn_chunk)
        cur.execute(
            f"SELECT order_sn, id FROM marketplace_orders WHERE platform = ? AND order_sn IN ({ph})",
            (plat_lower, *sn_chunk),
        )
        for r in cur.fetchall():
            sn_to_id[r["order_sn"]] = r["id"]

    all_order_ids = list(sn_to_id.values())
    for i in range(0, len(all_order_ids), chunk_size):
        id_chunk = all_order_ids[i:i + chunk_size]
        ph = ",".join("?" for _ in id_chunk)
        cur.execute(f"DELETE FROM marketplace_order_items WHERE order_id IN ({ph})", tuple(id_chunk))

    item_rows_to_insert = []
    for sn, o in orders_dict.items():
        order_db_id = sn_to_id.get(sn)
        if not order_db_id:
            continue
        touched_ids.add(order_db_id)
        synced_orders += 1

        for it in o["items"]:
            p_name = it["product_name"]
            p_var = it["variation"]
            p_sku = it["sku"]
            qty = it["quantity"]
            u_price = it["unit_price"]
            sub_amt = it["subtotal"]

            # Ánh xạ sản phẩm từ bộ nhớ đệm
            mapped_pid = None
            if p_sku:
                mapped_pid = products_by_code.get(p_sku.strip().upper())

            if not mapped_pid:
                for m in mappings:
                    if m.get("platform_sku") and p_sku and m["platform_sku"].strip().lower() == p_sku.lower():
                        mapped_pid = m["product_id"]
                        break
                    elif m["platform_item_name"].lower() == p_name.lower():
                        if not m["platform_variation"] or m["platform_variation"].lower() == p_var.lower():
                            mapped_pid = m["product_id"]
                            break

            item_rows_to_insert.append((order_db_id, p_name, p_var, p_sku, qty, u_price, sub_amt, mapped_pid))
            synced_items += 1

    insert_item_sql = """
        INSERT INTO marketplace_order_items (
            order_id, platform_product_name, platform_variation,
            platform_sku, quantity, unit_price, subtotal, mapped_product_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    for i in range(0, len(item_rows_to_insert), chunk_size):
        cur.executemany(insert_item_sql, item_rows_to_insert[i:i + chunk_size])

    sync_orders_stock(cur, touched_ids)
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "synced_orders": synced_orders,
        "synced_items": synced_items,
        "message": f"Đã nhập thành công {synced_orders} đơn hàng ({synced_items} mặt hàng) từ file Excel!"
    }

# ─────────────────────────────────────────────────────────────────
# 3. DANH SÁCH ĐƠN HÀNG SÀN & CHI TIẾT
# ─────────────────────────────────────────────────────────────────
def _build_order_filter_sql(
    platform: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    where = ""
    params = []
    if date_from:
        where += " AND date(o.order_date) >= date(?)"
        params.append(date_from)
    if date_to:
        where += " AND date(o.order_date) <= date(?)"
        params.append(date_to)
    if platform and platform != "all":
        where += " AND o.platform = ?"
        params.append(platform.lower())
    if date:
        where += " AND date(o.order_date) = date(?)"
        params.append(date)
    if status and status != "all":
        where += " AND o.order_status = ?"
        params.append(status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        where += " AND (o.order_sn LIKE ? OR o.buyer_username LIKE ? OR o.tracking_number LIKE ? OR o.seller_name LIKE ?)"
        params.extend([term, term, term, term])
    return where, params

@router.get("/orders-kpi")
def get_marketplace_orders_kpi(
    platform: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    """Thống kê KPI sàn TMĐT độc lập trên toàn bộ CSDL theo bộ lọc (không bị giới hạn bởi phân trang)."""
    conn = get_db()
    cur = conn.cursor()
    where, params = _build_order_filter_sql(platform, date, status, q, date_from, date_to)

    cur.execute(f"""
        SELECT 
            COUNT(*) as order_count,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(net_payout), 0) as total_net_payout,
            COALESCE(SUM(COALESCE(fee_fixed, 0) + COALESCE(fee_service, 0) + COALESCE(fee_payment, 0) + COALESCE(shop_voucher, 0)), 0) as total_fee
        FROM marketplace_orders o
        WHERE 1=1 {where}
    """, tuple(params))
    r_orders = dict(cur.fetchone() or {})

    cur.execute(f"""
        SELECT 
            COALESCE(SUM(i.quantity), 0) as items_sold,
            COALESCE(SUM(CASE WHEN i.mapped_product_id IS NOT NULL THEN i.quantity ELSE 0 END), 0) as mapped_items
        FROM marketplace_order_items i
        WHERE i.order_id IN (
            SELECT o.id FROM marketplace_orders o WHERE 1=1 {where}
        )
    """, tuple(params))
    r_items = dict(cur.fetchone() or {})
    conn.close()

    items_sold = r_items.get("items_sold", 0)
    mapped_items = r_items.get("mapped_items", 0)
    mapped_ratio = round((mapped_items / items_sold) * 100) if items_sold > 0 else 100

    return {
        "order_count": r_orders.get("order_count", 0),
        "total_revenue": r_orders.get("total_revenue", 0),
        "total_net_payout": r_orders.get("total_net_payout", 0),
        "total_fee": r_orders.get("total_fee", 0),
        "items_sold": items_sold,
        "mapped_items": mapped_items,
        "mapped_ratio": mapped_ratio
    }

@router.get("/orders")
def list_marketplace_orders(
    platform: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    page: Optional[int] = None,
    limit: int = 50,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    conn = get_db()
    cur = conn.cursor()
    where, params = _build_order_filter_sql(platform, date, status, q, date_from, date_to)

    total_count = 0
    if page is not None:
        cur.execute(f"SELECT COUNT(*) FROM marketplace_orders o WHERE 1=1 {where}", tuple(params))
        total_count = cur.fetchone()[0]

    query = f"""
        SELECT o.*, a.shop_name,
               (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as item_count,
               (SELECT SUM(quantity) FROM marketplace_order_items WHERE order_id = o.id) as total_qty,
               (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id AND mapped_product_id IS NOT NULL) as mapped_count
        FROM marketplace_orders o
        LEFT JOIN marketplace_accounts a ON o.account_id = a.id
        WHERE 1=1 {where}
        ORDER BY o.order_date DESC, o.id DESC
    """

    exec_params = list(params)
    if page is not None:
        p = max(1, page)
        lim = max(1, min(limit, 200))
        offset = (p - 1) * lim
        query += " LIMIT ? OFFSET ?"
        exec_params.extend([lim, offset])
    else:
        lim = max(1, min(limit, 200))
        query += " LIMIT ?"
        exec_params.append(lim)

    cur.execute(query, tuple(exec_params))
    orders = [dict(r) for r in cur.fetchall()]

    # Batch load items (loại bỏ N+1 query)
    order_ids = [o["id"] for o in orders]
    items_by_order = {oid: [] for oid in order_ids}
    if order_ids:
        placeholders = ",".join("?" for _ in order_ids)
        cur.execute(f"""
            SELECT i.*, p.name as pos_product_name, p.code as pos_product_code, p.unit as pos_unit
            FROM marketplace_order_items i
            LEFT JOIN products p ON i.mapped_product_id = p.id
            WHERE i.order_id IN ({placeholders})
            ORDER BY i.id ASC
        """, order_ids)
        for it in cur.fetchall():
            it_dict = dict(it)
            items_by_order[it_dict["order_id"]].append(it_dict)

    for ord_item in orders:
        ord_item["items"] = items_by_order.get(ord_item["id"], [])

    conn.close()

    if page is not None:
        lim = max(1, min(limit, 200))
        total_pages = (total_count + lim - 1) // lim if lim > 0 else 1
        return {
            "orders": orders,
            "total": total_count,
            "page": max(1, page),
            "limit": lim,
            "total_pages": total_pages
        }

    return orders

@router.delete("/orders/{order_id}")
def delete_marketplace_order(order_id: int, user=Depends(require_role("owner"))):
    """Xóa 1 đơn hàng sàn và chi tiết mặt hàng liên quan."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT order_sn FROM marketplace_orders WHERE id = ?", (order_id,))
    o = cur.fetchone()
    if not o:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    sync_order_stock(cur, order_id, force_zero=True)  # xóa đơn -> cộng lại kho đã trừ
    cur.execute("DELETE FROM marketplace_order_items WHERE order_id = ?", (order_id,))
    cur.execute("DELETE FROM marketplace_orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã xóa đơn hàng {o['order_sn']}"}

@router.post("/orders/bulk-delete")
def bulk_delete_marketplace_orders(req: MarketplaceOrderBulkDeleteRequest, user=Depends(require_role("owner"))):
    """Xóa hàng loạt các đơn hàng sàn theo danh sách ID."""
    if not req.order_ids:
        return {"status": "ok", "deleted_count": 0}

    conn = get_db()
    cur = conn.cursor()
    placeholders = ",".join(["?"] * len(req.order_ids))
    sync_orders_stock(cur, req.order_ids, force_zero=True)
    cur.execute(f"DELETE FROM marketplace_order_items WHERE order_id IN ({placeholders})", req.order_ids)
    cur.execute(f"DELETE FROM marketplace_orders WHERE id IN ({placeholders})", req.order_ids)
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return {"status": "ok", "deleted_count": affected, "message": f"Đã xóa thành công {affected} đơn hàng"}

@router.delete("/orders-clear-all")
def clear_all_marketplace_orders(platform: Optional[str] = None, user=Depends(require_role("owner"))):
    """Dọn sạch toàn bộ đơn hàng sàn (theo platform hoặc tất cả)."""
    conn = get_db()
    cur = conn.cursor()
    if platform and platform != "all":
        cur.execute("SELECT id FROM marketplace_orders WHERE platform = ?", (platform.lower(),))
    else:
        cur.execute("SELECT id FROM marketplace_orders")
    sync_orders_stock(cur, [r[0] for r in cur.fetchall()], force_zero=True)
    if platform and platform != "all":
        cur.execute("DELETE FROM marketplace_order_items WHERE order_id IN (SELECT id FROM marketplace_orders WHERE platform = ?)", (platform.lower(),))
        cur.execute("DELETE FROM marketplace_orders WHERE platform = ?", (platform.lower(),))
        msg = f"Đã xóa sạch toàn bộ đơn hàng của sàn {platform.upper()}"
    else:
        cur.execute("DELETE FROM marketplace_order_items")
        cur.execute("DELETE FROM marketplace_orders")
        msg = "Đã xóa sạch toàn bộ đơn hàng của tất cả các sàn"
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return {"status": "ok", "deleted_count": affected, "message": msg}

# ─────────────────────────────────────────────────────────────────
# 4. ÁNH XẠ SẢN PHẨM SÀN -> SẢN PHẨM KHO POS
# ─────────────────────────────────────────────────────────────────
@router.get("/mappings")
def list_sku_mappings(platform: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT m.*, p.code as pos_code, p.name as pos_name, p.unit as pos_unit, p.stock as pos_stock
        FROM marketplace_sku_mappings m
        JOIN products p ON m.product_id = p.id
        WHERE 1=1
    """
    params = []
    if platform and platform != "all":
        query += " AND m.platform = ?"
        params.append(platform)
    query += " ORDER BY m.id DESC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/mappings")
def save_sku_mapping(req: MarketplaceSkuMapCreate, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO marketplace_sku_mappings (platform, platform_sku, platform_item_name, platform_variation, product_id, is_auto)
        VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(platform, platform_sku, platform_item_name, platform_variation) DO UPDATE SET
            product_id = excluded.product_id,
            is_auto = 0
    """, (req.platform.lower(), (req.platform_sku or "").strip(), req.platform_item_name.strip(), (req.platform_variation or "").strip(), req.product_id))

    # Cập nhật ngay các order_items cũ đang có tên này
    cur.execute("""
        UPDATE marketplace_order_items 
        SET mapped_product_id = ?
        WHERE platform_product_name = ? AND (? = '' OR platform_variation = ?)
          AND order_id IN (SELECT id FROM marketplace_orders WHERE platform = ?)
    """, (req.product_id, req.platform_item_name.strip(), (req.platform_variation or "").strip(), (req.platform_variation or "").strip(), req.platform.lower()))
    cur.execute("""SELECT DISTINCT i.order_id FROM marketplace_order_items i JOIN marketplace_orders o ON o.id = i.order_id
                   WHERE o.platform = ? AND i.platform_product_name = ? AND (? = '' OR i.platform_variation = ?)""",
                (req.platform.lower(), req.platform_item_name.strip(), (req.platform_variation or "").strip(), (req.platform_variation or "").strip()))
    sync_orders_stock(cur, [r[0] for r in cur.fetchall()])

    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã ánh xạ sản phẩm [{req.platform_item_name}] vào kho POS thành công!"}

@router.delete("/mappings/{mapping_id}")
def delete_sku_mapping(mapping_id: int, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM marketplace_sku_mappings WHERE id = ?", (mapping_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã xóa luật ánh xạ"}

@router.get("/unmapped-items")
def list_unmapped_items():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT i.platform_product_name, i.platform_variation, i.platform_sku, o.platform,
               COUNT(i.id) as order_count, SUM(i.quantity) as total_sold_qty
        FROM marketplace_order_items i
        JOIN marketplace_orders o ON i.order_id = o.id
        WHERE i.mapped_product_id IS NULL
        GROUP BY i.platform_product_name, i.platform_variation, i.platform_sku, o.platform
        ORDER BY total_sold_qty DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/auto-map")
def auto_map_unmapped_items(user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, code FROM products WHERE is_active = 1")
    pos_prods = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT DISTINCT i.platform_product_name, i.platform_variation, i.platform_sku, o.platform
        FROM marketplace_order_items i
        JOIN marketplace_orders o ON i.order_id = o.id
        WHERE i.mapped_product_id IS NULL
    """)
    unmapped = [dict(r) for r in cur.fetchall()]

    mapped_count = 0
    for u in unmapped:
        target_name = u["platform_product_name"].lower()
        matched_id = None
        for p in pos_prods:
            p_name = p["name"].lower()
            if p_name in target_name or target_name in p_name:
                matched_id = p["id"]
                break
        if matched_id:
            cur.execute("""
                INSERT OR IGNORE INTO marketplace_sku_mappings (platform, platform_sku, platform_item_name, platform_variation, product_id, is_auto)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (u["platform"], u["platform_sku"] or "", u["platform_product_name"], u["platform_variation"] or "", matched_id))
            cur.execute("""
                UPDATE marketplace_order_items 
                SET mapped_product_id = ?
                WHERE platform_product_name = ? AND mapped_product_id IS NULL
                  AND order_id IN (SELECT id FROM marketplace_orders WHERE platform = ?)
            """, (matched_id, u["platform_product_name"], u["platform"]))
            cur.execute("""SELECT DISTINCT i.order_id FROM marketplace_order_items i JOIN marketplace_orders o ON o.id = i.order_id
                           WHERE o.platform = ? AND i.platform_product_name = ?""", (u["platform"], u["platform_product_name"]))
            sync_orders_stock(cur, [r[0] for r in cur.fetchall()])
            mapped_count += 1

    conn.commit()
    conn.close()
    return {"status": "ok", "auto_mapped_count": mapped_count, "message": f"AI đã tự động gợi ý và ánh xạ {mapped_count} mặt hàng!"}

# ─────────────────────────────────────────────────────────────────
# 5. BÁO CÁO SẢN LƯỢNG BÁN TRONG NGÀY (DAILY SALES COUNT) & AI CHAT
# ─────────────────────────────────────────────────────────────────
@router.get("/analytics/daily-products")
def get_daily_products_analytics(date: Optional[str] = None):
    target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
    conn = get_db()
    cur = conn.cursor()

    # Thống kê trên từng sản phẩm kho POS
    cur.execute("""
        SELECT p.id, p.name, p.code, p.unit, p.stock, p.sell_price,
               -- Bán tại quầy POS
               COALESCE((
                   SELECT SUM(oi.quantity)
                   FROM order_items oi
                   JOIN orders o ON oi.order_id = o.id
                   WHERE oi.product_id = p.id AND date(o.created_at) = date(?) AND o.status != 'cancelled'
               ), 0) as pos_qty,
               -- Bán trên Shopee
               COALESCE((
                   SELECT SUM(mi.quantity)
                   FROM marketplace_order_items mi
                   JOIN marketplace_orders mo ON mi.order_id = mo.id
                   WHERE mi.mapped_product_id = p.id AND mo.platform = 'shopee' AND date(mo.order_date) = date(?) AND mo.order_status NOT LIKE '%hủy%'
               ), 0) as shopee_qty,
               -- Bán trên TikTok Shop
               COALESCE((
                   SELECT SUM(mi.quantity)
                   FROM marketplace_order_items mi
                   JOIN marketplace_orders mo ON mi.order_id = mo.id
                   WHERE mi.mapped_product_id = p.id AND mo.platform = 'tiktok' AND date(mo.order_date) = date(?) AND mo.order_status NOT LIKE '%hủy%'
               ), 0) as tiktok_qty
        FROM products p
        WHERE p.type = 'product' AND p.is_active = 1
        ORDER BY (pos_qty + shopee_qty + tiktok_qty) DESC, p.name ASC
    """, (target_date, target_date, target_date))

    items = []
    total_all_qty = 0
    total_pos_qty = 0
    total_shopee_qty = 0
    total_tiktok_qty = 0

    for r in cur.fetchall():
        d = dict(r)
        d["total_qty"] = d["pos_qty"] + d["shopee_qty"] + d["tiktok_qty"]
        if d["total_qty"] > 0:
            total_all_qty += d["total_qty"]
            total_pos_qty += d["pos_qty"]
            total_shopee_qty += d["shopee_qty"]
            total_tiktok_qty += d["tiktok_qty"]
            items.append(d)

    conn.close()
    return {
        "date": target_date,
        "summary": {
            "total_sold_qty": total_all_qty,
            "pos_sold_qty": total_pos_qty,
            "shopee_sold_qty": total_shopee_qty,
            "tiktok_sold_qty": total_tiktok_qty,
            "unique_products_sold": len(items)
        },
        "items": items
    }

@router.post("/ai-analytics")
async def chat_marketplace_ai(req: MarketplaceAIChatRequest):
    target_date = req.date or datetime.datetime.now().strftime("%Y-%m-%d")
    daily_data = get_daily_products_analytics(target_date)

    # Đọc cấu hình Gemini từ bảng settings
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    row = cur.fetchone()
    conn.close()

    api_key = row[0].strip() if row and row[0] else ""

    summary_str = f"Ngày thống kê: {target_date}\n"
    summary_str += f"- Tổng sản phẩm bán toàn hệ thống: {daily_data['summary']['total_sold_qty']}\n"
    summary_str += f"- Quầy POS: {daily_data['summary']['pos_sold_qty']}\n"
    summary_str += f"- Shopee: {daily_data['summary']['shopee_sold_qty']}\n"
    summary_str += f"- TikTok Shop: {daily_data['summary']['tiktok_sold_qty']}\n\n"
    summary_str += "Chi tiết sản phẩm bán ra:\n"
    for item in daily_data["items"][:20]:
        summary_str += f"- {item['name']} ({item['code']}): Tổng {item['total_qty']} {item['unit']} (POS: {item['pos_qty']}, Shopee: {item['shopee_qty']}, TikTok: {item['tiktok_qty']}) | Tồn kho còn: {item['stock']}\n"

    system_instruction = (
        "Bạn là Trợ lý AI Phân tích Doanh số & Đa kênh Bán Hàng chuyên nghiệp của hệ thống POS Mastercare PetCare. "
        "Dưới đây là số liệu bán hàng thực tế trong ngày trích xuất từ POS, Shopee và TikTok Shop. "
        "Hãy phân tích sắc bén, chỉ ra sản phẩm bán chạy nhất, kênh bán hiệu quả nhất, cảnh báo sản phẩm nào sắp hết hàng (tồn kho thấp) "
        "và trả lời câu hỏi của người dùng một cách trực quan, ngắn gọn, có cấu trúc bullet point rõ ràng."
    )

    if not api_key:
        # Fallback offline rule-based response nếu chưa có API key
        top_item = daily_data["items"][0] if daily_data["items"] else None
        top_name = f"{top_item['name']} ({top_item['total_qty']} {top_item['unit']})" if top_item else "Chưa có"
        reply = (
            f"📊 **BÁO CÁO NHANH DOANH SỐ ĐA KÊNH NGÀY {target_date}:**\n\n"
            f"• **Tổng sản lượng bán ra:** **{daily_data['summary']['total_sold_qty']}** sản phẩm.\n"
            f"  - 🏬 Tại quầy POS: {daily_data['summary']['pos_sold_qty']} sản phẩm\n"
            f"  - 🟠 Sàn Shopee: {daily_data['summary']['shopee_sold_qty']} sản phẩm\n"
            f"  - ⚫ TikTok Shop: {daily_data['summary']['tiktok_sold_qty']} sản phẩm\n\n"
            f"• **Sản phẩm bán chạy nhất:** **{top_name}**\n\n"
            f"*(Để kích hoạt AI phân tích chuyên sâu tự động, vui lòng nhập Gemini API Key trong phần Cài Đặt AI)*"
        )
        return {"reply": reply, "data": daily_data}

    # Gọi Gemini 2.5 Flash
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [
                {"text": f"{system_instruction}\n\nDỮ LIỆU BÁN HÀNG:\n{summary_str}\n\nCÂU HỎI NGƯỜI DÙNG: {req.prompt}"}
            ]
        }],
        "generationConfig": {"temperature": 0.2}
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(url, headers={"Content-Type": "application/json"}, json=payload)
            if res.status_code == 200:
                data = res.json()
                reply_text = data["candidates"][0]["content"]["parts"][0]["text"]
                return {"reply": reply_text, "data": daily_data}
            else:
                logger.error(f"Gemini API error: {res.text}")
                return {"reply": f"Lỗi gọi AI: {res.text[:150]}", "data": daily_data}
    except Exception as e:
        logger.error(f"AI Call error: {e}")
        return {"reply": f"Không thể kết nối AI: {str(e)}", "data": daily_data}


# ─────────────────────────────────────────────────────────────────
# 5. QUẢN LÝ KOC / KOL, LINK VIDEO TIKTOK & TÍNH HOA HỒNG
# ─────────────────────────────────────────────────────────────────
@router.post("/koc/inspect-sheet")
def inspect_koc_sheet(req: KocInspectSheetRequest, user=Depends(get_optional_user)):
    try:
        try:
            sheet_id, xlsx_bytes = koc_svc.download_sheet_xlsx_bytes(req.sheet_url, use_cache=True)
        except TypeError:
            sheet_id, xlsx_bytes = koc_svc.download_sheet_xlsx_bytes(req.sheet_url)
        tabs = koc_svc.inspect_workbook_tabs(xlsx_bytes)
        return {"status": "ok", "sheet_id": sheet_id, "tabs": tabs}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không đọc được Google Sheet: {e}")


@router.post("/koc/inspect-columns")
def inspect_koc_sheet_columns(req: KocInspectColumnsRequest, user=Depends(get_optional_user)):
    if not (req.tab_name or "").strip():
        raise HTTPException(status_code=400, detail="Vui lòng chọn Tab cần đọc cột")
    try:
        try:
            _, xlsx_bytes = koc_svc.download_sheet_xlsx_bytes(req.sheet_url, use_cache=True)
        except TypeError:
            _, xlsx_bytes = koc_svc.download_sheet_xlsx_bytes(req.sheet_url)
        info = koc_svc.inspect_sheet_tab_columns(xlsx_bytes, req.tab_name)
        return {"status": "ok", **info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không đọc được danh sách cột của Tab: {e}")


@router.get("/koc/sources")
def list_koc_sources(month: Optional[str] = None, user=Depends(get_optional_user)):
    conn = get_db()
    try:
        cur = conn.cursor()
        koc_svc.ensure_koc_schema(cur)
        res = koc_svc.list_sources_summary(cur, month=month)
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/koc/sources")
def save_koc_source(req: KocSourceSaveRequest, user=Depends(get_optional_user)):
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", (req.month or "").strip()):
        raise HTTPException(status_code=400, detail="Tháng phải có định dạng YYYY-MM")
    try:
        sheet_id = koc_svc.extract_sheet_id(req.sheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    name = (req.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên nguồn / chiến dịch bắt buộc")

    rules_json = json.dumps(req.rules.model_dump()) if req.rules else None
    col_map_json: Optional[str] = None
    if req.column_mapping is not None:
        cleaned_cm = {
            k: (v or "").strip().upper()
            for k, v in req.column_mapping.model_dump().items()
            if (v or "").strip()
        }
        col_map_json = json.dumps(cleaned_cm) if cleaned_cm else ""

    koc_tab = (req.koc_tab_name or "").strip()
    vid_tab = (req.video_tab_name or "").strip()
    month_val = req.month.strip()

    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        if req.staff_id:
            cur.execute("SELECT 1 FROM staff WHERE id = ?", (req.staff_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

        target_id = req.id
        merged_from_dup = False
        if not target_id:
            # Chống đẻ dòng chiến dịch trùng khi cùng (sheet_id, month) & trùng Tab hoặc trùng Tên chiến dịch
            in_tab_key = (koc_tab or vid_tab).strip().lower()
            cur.execute("""
                SELECT ks.id, ks.name, ks.koc_tab_name, ks.video_tab_name, ks.rules_json, ks.staff_id,
                       (SELECT COUNT(*) FROM koc_videos kv WHERE kv.source_id = ks.id) AS vid_cnt,
                       (SELECT COUNT(*) FROM koc_videos kv WHERE kv.source_id = ks.id AND COALESCE(kv.manual_kpi, 0) != 0) AS man_cnt
                FROM koc_sources ks
                WHERE ks.is_active = 1 AND ks.sheet_id = ? AND ks.month = ?
            """, (sheet_id, month_val))
            candidates = []
            for r in cur.fetchall():
                ex_tabs = {
                    (r["koc_tab_name"] or "").strip().lower(),
                    (r["video_tab_name"] or "").strip().lower(),
                } - {""}
                same_tab = bool(in_tab_key and in_tab_key in ex_tabs)
                same_name_empty_tab = (r["name"] or "").strip().lower() == name.lower() and (not in_tab_key or not ex_tabs or same_tab)
                if same_tab or same_name_empty_tab:
                    candidates.append(dict(r))
            if candidates:
                # Ưu tiên giữ dòng đã có dữ liệu video / đã chấm KPI tay
                candidates.sort(key=lambda x: (x["man_cnt"], x["vid_cnt"], -x["id"]), reverse=True)
                best = candidates[0]
                target_id = best["id"]
                merged_from_dup = True
                if rules_json is None and best.get("rules_json"):
                    rules_json = best["rules_json"]
                if not req.staff_id and best.get("staff_id"):
                    req.staff_id = best["staff_id"]
                # Tự động dọn các dòng bị trùng rỗng (0 video) của cùng chiến dịch này
                for extra in candidates[1:]:
                    if extra["vid_cnt"] == 0 and extra["man_cnt"] == 0:
                        cur.execute("DELETE FROM koc_profiles WHERE source_id = ?", (extra["id"],))
                        cur.execute("DELETE FROM koc_sources WHERE id = ?", (extra["id"],))

        if target_id:
            if col_map_json is not None:
                cur.execute("""
                    UPDATE koc_sources
                    SET name = ?, sheet_url = ?, sheet_id = ?, month = ?, staff_id = ?,
                        koc_tab_name = ?, video_tab_name = ?, column_mapping_json = ?, rules_json = ?
                    WHERE id = ?
                """, (
                    name, req.sheet_url.strip(), sheet_id, month_val, req.staff_id,
                    koc_tab, vid_tab, col_map_json, rules_json, target_id
                ))
            else:
                cur.execute("""
                    UPDATE koc_sources
                    SET name = ?, sheet_url = ?, sheet_id = ?, month = ?, staff_id = ?,
                        koc_tab_name = ?, video_tab_name = ?, rules_json = ?
                    WHERE id = ?
                """, (
                    name, req.sheet_url.strip(), sheet_id, month_val, req.staff_id,
                    koc_tab, vid_tab, rules_json, target_id
                ))
            src_id = target_id
        else:
            cur.execute("""
                INSERT INTO koc_sources (name, sheet_url, sheet_id, month, staff_id, koc_tab_name, video_tab_name, column_mapping_json, rules_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                name, req.sheet_url.strip(), sheet_id, month_val, req.staff_id,
                koc_tab, vid_tab, col_map_json or "", rules_json
            ))
            src_id = cur.lastrowid
        conn.commit()
        msg = f"Đã cập nhật vào chiến dịch [{name}] hiện có (chống trùng dòng)" if merged_from_dup else f"Đã lưu nguồn KOC [{name}]"
        return {"status": "ok", "id": src_id, "merged_existing": merged_from_dup, "message": msg}
    finally:
        conn.close()


@router.delete("/koc/sources/{source_id}")
def delete_koc_source(source_id: int, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        cur.execute("DELETE FROM koc_videos WHERE source_id = ?", (source_id,))
        cur.execute("DELETE FROM koc_profiles WHERE source_id = ?", (source_id,))
        cur.execute("DELETE FROM koc_sources WHERE id = ?", (source_id,))
        conn.commit()
        return {"status": "ok", "message": "Đã xóa nguồn KOC"}
    finally:
        conn.close()


@router.put("/koc/rules")
def update_default_koc_rules(req: KocCommissionRulesIn, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        data = req.model_dump()
        cur.execute("INSERT INTO settings (key, value) VALUES ('koc_commission_rules', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (json.dumps(data),))
        conn.commit()
        return {"status": "ok", "rules": data}
    finally:
        conn.close()


@router.post("/koc/sources/{source_id}/sync")
def sync_koc_source(source_id: int, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        cur.execute("SELECT * FROM koc_sources WHERE id = ?", (source_id,))
        src = cur.fetchone()
        if not src:
            raise HTTPException(status_code=404, detail="Không tìm thấy nguồn KOC")
        _, xlsx_bytes = koc_svc.download_sheet_xlsx_bytes(src["sheet_url"])
        res = koc_svc.sync_source_from_xlsx_bytes(cur, source_id, xlsx_bytes)
        conn.commit()
        col_txt = f" cột {res['video_col']}" if res.get("video_col") else ""
        dup_txt = (
            f" (từ {res['raw_links_found']} link{col_txt}, gộp {res['dup_links_in_sheet']} link dán trùng)"
            if res.get("dup_links_in_sheet", 0) > 0
            else (f" (đọc{col_txt})" if col_txt else "")
        )
        return {
            "status": "ok",
            **res,
            "message": f"Đã đồng bộ {res['profiles_synced']} KOC & {res['videos_synced']} video duy nhất{dup_txt}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi đồng bộ Google Sheet: {e}")
    finally:
        conn.close()


@router.get("/koc/profiles")
def list_koc_profiles(source_id: Optional[int] = None, month: Optional[str] = None, q: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        sql = """
            SELECT kp.*, ks.name AS source_name, ks.month, s.name AS staff_name,
                   (SELECT COUNT(*) FROM koc_videos kv WHERE kv.source_id = kp.source_id AND LOWER(kv.koc_username) = LOWER(kp.koc_username)) AS actual_videos,
                   (SELECT COALESCE(SUM(kv.views), 0) FROM koc_videos kv WHERE kv.source_id = kp.source_id AND LOWER(kv.koc_username) = LOWER(kp.koc_username)) AS total_views
            FROM koc_profiles kp
            JOIN koc_sources ks ON ks.id = kp.source_id
            LEFT JOIN staff s ON s.id = ks.staff_id
            WHERE ks.is_active = 1
        """
        params = []
        if source_id:
            sql += " AND kp.source_id = ?"
            params.append(source_id)
        if month:
            sql += " AND ks.month = ?"
            params.append(month)
        if q and q.strip():
            kw = f"%{q.strip()}%"
            sql += " AND (kp.koc_username LIKE ? OR kp.product_sample LIKE ? OR kp.contact_info LIKE ? OR kp.note LIKE ?)"
            params.extend([kw, kw, kw, kw])
        sql += " ORDER BY total_views DESC, kp.videos_returned DESC, kp.id ASC"
        cur.execute(sql, tuple(params))
        return {"profiles": [dict(r) for r in cur.fetchall()]}
    finally:
        conn.close()


@router.get("/koc/videos")
def list_koc_videos(
    source_id: Optional[int] = None,
    month: Optional[str] = None,
    kpi_filter: Optional[str] = "all",
    q: Optional[str] = None,
):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        res = koc_svc.list_enriched_videos(cur, source_id=source_id, month=month, kpi_filter=kpi_filter or "all", q=q)
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/koc/videos")
def add_manual_koc_videos(req: KocManualVideoAddRequest, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        cur.execute("SELECT id FROM koc_sources WHERE id = ?", (req.source_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy nguồn/chiến dịch KOC")
        urls = koc_svc.TIKTOK_URL_RE.findall(req.urls_text or "")
        if not urls:
            raise HTTPException(status_code=400, detail="Không tìm thấy link TikTok hợp lệ nào")
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        added = 0
        for u in urls:
            if not koc_svc.is_tiktok_video_url(u):
                continue
            vkey = koc_svc.extract_video_key(u)
            author = (req.koc_username or "").strip().lstrip("@/") or koc_svc.extract_username(u)
            pub_dt = koc_svc.extract_tiktok_publish_time(u)
            cur.execute("""
                INSERT INTO koc_videos (source_id, video_key, video_url, koc_username, views, product_note, status, published_at, updated_at, is_manual_added)
                VALUES (?, ?, ?, ?, 0, ?, 'Chưa quét view', ?, ?, 1)
                ON CONFLICT(source_id, video_key) DO UPDATE SET
                    video_url = excluded.video_url,
                    is_manual_added = 1,
                    published_at = CASE WHEN excluded.published_at != '' THEN excluded.published_at ELSE koc_videos.published_at END,
                    product_note = CASE WHEN excluded.product_note != '' THEN excluded.product_note ELSE koc_videos.product_note END
            """, (req.source_id, vkey, u, author, (req.product_note or "").strip(), pub_dt, now_str))
            if author:
                cur.execute("""
                    INSERT INTO koc_profiles (source_id, koc_username, channel_url, product_sample, approval_status, videos_returned, updated_at)
                    VALUES (?, ?, ?, ?, 'DUYỆT', 1, ?)
                    ON CONFLICT(source_id, koc_username) DO NOTHING
                """, (req.source_id, author, f"https://www.tiktok.com/@{author}", (req.product_note or "").strip(), now_str))
            added += 1
        conn.commit()
        return {"status": "ok", "added": added, "message": f"Đã thêm {added} link video TikTok"}
    finally:
        conn.close()


@router.post("/koc/videos/bulk-kpi")
def bulk_update_koc_video_kpi(req: KocBulkKpiRequest, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        if (req.mode or "").strip().lower() == "top1_zero_koc":
            data = koc_svc.list_enriched_videos(cur, source_id=req.source_id, month=req.month, kpi_filter="all")
            best_by_koc = {}
            for v in data.get("videos") or []:
                if (v.get("koc_auto_qual") or 0) + (v.get("koc_manual_qual") or 0) > 0:
                    continue
                if v.get("kpi_state") != "under_kpi":
                    continue
                uname = (v.get("koc_username") or "").strip().lstrip("@/").lower()
                if not uname:
                    continue
                key = (int(v["source_id"]), uname)
                cand_score = (int(v.get("views") or 0), str(v.get("published_at") or ""), -int(v["id"]))
                prev = best_by_koc.get(key)
                if prev is None or cand_score > prev[0]:
                    best_by_koc[key] = (cand_score, int(v["id"]))
            target_ids = [vid for _, vid in best_by_koc.values()]
            if target_ids:
                ph = ",".join("?" for _ in target_ids)
                cur.execute(f"UPDATE koc_videos SET manual_kpi = 1 WHERE id IN ({ph})", tuple(target_ids))
                conn.commit()
            return {
                "status": "ok",
                "updated": len(target_ids),
                "video_ids": target_ids,
                "manual_kpi": 1,
                "message": (
                    f"Đã tự động chọn duyệt 1 video view cao nhất cho {len(target_ids)} kênh KOC đang 0 bài đạt!"
                    if target_ids else "Không còn kênh KOC nào đang 0 bài đạt cần gợi ý."
                ),
            }

        ids = [int(x) for x in (req.video_ids or []) if x]
        if not ids:
            raise HTTPException(status_code=400, detail="Chưa chọn video nào")
        ph = ",".join("?" for _ in ids)
        cur.execute(f"UPDATE koc_videos SET manual_kpi = ? WHERE id IN ({ph})", (req.manual_kpi, *ids))
        conn.commit()
        return {
            "status": "ok",
            "updated": len(ids),
            "video_ids": ids,
            "manual_kpi": req.manual_kpi,
        }
    finally:
        conn.close()


@router.put("/koc/videos/{video_id}")
def update_koc_video(video_id: int, req: KocVideoUpdateRequest, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
            UPDATE koc_videos
            SET views = COALESCE(?, views),
                status = COALESCE(?, status),
                product_note = COALESCE(?, product_note),
                manual_kpi = COALESCE(?, manual_kpi),
                updated_at = CASE WHEN ? IS NOT NULL THEN ? ELSE updated_at END
            WHERE id = ?
        """, (req.views, req.status, req.product_note, req.manual_kpi, req.views, now_str, video_id))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@router.delete("/koc/videos/{video_id}")
def delete_koc_video(video_id: int, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM koc_videos WHERE id = ?", (video_id,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@router.post("/koc/sources/{source_id}/refresh-views")
async def refresh_koc_source_views(
    source_id: int,
    only_zero: bool = False,
    mode: Optional[str] = None,
    after_id: int = 0,
    limit: int = 8,
):
    eff_mode = (mode or ("pending" if only_zero else "all")).strip().lower()
    pending_clause = (
        " AND ( (COALESCE(views, 0) <= 0 AND COALESCE(status, '') != 'Thành công')"
        " OR status LIKE 'Chưa quét%' OR status LIKE 'Lỗi%' OR status LIKE 'Không lấy%' )"
    )
    cond = pending_clause if eff_mode == "pending" else ""
    batch_limit = max(1, min(limit, 80))

    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        cur.execute("SELECT * FROM koc_sources WHERE id = ?", (source_id,))
        src_row = cur.fetchone()
        rules = koc_svc.source_rules(cur, dict(src_row) if src_row else None)
        min_views = int(rules.get("min_views") if rules.get("min_views") is not None else 200)

        cur.execute(
            f"SELECT COUNT(*) FROM koc_videos WHERE source_id = ? AND id > ?{cond}",
            (source_id, max(0, after_id)),
        )
        total_from_cursor = int(cur.fetchone()[0] or 0)

        cur.execute(
            f"SELECT id, video_url, views FROM koc_videos WHERE source_id = ? AND id > ?{cond} ORDER BY id ASC LIMIT ?",
            (source_id, max(0, after_id), batch_limit),
        )
        targets = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    if not targets:
        return {
            "status": "ok",
            "scanned": 0,
            "updated": 0,
            "errors": 0,
            "qualified_in_batch": 0,
            "last_id": after_id,
            "remaining": 0,
            "has_more": False,
            "message": "Không còn video nào cần quét view",
        }

    results = []
    async with httpx.AsyncClient() as client:
        for item in targets:
            res = await koc_svc.fetch_tiktok_video_metrics(item["video_url"], client)
            results.append((item["id"], res))

    updated_count = 0
    error_count = 0
    qualified_in_batch = 0
    last_id = max(t["id"] for t in targets)

    conn = get_db()
    cur = conn.cursor()
    try:
        for vid_id, m in results:
            if m.get("ok"):
                updated_count += 1
                if int(m.get("views") or 0) >= min_views:
                    qualified_in_batch += 1
                cur.execute("""
                    UPDATE koc_videos
                    SET views = ?, likes = ?, comments = ?, shares = ?,
                        title = CASE WHEN ? != '' THEN ? ELSE title END,
                        koc_username = CASE WHEN ? != '' THEN ? ELSE koc_username END,
                        published_at = CASE WHEN ? != '' THEN ? ELSE published_at END,
                        status = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    m["views"], m["likes"], m["comments"], m["shares"],
                    m["title"], m["title"], m["koc_username"], m["koc_username"],
                    m["published_at"], m["published_at"], m["status"], m["updated_at"], vid_id
                ))
            else:
                error_count += 1
                cur.execute("UPDATE koc_videos SET status = ?, updated_at = ? WHERE id = ?",
                            (m.get("status", "Lỗi"), m.get("updated_at", ""), vid_id))
        conn.commit()
    finally:
        conn.close()

    remaining = max(0, total_from_cursor - len(targets))
    return {
        "status": "ok",
        "scanned": len(targets),
        "updated": updated_count,
        "errors": error_count,
        "qualified_in_batch": qualified_in_batch,
        "last_id": last_id,
        "remaining": remaining,
        "has_more": remaining > 0,
        "message": f"Đã quét {len(targets)} video TikTok (cập nhật thành công {updated_count} video)",
    }


@router.get("/koc/export-excel")
def export_koc_commission_excel(
    month: Optional[str] = None,
    source_id: Optional[int] = None,
    kpi_filter: Optional[str] = "all",
    q: Optional[str] = None,
    user=Depends(get_optional_user),
):
    conn = get_db()
    cur = conn.cursor()
    try:
        koc_svc.ensure_koc_schema(cur)
        src_summary = koc_svc.list_sources_summary(cur, month=month or None)
        sources = src_summary["sources"]
        if source_id:
            sources = [s for s in sources if int(s["id"]) == int(source_id)]
        vid_data = koc_svc.list_enriched_videos(
            cur,
            source_id=source_id,
            month=month or None,
            kpi_filter=kpi_filter or "all",
            q=q or None,
        )
        videos = vid_data["videos"]

        prof_sql = """
            SELECT kp.*, ks.name AS source_name, ks.month
            FROM koc_profiles kp
            JOIN koc_sources ks ON ks.id = kp.source_id
            WHERE ks.is_active = 1
        """
        prof_params: list = []
        if source_id:
            prof_sql += " AND kp.source_id = ?"
            prof_params.append(source_id)
        if month:
            prof_sql += " AND ks.month = ?"
            prof_params.append(month)
        prof_sql += " ORDER BY ks.month DESC, kp.id ASC"
        cur.execute(prof_sql, tuple(prof_params))
        profiles = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    wb = openpyxl.Workbook()
    hdr_fill = PatternFill("solid", fgColor="0284C7")
    hdr_font = Font(bold=True, color="FFFFFF")
    tot_fill = PatternFill("solid", fgColor="E0F2FE")
    tot_font = Font(bold=True, color="0F172A")
    title_font = Font(bold=True, size=13, color="0F172A")

    # ── SHEET 1: TỔNG HỢP HOA HỒNG CHIẾN DỊCH ──
    ws1 = wb.active
    ws1.title = "Tổng Hợp Chiến Dịch"
    period_lbl = f"Tháng {month}" if month else "Tất cả các tháng"
    ws1.append([f"BẢNG TÍNH HOA HỒNG VIDEO KOC / KOL — {period_lbl.upper()}"])
    ws1["A1"].font = title_font
    ws1.append([])

    h1 = [
        "STT", "Chiến Dịch / Nguồn", "Tháng", "Tab & Cột Lấy Link",
        "Mã NV", "Nhân Viên Phụ Trách", "Số KOC", "Link Thô Trên Sheet",
        "Tổng Video Duy Nhất", "Đạt View (≥Sàn)", "Duyệt Tay (+KPI)",
        "Tổng Đạt & Duyệt", "Dưới View", "Loại (Trùng/Tháng Cũ)",
        "Trừ KPI", "Bù/Trừ Tay (+/-)", "Video Tính Thưởng", "Đơn Giá (đ)", "Thành Tiền Hoa Hồng (đ)",
    ]
    ws1.append(h1)
    for col_idx in range(1, len(h1) + 1):
        c = ws1.cell(3, col_idx)
        c.fill = hdr_fill
        c.font = hdr_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    sum_koc = sum_raw = sum_vids = sum_auto = sum_man = sum_qual = sum_under = sum_excl = sum_pay = sum_comm = 0
    for idx, s in enumerate(sources, start=1):
        st = s.get("stats") or {}
        rls = s.get("rules") or {}
        sm = s.get("sync_meta") or {}
        tab_lbl = (s.get("koc_tab_name") or s.get("video_tab_name") or "").strip()
        vcol = sm.get("video_col") or (s.get("column_mapping") or {}).get("video_col") or ""
        tab_col_txt = f"{tab_lbl}" + (f" (Cột {vcol})" if vcol else "")
        raw_cnt = int(sm.get("raw_links") or st.get("total_videos") or 0)
        tot_v = int(st.get("total_videos") or 0)
        auto_v = int(st.get("auto_qualified_videos") or 0)
        man_v = int(st.get("manual_approved_videos") or 0)
        qual_v = int(st.get("qualified_videos") or 0)
        under_v = int(st.get("under_kpi_videos") or 0)
        excl_v = int(st.get("excluded_videos") or 0)
        ded_v = int(rls.get("kpi_deduct_videos") or 0)
        adj_v = int(rls.get("manual_adjust_videos") or 0)
        pay_v = int(st.get("payable_videos") or 0)
        rate = round(float(rls.get("rate_per_video") or 10000))
        comm = round(float(st.get("commission") or 0))
        koc_c = int(s.get("koc_count") or st.get("unique_kocs") or 0)

        sum_koc += koc_c
        sum_raw += raw_cnt
        sum_vids += tot_v
        sum_auto += auto_v
        sum_man += man_v
        sum_qual += qual_v
        sum_under += under_v
        sum_excl += excl_v
        sum_pay += pay_v
        sum_comm += comm

        ws1.append([
            idx, s.get("name") or "", s.get("month") or "", tab_col_txt,
            s.get("staff_code") or "", s.get("staff_name") or "Chưa gán",
            koc_c, raw_cnt, tot_v, auto_v, man_v, qual_v, under_v, excl_v,
            ded_v, adj_v, pay_v, rate, comm,
        ])
        r_i = ws1.max_row
        ws1.cell(r_i, 18).number_format = "#,##0"
        ws1.cell(r_i, 19).number_format = "#,##0"

    ws1.append([
        "", "TỔNG CỘNG", "", "", "", "",
        sum_koc, sum_raw, sum_vids, sum_auto, sum_man, sum_qual, sum_under, sum_excl,
        "", "", sum_pay, "", sum_comm,
    ])
    tr1 = ws1.max_row
    for col_idx in range(1, len(h1) + 1):
        c = ws1.cell(tr1, col_idx)
        c.fill = tot_fill
        c.font = tot_font
    ws1.cell(tr1, 19).number_format = "#,##0"
    widths1 = [6, 22, 11, 24, 10, 24, 10, 14, 14, 13, 13, 14, 11, 14, 10, 12, 14, 13, 18]
    for i_w, w_val in enumerate(widths1, start=1):
        ws1.column_dimensions[openpyxl.utils.get_column_letter(i_w)].width = w_val

    # ── SHEET 2: CHI TIẾT LINK VIDEO & KẾT QUẢ KPI ──
    ws2 = wb.create_sheet(title="Chi Tiết Link Video")
    h2 = [
        "STT", "Chiến Dịch", "Tháng", "Kênh KOC", "Link Video TikTok",
        "Sản Phẩm Mẫu", "Tiêu Đề Video", "Ngày Đăng", "Kỳ Hợp Lệ",
        "Lượt Xem", "Mức View Sàn", "Kết Quả KPI", "Duyệt Tay", "Tính Thưởng (1/0)",
        "Tiến Độ Kênh", "Trạng Thái Quét", "Cập Nhật Lúc",
    ]
    ws2.append(h2)
    for col_idx in range(1, len(h2) + 1):
        c = ws2.cell(1, col_idx)
        c.fill = hdr_fill
        c.font = hdr_font

    state_labels = {
        "auto_qualified": "Đạt tự động",
        "manual_approved": "Duyệt tay (+KPI)",
        "under_kpi": "Chưa đạt (< sàn)",
        "excluded_dup": "Loại (Trùng kỳ trước)",
        "excluded_old": "Loại (Tháng cũ)",
        "manual_excluded": "Đã loại tay",
        "error": "Lỗi / Riêng tư",
    }
    by_koc_agg: Dict[tuple, dict] = {}
    for idx, v in enumerate(videos, start=1):
        uname = "@" + str(v.get("koc_username") or "").lstrip("@/") if v.get("koc_username") else ""
        st = v.get("kpi_state") or "under_kpi"
        pub_note = (
            f"Trùng {v.get('dup_month') or 'kỳ trước'}" if v.get("is_dup_prev")
            else (f"Cũ {v.get('pub_month') or ''}" if v.get("is_old_month")
                  else (f"Du di {v.get('pub_month') or ''}" if v.get("is_grace_prev") else "Đúng kỳ"))
        )
        mk = int(v.get("manual_kpi") or 0)
        mk_lbl = "Duyệt (+1)" if mk == 1 else ("Loại (-1)" if mk == -1 else "")
        prog_lbl = f"{v.get('koc_auto_qual', 0)} đạt + {v.get('koc_manual_qual', 0)} duyệt / {v.get('koc_total_videos', 1)}"
        ws2.append([
            idx, v.get("source_name") or "", v.get("month") or "", uname,
            v.get("video_url") or "", v.get("product_note") or "", v.get("title") or "",
            v.get("published_at") or "", pub_note, int(v.get("views") or 0),
            int(v.get("min_views") or 200), state_labels.get(st, st), mk_lbl,
            1 if v.get("is_kpi_counted") else 0, prog_lbl,
            v.get("status") or "", v.get("updated_at") or "",
        ])
        ws2.cell(ws2.max_row, 10).number_format = "#,##0"

        agg_k = (int(v.get("source_id") or 0), str(v.get("koc_username") or "").lstrip("@/").lower())
        rec = by_koc_agg.setdefault(agg_k, {"vids": 0, "auto": 0, "manual": 0, "excl": 0, "views": 0})
        rec["vids"] += 1
        rec["views"] += max(0, int(v.get("views") or 0))
        if st == "auto_qualified":
            rec["auto"] += 1
        elif st == "manual_approved":
            rec["manual"] += 1
        elif st in ("excluded_dup", "excluded_old", "manual_excluded"):
            rec["excl"] += 1

    widths2 = [6, 18, 10, 20, 44, 22, 28, 17, 15, 12, 12, 18, 12, 14, 18, 14, 18]
    for i_w, w_val in enumerate(widths2, start=1):
        ws2.column_dimensions[openpyxl.utils.get_column_letter(i_w)].width = w_val

    # ── SHEET 3: TỔNG HỢP THEO KÊNH @KOC ──
    ws3 = wb.create_sheet(title="Tổng Hợp Theo KOC")
    h3 = [
        "STT", "Chiến Dịch", "Tháng", "Kênh KOC", "Link Kênh", "Follow", "GMV",
        "Sản Phẩm Gửi Mẫu", "Chi Phí Cast (đ)", "Video Đã Trả", "Video Đạt View",
        "Video Duyệt Tay", "Video Bị Loại", "Tổng Lượt Xem", "Liên Hệ / Ghi Chú",
    ]
    ws3.append(h3)
    for col_idx in range(1, len(h3) + 1):
        c = ws3.cell(1, col_idx)
        c.fill = hdr_fill
        c.font = hdr_font

    for idx, p in enumerate(profiles, start=1):
        ukey = (int(p.get("source_id") or 0), str(p.get("koc_username") or "").lstrip("@/").lower())
        ag = by_koc_agg.get(ukey, {"vids": int(p.get("videos_returned") or 0), "auto": 0, "manual": 0, "excl": 0, "views": 0})
        uname = "@" + str(p.get("koc_username") or "").lstrip("@/")
        ws3.append([
            idx, p.get("source_name") or "", p.get("month") or "", uname,
            p.get("channel_url") or "", p.get("followers") or "", p.get("gmv_text") or "",
            p.get("product_sample") or "", round(float(p.get("cast_fee") or 0)),
            ag["vids"], ag["auto"], ag["manual"], ag["excl"], ag["views"],
            " ".join(filter(None, [p.get("contact_info"), p.get("note")])).strip(),
        ])
        r3 = ws3.max_row
        ws3.cell(r3, 9).number_format = "#,##0"
        ws3.cell(r3, 14).number_format = "#,##0"

    widths3 = [6, 18, 10, 22, 34, 12, 12, 22, 14, 13, 13, 13, 13, 15, 26]
    for i_w, w_val in enumerate(widths3, start=1):
        ws3.column_dimensions[openpyxl.utils.get_column_letter(i_w)].width = w_val

    buf = io.BytesIO()
    wb.save(buf)
    tag = (month or "TatCa").replace("-", "_")
    fname = f"HoaHong_KOC_{tag}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

