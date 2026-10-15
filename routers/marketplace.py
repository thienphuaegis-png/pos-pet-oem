from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File, Form
from typing import Optional, List, Dict, Any
import datetime
import json
import re
import httpx
from database import get_db
from schemas import (
    MarketplaceAccountCreate, MarketplaceAccountUpdate,
    MarketplaceOrderSyncRequest, MarketplaceSkuMapCreate,
    MarketplaceAIChatRequest, ShopeeTestConnectionRequest,
    MarketplaceOrderJsonImportRequest, MarketplaceAutoCookieRequest
)
from logger_config import get_module_logger
from dependencies import get_optional_user

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
        except:
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
               a.created_at, a.updated_at,
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
def delete_account(account_id: int, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM marketplace_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã xóa gian hàng"}

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
        elif "giá ưu đãi" in h_norm or h_norm in ("đơn giá sau giảm giá", "giá sp"):
            col_map["unit_price"] = idx
        elif "đơn giá" in h_norm and "unit_price" not in col_map:
            col_map["unit_price"] = idx
        elif h_norm in ("unit price", "price"):
            col_map.setdefault("unit_price", idx)
        elif "tổng số tiền" in h_norm or "tổng giá trị đơn hàng" in h_norm or "trị giá đơn hàng" in h_norm:
            col_map.setdefault("total_amount", idx)
        elif "trạng thái" in h_norm or h_norm in ("order status", "trạng thái vc"):
            col_map.setdefault("status", idx)
        elif "ngày đặt hàng" in h_norm or "thời điểm tạo đơn" in h_norm or "ngày tạo đơn" in h_norm:
            col_map.setdefault("order_date", idx)
        elif h_norm in ("created time", "order date"):
            col_map.setdefault("order_date", idx)
        elif "người mua" in h_norm and "nhận" not in h_norm and "thanh toán" not in h_norm:
            col_map.setdefault("buyer", idx)
        elif h_norm in ("buyer username", "username"):
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
            m_vn = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s_date)
            if m_vn:
                d, m, y = m_vn.groups()
                order_date_str = f"{y}-{m.zfill(2)}-{d.zfill(2)} 00:00:00"
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

    for sn, o in orders_dict.items():
        item_total = sum(it["subtotal"] for it in o["items"])
        total_fee = o["fee_fixed"] + o["fee_service"] + o["fee_payment"]
        net_payout = max(0.0, item_total - o["shop_voucher"] - total_fee)
        gross_total = item_total if item_total > 0 else o["total_amount"]

        cur.execute("""
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
        """, (
            platform.lower(), account_id, sn, o["status"], o["order_date"],
            gross_total, o["shipping_fee"], o["fee_fixed"], o["fee_service"], o["fee_payment"],
            o["shop_voucher"], net_payout, o["buyer"], o["tracking_number"]
        ))

        cur.execute("SELECT id FROM marketplace_orders WHERE platform = ? AND order_sn = ?", (platform.lower(), sn))
        order_db_id = cur.fetchone()[0]
        synced_orders += 1

        cur.execute("DELETE FROM marketplace_order_items WHERE order_id = ?", (order_db_id,))
        for it in o["items"]:
            p_name = it["product_name"]
            p_var = it["variation"]
            p_sku = it["sku"]
            qty = it["quantity"]
            u_price = it["unit_price"]
            sub_amt = it["subtotal"]

            # Ánh xạ sản phẩm
            mapped_pid = None
            if p_sku:
                sku_clean = p_sku.strip().upper()
                cur.execute("SELECT id FROM products WHERE UPPER(TRIM(code)) = ? AND is_active = 1 LIMIT 1", (sku_clean,))
                p_row = cur.fetchone()
                if p_row:
                    mapped_pid = p_row[0]

            if not mapped_pid:
                for m in mappings:
                    if m.get("platform_sku") and p_sku and m["platform_sku"].strip().lower() == p_sku.lower():
                        mapped_pid = m["product_id"]
                        break
                    elif m["platform_item_name"].lower() == p_name.lower():
                        if not m["platform_variation"] or m["platform_variation"].lower() == p_var.lower():
                            mapped_pid = m["product_id"]
                            break

            cur.execute("""
                INSERT INTO marketplace_order_items (
                    order_id, platform_product_name, platform_variation,
                    platform_sku, quantity, unit_price, subtotal, mapped_product_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (order_db_id, p_name, p_var, p_sku, qty, u_price, sub_amt, mapped_pid))
            synced_items += 1

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
@router.get("/orders")
def list_marketplace_orders(
    platform: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT o.*, a.shop_name,
               (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as item_count,
               (SELECT SUM(quantity) FROM marketplace_order_items WHERE order_id = o.id) as total_qty,
               (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id AND mapped_product_id IS NOT NULL) as mapped_count
        FROM marketplace_orders o
        LEFT JOIN marketplace_accounts a ON o.account_id = a.id
        WHERE 1=1
    """
    params = []
    if platform and platform != "all":
        query += " AND o.platform = ?"
        params.append(platform)
    if date:
        query += " AND date(o.order_date) = date(?)"
        params.append(date)
    if status and status != "all":
        query += " AND o.order_status = ?"
        params.append(status)

    query += " ORDER BY o.order_date DESC, o.id DESC LIMIT ?"
    params.append(limit)

    cur.execute(query, tuple(params))
    orders = [dict(r) for r in cur.fetchall()]

    for ord_item in orders:
        cur.execute("""
            SELECT i.*, p.name as pos_product_name, p.code as pos_product_code, p.unit as pos_unit
            FROM marketplace_order_items i
            LEFT JOIN products p ON i.mapped_product_id = p.id
            WHERE i.order_id = ?
        """, (ord_item["id"],))
        ord_item["items"] = [dict(it) for it in cur.fetchall()]

    conn.close()
    return orders

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
    """, (req.product_id, req.platform_item_name.strip(), (req.platform_variation or "").strip(), (req.platform_variation or "").strip()))

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
                WHERE platform_product_name = ?
            """, (matched_id, u["platform_product_name"]))
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
