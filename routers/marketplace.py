from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Dict, Any
import datetime
import json
import re
import httpx
from database import get_db
from schemas import (
    MarketplaceAccountCreate, MarketplaceAccountUpdate,
    MarketplaceOrderSyncRequest, MarketplaceSkuMapCreate,
    MarketplaceAIChatRequest
)
from logger_config import get_module_logger
from dependencies import require_permission

logger = get_module_logger("marketplace")

router = APIRouter(prefix="/api/marketplace", tags=["Marketplace TMĐT"])

def extract_spc_cds(cookie_str: str) -> str:
    if not cookie_str:
        return ""
    m = re.search(r"SPC_CDS=([^;]+)", cookie_str)
    return m.group(1) if m else cookie_str.strip()

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
def create_account(req: MarketplaceAccountCreate, user=Depends(require_permission("products.manage"))):
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

@router.put("/accounts/{account_id}")
def update_account(account_id: int, req: MarketplaceAccountUpdate, user=Depends(require_permission("products.manage"))):
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
def delete_account(account_id: int, user=Depends(require_permission("products.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM marketplace_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã xóa gian hàng"}

# ─────────────────────────────────────────────────────────────────
# 2. ĐỒNG BỘ ĐƠN HÀNG TỪ SHOPEE & TIKTOK SHOP
# ─────────────────────────────────────────────────────────────────
@router.post("/shopee/sync")
async def sync_shopee_orders(req: MarketplaceOrderSyncRequest, user=Depends(require_permission("products.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM marketplace_accounts WHERE id = ? AND platform = 'shopee'", (req.account_id,))
    acc = cur.fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Shopee")

    cookies = acc["cookies"] or ""
    spc_cds = extract_spc_cds(cookies)
    if not spc_cds:
        conn.close()
        raise HTTPException(status_code=400, detail="Tài khoản chưa có Cookie hoặc Token SPC_CDS hợp lệ. Vui lòng cập nhật Cookie!")

    # Lấy luật ánh xạ hiện tại để tự động map
    cur.execute("SELECT platform_sku, platform_item_name, platform_variation, product_id FROM marketplace_sku_mappings WHERE platform = 'shopee'")
    mappings = [dict(r) for r in cur.fetchall()]

    synced_orders = 0
    synced_items = 0

    # Duyệt qua các tab trạng thái Shopee (100: to_ship, 200: shipping, 300: completed)
    tabs_to_fetch = [req.order_tab] if req.order_tab else [100, 200, 300]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookies,
        "Referer": "https://banhang.shopee.vn/portal/sale/order",
        "Content-Type": "application/json"
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
                    continue
                data_idx = res_idx.json()
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
                    continue
                card_list = res_cards.json().get("data", {}).get("card_list", [])

                for entry in card_list:
                    c = entry.get("order_card") or entry.get("package_level_order_card")
                    if not c:
                        continue
                    header = c.get("card_header", {})
                    order_sn = header.get("order_sn") or str(c.get("order_id", ""))
                    if not order_sn:
                        continue

                    order_status = header.get("status_desc") or str(tab_code)
                    buyer_username = header.get("buyer_user_name", "")
                    order_timestamp = header.get("create_time") or datetime.datetime.now().timestamp()
                    order_date = datetime.datetime.fromtimestamp(order_timestamp).strftime("%Y-%m-%d %H:%M:%S")

                    total_price = float(c.get("total_price", 0.0) or 0.0)

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

                    cur.execute("DELETE FROM marketplace_order_items WHERE order_id = ?", (order_db_id,))
                    for it in groups:
                        p_name = it.get("name") or "Sản phẩm Shopee"
                        raw_desc = it.get("description") or ""
                        p_var = re.sub(r"^Variation:\s*", "", raw_desc, flags=re.I).strip()
                        qty = float(it.get("amount") or 1.0)
                        u_price = float(it.get("item_price", 0.0) or 0.0)
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

@router.post("/tiktok/sync")
async def sync_tiktok_orders(req: MarketplaceOrderSyncRequest, user=Depends(require_permission("products.manage"))):
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
def save_sku_mapping(req: MarketplaceSkuMapCreate, user=Depends(require_permission("products.manage"))):
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
def delete_sku_mapping(mapping_id: int, user=Depends(require_permission("products.manage"))):
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
def auto_map_unmapped_items(user=Depends(require_permission("products.manage"))):
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
