from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
import datetime
import time
from database import get_db, archive_code, is_code_archived
from schemas import OrderCreate, OrderUpdate, ReturnItemSchema, ExchangeItemSchema, CreateReturnRequest
from logger_config import get_module_logger
from routers.cashbook import generate_cashbook_code
from dependencies import get_current_user, get_optional_user, require_role, require_permission
from pydantic import BaseModel
from typing import Optional, List

class BulkUpdateStaffReq(BaseModel):
    order_codes: List[str]
    new_staff_id: int

logger = get_module_logger("pos")

router = APIRouter(tags=["POS & Orders"])

@router.get("/api/pos/draft")
def get_draft(current: Optional[dict] = Depends(get_optional_user)):
    """Khôi phục hóa đơn đang gõ dở của nhân viên hiện tại (chống mất khi tắt máy/mất điện)."""
    if not current:
        return None
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT data, updated_at FROM draft_orders WHERE staff_id=?", (current["id"],))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {"data": row["data"], "updated_at": row["updated_at"]}


@router.post("/api/pos/draft")
def save_draft(body: dict, current: Optional[dict] = Depends(get_optional_user)):
    """Lưu snapshot hóa đơn đang gõ dở — client gọi định kỳ (debounce ~3-5s)."""
    if not current:
        return {"message": "skipped"}
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO draft_orders (staff_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(staff_id) DO UPDATE SET data=excluded.data, updated_at=CURRENT_TIMESTAMP",
        (current["id"], body.get("data", ""))
    )
    conn.commit()
    conn.close()
    return {"message": "saved"}


@router.delete("/api/pos/draft")
def clear_draft(current: Optional[dict] = Depends(get_optional_user)):
    """Xóa draft sau khi thanh toán xong hoặc dọn tay — tránh khôi phục hóa đơn đã bán."""
    if not current:
        return {"message": "skipped"}
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM draft_orders WHERE staff_id=?", (current["id"],))
    conn.commit()
    conn.close()
    return {"message": "cleared"}


@router.post("/api/orders/import-excel")
async def import_orders_excel(file: UploadFile = File(...)):
    """
    Import hóa đơn từ file Excel đa-sheet (Sheet Invoices + Sheet Order_Details)
    """
    import openpyxl, io
    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File Excel không hợp lệ: {str(e)}")

    sheet_names = wb.sheetnames
    inv_sheet_name = 'Invoices' if 'Invoices' in sheet_names else sheet_names[0]
    ws_inv = wb[inv_sheet_name]
    inv_rows = list(ws_inv.iter_rows(values_only=True))
    if len(inv_rows) <= 1:
        raise HTTPException(status_code=400, detail="Sheet Invoices không có dữ liệu!")

    # Sheet chi tiết món
    ws_items = wb['Order_Details'] if 'Order_Details' in sheet_names else (wb[sheet_names[1]] if len(sheet_names) > 1 else None)
    item_rows = list(ws_items.iter_rows(values_only=True)) if ws_items else []

    conn = get_db()
    cur = conn.cursor()
    try:
        # Load maps
        cur.execute("SELECT id, code FROM contacts WHERE type = 'customer'")
        cust_map = {r["code"]: r["id"] for r in cur.fetchall()}

        cur.execute("SELECT id, UPPER(code) as code FROM products")
        prod_map = {r["code"]: r["id"] for r in cur.fetchall()}

        # Map chi tiết món theo mã đơn
        items_by_order = {}
        if item_rows and len(item_rows) > 1:
            for r in item_rows[1:]:
                if not r or len(r) < 3 or not r[1]:
                    continue
                o_code = str(r[1]).strip()
                p_code = str(r[2]).strip().upper()
                p_id = prod_map.get(p_code)
                if not p_id:
                    # Tự tạo mặt hàng nếu chưa có để không mất dữ liệu
                    cur.execute("""
                        INSERT INTO products (code, name, type, cost_price, sell_price, unit, stock, category)
                        VALUES (?, ?, 'product', 0, ?, 'cái', 0, 'Khác')
                    """, (str(r[2]).strip(), f"Sản phẩm {r[2]}", float(r[4] or 0)))
                    p_id = cur.lastrowid
                    prod_map[p_code] = p_id

                qty = float(r[3] or 1)
                price = float(r[4] or 0)
                disc = float(r[5] or 0) if len(r) > 5 else 0
                items_by_order.setdefault(o_code, []).append({
                    "product_id": p_id,
                    "quantity": qty,
                    "price": price,
                    "discount": disc
                })

        orders_count = 0
        items_count = 0

        for r in inv_rows[1:]:
            if not r or not r[0]:
                continue
            code = str(r[0]).strip()
            c_code = str(r[1] or "").strip()
            cid = cust_map.get(c_code, 1) # Mặc định khách lẻ nếu ko tìm thấy
            total = float(r[2] or 0)
            disc = float(r[3] or 0)
            ship = float(r[4] or 0) if len(r) > 4 else 0.0
            final = float(r[5] or 0) if len(r) > 5 else (total - disc + ship)
            paid = float(r[6] or 0) if len(r) > 6 else final
            debt = float(r[7] or 0) if len(r) > 7 else max(0.0, final - paid)
            note = str(r[8] or "") if len(r) > 8 else ""
            status = str(r[9] or "completed") if len(r) > 9 else "completed"
            c_at = str(r[10] or "") if len(r) > 10 else None

            # Xóa đơn cũ nếu trùng mã để ghi đè sạch sẽ
            cur.execute("SELECT id FROM orders WHERE code = ?", (code,))
            ex = cur.fetchone()
            if ex:
                cur.execute("DELETE FROM order_items WHERE order_id = ?", (ex["id"],))
                cur.execute("DELETE FROM orders WHERE id = ?", (ex["id"],))

            cur.execute("""
                INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, shipping_fee, final_amount, paid_amount, debt_amount, note, status, created_at)
                VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')))
            """, (code, cid, total, disc, ship, final, paid, debt, note, status, c_at))
            order_id = cur.lastrowid
            orders_count += 1

            # Insert order items
            ord_items = items_by_order.get(code, [])
            for itm in ord_items:
                subtot = max(0.0, itm["quantity"] * itm["price"] - itm["discount"])
                cur.execute("""
                    INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit_ratio, unit)
                    VALUES (?, ?, ?, ?, ?, 1, 'cái')
                """, (order_id, itm["product_id"], itm["quantity"], itm["price"], subtot))
                items_count += 1

        conn.commit()
        return {
            "success": True,
            "message": f"Đã nhập thành công {orders_count} hóa đơn và {items_count} chi tiết sản phẩm!",
            "orders_imported": orders_count,
            "items_imported": items_count
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu hóa đơn: {str(e)}")
    finally:
        conn.close()

@router.get("/api/orders")
def list_orders(
    limit: int = 100,
    offset: int = 0,
    query: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    payment_method: Optional[str] = None,
    staff_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    product_keyword: Optional[str] = None,
    debt_status: Optional[str] = None
):
    """
    Truy vấn danh sách hóa đơn bán hàng hỗ trợ bộ lọc đa tiêu chí từ Server/CSDL:
    - Tìm kiếm chung: mã đơn, tên khách, SĐT
    - Khoảng ngày (from_date, to_date)
    - Hình thức thanh toán (cash, transfer, card, wallet)
    - Nhân viên tạo đơn (staff_id)
    - Khách hàng (customer_id)
    - Có chứa sản phẩm / dịch vụ (product_keyword)
    - Trạng thái công nợ (paid: hết nợ, has_debt: còn nợ)
    """
    conn = get_db()
    cur = conn.cursor()

    where_clauses = ["1=1"]
    params = []

    # 1. Tìm kiếm text chung
    if query:
        q_term = f"%{query.strip()}%"
        where_clauses.append("(o.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)")
        params.extend([q_term, q_term, q_term])

    # 2. Khoảng thời gian
    if from_date:
        where_clauses.append("o.created_at >= ?")
        params.append(f"{from_date.strip()} 00:00:00")
    if to_date:
        where_clauses.append("o.created_at <= ?")
        params.append(f"{to_date.strip()} 23:59:59")

    # 3. Nhân viên tạo đơn
    if staff_id:
        where_clauses.append("o.staff_id = ?")
        params.append(staff_id)

    # 4. Khách hàng
    if customer_id:
        where_clauses.append("o.customer_id = ?")
        params.append(customer_id)

    # 5. Trạng thái công nợ
    if debt_status == "has_debt":
        where_clauses.append("o.debt_amount > 0")
    elif debt_status == "paid":
        where_clauses.append("(o.debt_amount IS NULL OR o.debt_amount <= 0)")

    # 6. Có chứa sản phẩm / dịch vụ
    if product_keyword:
        p_term = f"%{product_keyword.strip()}%"
        where_clauses.append("""
        o.id IN (
            SELECT oi.order_id 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE p.name LIKE ? OR p.code LIKE ?
        )
        """)
        params.extend([p_term, p_term])

    # 7. Hình thức thanh toán
    if payment_method:
        m = payment_method.strip().lower()
        if m == "wallet":
            where_clauses.append("o.spa_wallet_deduction > 0")
        else:
            where_clauses.append("""
            (
                o.id IN (SELECT order_id FROM order_payments WHERE method = ?)
                OR o.id IN (
                    SELECT ref_id FROM cashbook 
                    WHERE ref_type = 'order' AND account_id IN (
                        SELECT id FROM payment_accounts WHERE account_type = ?
                    )
                )
            )
            """)
            params.extend([m, m])

    where_sql = " AND ".join(where_clauses)
    sql = f"""
    SELECT o.*, c.name as customer_name, s.name as staff_name,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    WHERE {where_sql}
    ORDER BY o.id DESC
    LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/orders/bulk-update-staff")
def bulk_update_order_staff(req: BulkUpdateStaffReq, user=Depends(require_permission("pos.edit_delete_order"))):
    """Cập nhật hàng loạt thu ngân cho danh sách hóa đơn được chọn."""
    if not req.order_codes:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ít nhất 1 hóa đơn để cập nhật")
    
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name FROM staff WHERE id = ? AND is_active = 1", (req.new_staff_id,))
        staff = cur.fetchone()
        if not staff:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên hoặc tài khoản đã bị khóa")

        placeholders = ",".join("?" for _ in req.order_codes)
        cur.execute(f"UPDATE orders SET staff_id = ? WHERE code IN ({placeholders})", [req.new_staff_id] + req.order_codes)
        updated_count = cur.rowcount
        conn.commit()
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    
    conn.close()
    return {
        "status": "ok",
        "updated_count": updated_count,
        "staff_id": staff["id"],
        "staff_name": staff["name"]
    }

@router.get("/api/orders/{code}")
def get_order_detail(code: str):
    conn = get_db()
    cur = conn.cursor()
    param_id = int(code) if code.isdigit() else -1
    cur.execute("""
    SELECT o.*, 
           c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
           c.segment_id, cs.name as customer_segment_name, cs.price_list_id,
           pl.name as customer_price_list_name,
           s.name as staff_name
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN customer_segments cs ON c.segment_id = cs.id
    LEFT JOIN price_lists pl ON cs.price_list_id = pl.id
    LEFT JOIN staff s ON o.staff_id = s.id
    WHERE o.code = ? OR o.id = ?
    """, (code, param_id))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Khong tim thay don hang")
    
    order_dict = dict(order)
    price_list_id = order_dict.get("price_list_id")

    cur.execute("""
    SELECT oi.*, 
           p.name as product_name, p.code as product_code, p.unit, 
           p.sell_price as retail_price,
           ppl.price as price_list_price,
           p.type as product_type
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN product_price_list ppl ON (ppl.product_id = p.id AND ppl.price_list_id = ?)
    WHERE oi.order_id = ?
    """, (price_list_id, order["id"]))
    raw_items = [dict(r) for r in cur.fetchall()]

    items = []
    for it in raw_items:
        ratio = float(it.get("unit_ratio") or 1.0)
        if ratio <= 0:
            ratio = 1.0
        retail_price = float(it.get("retail_price") or 0.0) * ratio
        pl_price = (float(it.get("price_list_price") or 0.0) * ratio) if (it.get("price_list_price") is not None) else None
        item_price = float(it.get("price") or 0.0)
        is_gift = (item_price == 0 and float(it.get("quantity") or 0) > 0)
        it["is_gift"] = is_gift

        if price_list_id:
            # Khách hàng đại lý / có bảng giá riêng
            if pl_price is not None and pl_price > 0:
                if is_gift:
                    it["original_price"] = 0.0
                elif item_price >= pl_price:
                    it["original_price"] = item_price
                else:
                    it["original_price"] = pl_price
            else:
                if is_gift:
                    it["original_price"] = 0.0
                elif item_price > 0:
                    it["original_price"] = item_price
                else:
                    it["original_price"] = retail_price
        else:
            # Khách lẻ
            it["original_price"] = retail_price

        items.append(it)

    cur.execute("SELECT method, amount, account_id FROM order_payments WHERE order_id = ?", (order["id"],))
    payments = [dict(r) for r in cur.fetchall()]

    # Lay thong tin tai khoan ngan hang thuc te cua don hang
    bank_account_info = None
    is_cash_payment = False

    non_cash_methods = ('transfer', 'card', 'wallet')
    non_cash_payments = [p for p in payments if p.get("method") in non_cash_methods]

    if non_cash_payments:
        acc_ids = [p["account_id"] for p in non_cash_payments if p.get("account_id")]
        if acc_ids:
            cur.execute("""
                SELECT id, code, name, account_type, bank_name, account_number, account_holder
                FROM payment_accounts
                WHERE id IN ({})
                ORDER BY CASE WHEN account_type = 'bank' THEN 0 ELSE 1 END
                LIMIT 1
            """.format(",".join("?" * len(acc_ids))), acc_ids)
            acc_row = cur.fetchone()
            if acc_row:
                bank_account_info = dict(acc_row)
        if not bank_account_info:
            cur.execute("""
                SELECT id, code, name, account_type, bank_name, account_number, account_holder
                FROM payment_accounts
                WHERE account_type = 'bank' AND is_active = 1
                ORDER BY is_default DESC, id ASC
                LIMIT 1
            """)
            acc_row = cur.fetchone()
            if acc_row:
                bank_account_info = dict(acc_row)

        # Neu bank_account_info thieu chi tiet ngan hang (bank_name/account_number), fallback ve settings
        if bank_account_info and (not bank_account_info.get("bank_name") or not bank_account_info.get("account_number")):
            cur.execute("SELECT key, value FROM settings WHERE key IN ('shop_bank_code', 'shop_bank_account', 'shop_bank_owner')")
            sett_map = {r["key"]: r["value"] for r in cur.fetchall()}
            if not bank_account_info.get("bank_name") and sett_map.get("shop_bank_code"):
                bank_account_info["bank_name"] = sett_map["shop_bank_code"]
            if not bank_account_info.get("account_number") and sett_map.get("shop_bank_account"):
                bank_account_info["account_number"] = sett_map["shop_bank_account"]
            if not bank_account_info.get("account_holder") and sett_map.get("shop_bank_owner"):
                bank_account_info["account_holder"] = sett_map["shop_bank_owner"]
        elif not bank_account_info:
            cur.execute("SELECT key, value FROM settings WHERE key IN ('shop_bank_code', 'shop_bank_account', 'shop_bank_owner')")
            sett_map = {r["key"]: r["value"] for r in cur.fetchall()}
            if sett_map.get("shop_bank_account"):
                bank_account_info = {
                    "id": None,
                    "code": "SETTINGS",
                    "name": sett_map.get("shop_bank_owner") or "Ngân hàng",
                    "account_type": "bank",
                    "bank_name": sett_map.get("shop_bank_code") or "MB",
                    "account_number": sett_map.get("shop_bank_account") or "",
                    "account_holder": sett_map.get("shop_bank_owner") or ""
                }
        is_cash_payment = False
    elif payments and all(p.get("method") == 'cash' for p in payments):
        bank_account_info = None
        is_cash_payment = True
    else:
        order_dict = dict(order)
        order_acc_id = order_dict.get("account_id")
        if order_acc_id:
            cur.execute("""
                SELECT id, code, name, account_type, bank_name, account_number, account_holder
                FROM payment_accounts
                WHERE id = ?
            """, (order_acc_id,))
            acc_row = cur.fetchone()
            if acc_row:
                acc_data = dict(acc_row)
                if acc_data.get("account_type") == "cash":
                    is_cash_payment = True
                    bank_account_info = None
                else:
                    bank_account_info = acc_data
        elif order_dict.get("payment_method") == "cash":
            is_cash_payment = True

    result = dict(order)
    result["is_wholesale"] = bool(price_list_id or (result.get("customer_name") and any(k in result["customer_name"].lower() for k in ("đại lý", "dai ly", "sỉ", "si "))))
    result["items"] = items
    result["payments"] = payments
    result["bank_account"] = bank_account_info
    result["is_cash_payment"] = is_cash_payment
    conn.close()
    return result


@router.get("/api/pos/orders/{code}/returnable-items")
def get_order_returnable_items(code: str):
    """
    Lấy danh sách các mặt hàng có thể trả từ đơn hàng gốc kèm số lượng khả dụng
    và đơn giá net đã phân bổ chiết khấu.
    """
    conn = get_db()
    cur = conn.cursor()
    param_id = int(code) if code.isdigit() else -1
    cur.execute("""
        SELECT o.*, c.name as customer_name
        FROM orders o
        LEFT JOIN contacts c ON o.customer_id = c.id
        WHERE o.code = ? OR o.id = ?
    """, (code, param_id))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    cur.execute("""
        SELECT oi.*, p.name as product_name, p.code as product_code,
               COALESCE((
                   SELECT SUM(ori.quantity)
                   FROM order_return_items ori
                   WHERE ori.original_item_id = oi.id
               ), 0.0) as quantity_returned
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
    """, (order["id"],))
    raw_items = cur.fetchall()
    conn.close()

    total_amount = float(order["total_amount"]) if order["total_amount"] is not None else 0.0
    final_amount = float(order["final_amount"]) if order["final_amount"] is not None else 0.0

    items = []
    for it in raw_items:
        it_dict = dict(it)
        qty = float(it_dict["quantity"])
        qty_returned = float(it_dict["quantity_returned"])
        qty_avail = max(0.0, qty - qty_returned)

        if total_amount > 0 and qty > 0:
            unit_price_net = (float(it_dict["subtotal"]) / total_amount * final_amount) / qty
        else:
            unit_price_net = float(it_dict["price"])

        items.append({
            "id": it_dict["id"],
            "product_id": it_dict["product_id"],
            "product_name": it_dict["product_name"],
            "product_code": it_dict.get("product_code", ""),
            "price": float(it_dict["price"]),
            "quantity": qty,
            "quantity_bought": qty,
            "quantity_returned": qty_returned,
            "quantity_available": qty_avail,
            "subtotal": float(it_dict["subtotal"]),
            "unit_price_net": round(unit_price_net, 2)
        })

    return {
        "order_id": order["id"],
        "order_code": order["code"],
        "code": order["code"],
        "customer_id": order["customer_id"],
        "customer_name": order["customer_name"],
        "total_amount": total_amount,
        "discount": float(order["discount"]) if order["discount"] is not None else 0.0,
        "final_amount": final_amount,
        "items": items
    }


def generate_return_code(cur) -> str:
    """Sinh mã phiếu trả/đổi hàng định dạng: RET-{YYYYMMDD}-{seq:04d} (chống trùng mã vĩnh viễn)"""
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    pattern = f"RET-{today_str}-%"
    
    # Tìm sequence lớn nhất từ cả 2 bảng order_returns và archived_codes
    cur.execute("""
        SELECT MAX(CAST(SUBSTR(code, 14) AS INTEGER))
        FROM (
            SELECT code FROM order_returns WHERE code LIKE ?
            UNION ALL
            SELECT code FROM archived_codes WHERE code LIKE ?
        )
    """, (pattern, pattern))
    row = cur.fetchone()
    max_seq = row[0] if row and row[0] is not None else 0
    seq = max_seq + 1

    while True:
        candidate = f"RET-{today_str}-{seq:04d}"
        cur.execute("SELECT 1 FROM order_returns WHERE code = ?", (candidate,))
        if not cur.fetchone() and not is_code_archived(cur, candidate):
            archive_code(cur, candidate, "return")
            return candidate
        seq += 1


@router.post("/api/pos/returns")
def create_order_return(req: CreateReturnRequest, user=Depends(require_permission("pos.sell"))):
    """
    Xử lý tạo phiếu đổi / trả hàng theo đơn hàng gốc.
    - Cập nhật tồn kho hàng hoàn (nếu return_to_stock=1)
    - Tạo đơn hàng mới cho món đổi (nếu có exchange_items) và trừ tồn kho món mới
    - Ghi nhận phiếu thu / chi tương ứng trong sổ quỹ cashbook
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        # 1. Kiểm tra đơn hàng gốc
        cur.execute("SELECT * FROM orders WHERE id = ?", (req.original_order_id,))
        orig_order = cur.fetchone()
        if not orig_order:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng gốc")
        if orig_order["status"] != "completed":
            raise HTTPException(status_code=400, detail="Chỉ có thể đổi trả đơn hàng đã hoàn thành")

        warehouse_id = orig_order["warehouse_id"] if "warehouse_id" in orig_order.keys() and orig_order["warehouse_id"] else 1

        if not req.return_items:
            raise HTTPException(status_code=400, detail="Danh sách hàng trả không được để trống")

        # 2. Lấy thông tin các item trong đơn gốc và số lượng đã trả trước đó
        cur.execute("""
            SELECT oi.*,
                   COALESCE((
                       SELECT SUM(ori.quantity)
                       FROM order_return_items ori
                       WHERE ori.original_item_id = oi.id
                   ), 0.0) as quantity_returned
            FROM order_items oi
            WHERE oi.order_id = ?
        """, (req.original_order_id,))
        orig_items = [dict(r) for r in cur.fetchall()]

        # 3. Validate từng món trả
        running_returned = {}
        validated_return_items = []
        for r_item in req.return_items:
            if r_item.quantity <= 0:
                raise HTTPException(status_code=400, detail="Số lượng trả phải lớn hơn 0")

            cur.execute("SELECT id, name, type, stock FROM products WHERE id = ?", (r_item.product_id,))
            p_row = cur.fetchone()
            if not p_row:
                raise HTTPException(status_code=404, detail=f"Sản phẩm trả ID {r_item.product_id} không tồn tại")

            # Khớp với order_item đơn gốc
            matching_oi = None
            if r_item.original_item_id:
                for oi in orig_items:
                    if oi["id"] == r_item.original_item_id:
                        matching_oi = oi
                        break
                if not matching_oi:
                    raise HTTPException(status_code=400, detail=f"Món hàng (ID: {r_item.original_item_id}) không thuộc đơn hàng gốc")
            else:
                for oi in orig_items:
                    if oi["product_id"] == r_item.product_id:
                        matching_oi = oi
                        break
                if not matching_oi:
                    raise HTTPException(status_code=400, detail=f"Sản phẩm (ID: {r_item.product_id}) không thuộc đơn hàng gốc")

            actual_oi_id = matching_oi["id"]
            qty_bought = float(matching_oi["quantity"])
            qty_returned = float(matching_oi["quantity_returned"])
            qty_avail = max(0.0, qty_bought - qty_returned)

            prev_batch_qty = running_returned.get(actual_oi_id, 0.0)
            if (r_item.quantity + prev_batch_qty) > qty_avail:
                raise HTTPException(
                    status_code=400,
                    detail=f"Số lượng trả ({r_item.quantity + prev_batch_qty}) vượt quá số lượng khả dụng ({qty_avail}) của sản phẩm {p_row['name']}"
                )
            running_returned[actual_oi_id] = prev_batch_qty + r_item.quantity

            total_amount = float(orig_order["total_amount"]) if orig_order["total_amount"] is not None else 0.0
            final_amount = float(orig_order["final_amount"]) if orig_order["final_amount"] is not None else 0.0
            if total_amount > 0 and qty_bought > 0:
                max_return_price = round((float(matching_oi["subtotal"]) / total_amount * final_amount) / qty_bought, 2)
            else:
                max_return_price = float(matching_oi["price"])

            if float(r_item.return_price) > max_return_price + 1.0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Đơn giá trả ({r_item.return_price:,.0f}đ) vượt quá đơn giá thực mua tối đa ({max_return_price:,.0f}đ) của sản phẩm {p_row['name']}"
                )

            validated_return_items.append({
                "product_id": r_item.product_id,
                "original_item_id": actual_oi_id,
                "quantity": float(r_item.quantity),
                "return_price": float(r_item.return_price),
                "return_to_stock": 1 if r_item.return_to_stock is None else int(r_item.return_to_stock),
                "reason": r_item.reason or "",
                "type": p_row["type"]
            })

        # 4. Validate món đổi (nếu có)
        validated_exchange_items = []
        if req.exchange_items:
            for e_item in req.exchange_items:
                if e_item.quantity <= 0:
                    raise HTTPException(status_code=400, detail="Số lượng đổi phải lớn hơn 0")
                cur.execute("SELECT id, name, unit, type, stock FROM products WHERE id = ?", (e_item.product_id,))
                ep_row = cur.fetchone()
                if not ep_row:
                    raise HTTPException(status_code=404, detail=f"Sản phẩm đổi ID {e_item.product_id} không tồn tại")
                validated_exchange_items.append({
                    "product_id": e_item.product_id,
                    "quantity": float(e_item.quantity),
                    "price": float(e_item.price),
                    "unit": e_item.unit or ep_row["unit"],
                    "unit_ratio": float(e_item.unit_ratio or 1),
                    "type": ep_row["type"]
                })

        # 5. Tính toán tổng tiền
        return_total = round(sum(it["quantity"] * it["return_price"] for it in validated_return_items), 2)
        exchange_total = round(sum(it["quantity"] * it["price"] for it in validated_exchange_items), 2)
        diff_amount = round(exchange_total - return_total, 2)

        # 6. Nhân viên & Ca làm việc
        staff_id = req.staff_id or orig_order["staff_id"]
        if not staff_id and user and "id" in user:
            staff_id = user["id"]

        shift_id = req.shift_id or orig_order["shift_id"]
        if not shift_id and user and "id" in user:
            cur.execute("SELECT id FROM shifts WHERE cashier_id = ? AND status = 'open' LIMIT 1", (user["id"],))
            s_row = cur.fetchone()
            if s_row:
                shift_id = s_row["id"]

        # 7. Sinh mã phiếu trả
        return_code = generate_return_code(cur)

        # 8. Tạo đơn hàng đổi mới nếu có exchange_items
        exchange_order_id = None
        if validated_exchange_items:
            base_code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
            exc_order_code = base_code
            seq = 1
            while True:
                cur.execute("SELECT 1 FROM orders WHERE code = ?", (exc_order_code,))
                if not cur.fetchone():
                    break
                exc_order_code = f"{base_code}_{seq}"
                seq += 1

            cur.execute("""
                INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, shipping_fee, final_amount, paid_amount, debt_amount, note, shift_id, warehouse_id, status)
                VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, 'completed')
            """, (
                exc_order_code,
                orig_order["customer_id"],
                staff_id,
                exchange_total,
                exchange_total,
                exchange_total,
                f"Đơn đổi hàng từ phiếu {return_code}",
                shift_id,
                warehouse_id
            ))
            exchange_order_id = cur.lastrowid

            for e_item in validated_exchange_items:
                subtotal = round(e_item["quantity"] * e_item["price"], 2)
                ratio = e_item["unit_ratio"] if e_item["unit_ratio"] > 0 else 1.0
                base_qty = round(e_item["quantity"] * ratio, 4)

                cur.execute("""
                    INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit, unit_ratio)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (exchange_order_id, e_item["product_id"], e_item["quantity"], e_item["price"], subtotal, e_item["unit"], ratio))

                # Trừ kho sản phẩm đổi (nếu không phải service)
                if e_item["type"] != "service":
                    cur.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (base_qty, e_item["product_id"]))
                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                            quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, e_item["product_id"], -base_qty, base_qty))

                    cur.execute("""
                        SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                        FROM product_bom b
                        JOIN ingredients i ON b.ingredient_id = i.id
                        WHERE b.product_id = ?
                    """, (e_item["product_id"],))
                    bom_rows = cur.fetchall()
                    for bom in bom_rows:
                        if bom["ingredient_type"] == 'SERVICE':
                            continue
                        total_consumed = bom["quantity"] * base_qty
                        cur.execute("""
                            INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                            ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                                quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                        """, (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))
                        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                        bal_row = cur.fetchone()
                        balance_after = bal_row["quantity"] if bal_row else 0
                        cur.execute("""
                            INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                            VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                        """, (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, exchange_order_id, exc_order_code, f"Đổi hàng {exc_order_code}"))

        # 9. Ghi nhận phiếu trả vào bảng order_returns
        cur.execute("""
            INSERT INTO order_returns (code, original_order_id, exchange_order_id, customer_id, staff_id, shift_id, return_total, exchange_total, diff_amount, refund_method, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            return_code,
            req.original_order_id,
            exchange_order_id,
            orig_order["customer_id"],
            staff_id,
            shift_id,
            return_total,
            exchange_total,
            diff_amount,
            req.refund_method,
            req.note or ""
        ))
        return_id = cur.lastrowid

        # 10. Ghi nhận từng món trả vào bảng order_return_items và hoàn kho
        for r_item in validated_return_items:
            subtotal = round(r_item["quantity"] * r_item["return_price"], 2)
            cur.execute("""
                INSERT INTO order_return_items (return_id, product_id, original_item_id, quantity, return_price, subtotal, return_to_stock, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                return_id,
                r_item["product_id"],
                r_item["original_item_id"],
                r_item["quantity"],
                r_item["return_price"],
                subtotal,
                r_item["return_to_stock"],
                r_item["reason"]
            ))

            if r_item["return_to_stock"] == 1 and r_item["type"] != "service":
                matching_oi = next((oi for oi in orig_items if oi["id"] == r_item["original_item_id"]), None)
                unit_ratio = float(matching_oi["unit_ratio"] or 1) if (matching_oi and "unit_ratio" in matching_oi and matching_oi["unit_ratio"]) else 1.0
                base_return_qty = round(r_item["quantity"] * unit_ratio, 4)

                cur.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (base_return_qty, r_item["product_id"]))
                cur.execute("""
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, r_item["product_id"], base_return_qty, base_return_qty))

                cur.execute("""
                    SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                    FROM product_bom b
                    JOIN ingredients i ON b.ingredient_id = i.id
                    WHERE b.product_id = ?
                """, (r_item["product_id"],))
                bom_rows = cur.fetchall()
                for bom in bom_rows:
                    if bom["ingredient_type"] == 'SERVICE':
                        continue
                    total_restored = bom["quantity"] * base_return_qty
                    cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, bom["ingredient_id"], total_restored, total_restored))
                    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                    bal_row = cur.fetchone()
                    balance_after = bal_row["quantity"] if bal_row else 0
                    cur.execute("""
                        INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                        VALUES (?, ?, 'RETURN_IN', ?, ?, ?, ?, ?)
                    """, (bom["ingredient_id"], warehouse_id, total_restored, balance_after, orig_order["id"], orig_order["code"], f"Hoàn hàng trả {return_code}"))

        # 11. Hạch toán sổ quỹ cashbook theo diff_amount
        if diff_amount > 0:
            if req.refund_method in ("cash", "transfer", None):
                cb_code = generate_cashbook_code(cur, "PT-BH")
                cur.execute("""
                    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                    VALUES (?, 'in', 'Thu đổi hàng', ?, ?, 'order_return', ?, ?, ?, ?)
                """, (
                    cb_code,
                    diff_amount,
                    orig_order["customer_id"],
                    return_id,
                    f"Thu tiền đổi hàng phiếu {return_code}",
                    req.account_id,
                    shift_id
                ))
        elif diff_amount < 0:
            refund_amount = abs(diff_amount)
            if req.refund_method in ("cash", "transfer", None):
                cb_code = generate_cashbook_code(cur, "PC-TH")
                cur.execute("""
                    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                    VALUES (?, 'out', 'Chi trả hàng', ?, ?, 'order_return', ?, ?, ?, ?)
                """, (
                    cb_code,
                    refund_amount,
                    orig_order["customer_id"],
                    return_id,
                    f"Chi hoàn tiền trả hàng phiếu {return_code}",
                    req.account_id,
                    shift_id
                ))
            elif req.refund_method == "debt":
                if orig_order["customer_id"]:
                    cur.execute("UPDATE contacts SET debt = debt - ? WHERE id = ?", (refund_amount, orig_order["customer_id"]))
            elif req.refund_method == "wallet":
                if orig_order["customer_id"]:
                    cur.execute("UPDATE contacts SET spa_wallet_balance = spa_wallet_balance + ? WHERE id = ?", (refund_amount, orig_order["customer_id"]))

        conn.commit()
        conn.close()

        return {
            "success": True,
            "return_id": return_id,
            "code": return_code,
            "exchange_order_id": exchange_order_id,
            "return_total": return_total,
            "exchange_total": exchange_total,
            "diff_amount": diff_amount
        }
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/pos/returns")
def list_order_returns(
    search: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Danh sách phiếu trả/đổi hàng hỗ trợ tìm kiếm, lọc theo ngày, phân trang."""
    conn = get_db()
    cur = conn.cursor()

    where_clauses = ["1=1"]
    params = []

    if search:
        s_term = f"%{search.strip()}%"
        where_clauses.append("(ret.code LIKE ? OR orig.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)")
        params.extend([s_term, s_term, s_term, s_term])

    if from_date:
        where_clauses.append("ret.created_at >= ?")
        params.append(f"{from_date.strip()} 00:00:00")

    if to_date:
        where_clauses.append("ret.created_at <= ?")
        params.append(f"{to_date.strip()} 23:59:59")

    where_sql = " AND ".join(where_clauses)

    count_sql = f"""
    SELECT COUNT(*)
    FROM order_returns ret
    LEFT JOIN orders orig ON ret.original_order_id = orig.id
    LEFT JOIN contacts c ON ret.customer_id = c.id
    WHERE {where_sql}
    """
    cur.execute(count_sql, params)
    total = cur.fetchone()[0]

    sql = f"""
    SELECT 
        ret.*,
        orig.code as original_order_code,
        exc.code as exchange_order_code,
        c.name as customer_name,
        c.phone as customer_phone,
        s.name as staff_name,
        (SELECT COUNT(*) FROM order_return_items WHERE return_id = ret.id) as return_items_count
    FROM order_returns ret
    LEFT JOIN orders orig ON ret.original_order_id = orig.id
    LEFT JOIN orders exc ON ret.exchange_order_id = exc.id
    LEFT JOIN contacts c ON ret.customer_id = c.id
    LEFT JOIN staff s ON ret.staff_id = s.id
    WHERE {where_sql}
    ORDER BY ret.id DESC
    LIMIT ? OFFSET ?
    """
    list_params = list(params) + [limit, offset]
    cur.execute(sql, list_params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {
        "total": total,
        "returns": rows,
        "items": rows
    }


@router.get("/api/pos/returns/{code}")
def get_order_return_detail(code: str):
    """Chi tiết 1 phiếu trả/đổi hàng kèm danh sách món trả và món đổi."""
    conn = get_db()
    cur = conn.cursor()
    param_id = int(code) if code.isdigit() else -1

    cur.execute("""
    SELECT 
        ret.*,
        orig.code as original_order_code,
        orig.final_amount as original_order_total,
        orig.created_at as original_order_created_at,
        exc.code as exchange_order_code,
        c.name as customer_name,
        c.phone as customer_phone,
        c.address as customer_address,
        s.name as staff_name
    FROM order_returns ret
    LEFT JOIN orders orig ON ret.original_order_id = orig.id
    LEFT JOIN orders exc ON ret.exchange_order_id = exc.id
    LEFT JOIN contacts c ON ret.customer_id = c.id
    LEFT JOIN staff s ON ret.staff_id = s.id
    WHERE ret.code = ? OR ret.id = ?
    """, (code, param_id))
    ret_row = cur.fetchone()
    if not ret_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu trả hàng")

    ret_data = dict(ret_row)

    # Return items
    cur.execute("""
    SELECT ori.*, p.name as product_name, p.code as product_code, p.unit, p.type as product_type
    FROM order_return_items ori
    LEFT JOIN products p ON ori.product_id = p.id
    WHERE ori.return_id = ?
    ORDER BY ori.id ASC
    """, (ret_data["id"],))
    ret_data["return_items"] = [dict(r) for r in cur.fetchall()]

    # Exchange items (nếu có exchange_order_id)
    if ret_data.get("exchange_order_id"):
        cur.execute("""
        SELECT oi.*, p.name as product_name, p.code as product_code, COALESCE(NULLIF(oi.unit, ''), p.unit) as unit, p.type as product_type
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
        """, (ret_data["exchange_order_id"],))
        ret_data["exchange_items"] = [dict(r) for r in cur.fetchall()]
    else:
        ret_data["exchange_items"] = []

    conn.close()
    return ret_data



# --- APIs ---



@router.get("/api/staff")
def list_staff():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM staff ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# Ban hang (POS)
@router.post("/api/orders")
def create_order(req: OrderCreate, user=Depends(require_permission("pos.sell"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        total_amount = sum(item.quantity * item.price for item in req.items)

        # Xử lý Ví Topup Spa (nếu khách chọn dùng ví hoặc có yêu cầu trừ ví)
        wallet_deduction = 0.0
        if req.customer_id and (req.use_spa_wallet or (req.spa_wallet_amount and req.spa_wallet_amount > 0)):
            # Tính T_spa: Tổng tiền dịch vụ spa/grooming (type == 'service' và KHÔNG thuộc nhóm khách sạn / phòng lưu trú)
            t_spa = 0.0
            hotel_keywords = ["hotel", "khách sạn", "khach san", "lưu trú", "luu tru", "phòng", "phong"]
            for item in req.items:
                cur.execute("SELECT type, category FROM products WHERE id = ?", (item.product_id,))
                p_row = cur.fetchone()
                if p_row and p_row["type"] == "service":
                    cat = (p_row["category"] or "").lower()
                    if not any(k in cat for k in hotel_keywords):
                        t_spa += (item.quantity * item.price)

            cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (req.customer_id,))
            c_row = cur.fetchone()
            b_balance = c_row["spa_wallet_balance"] if c_row and c_row["spa_wallet_balance"] else 0.0

            # U = min(B, T_spa)
            max_usable = min(b_balance, t_spa)
            if req.spa_wallet_amount and req.spa_wallet_amount > 0:
                wallet_deduction = min(req.spa_wallet_amount, max_usable)
            else:
                wallet_deduction = max_usable

        shipping_fee = max(0.0, float(req.shipping_fee or 0.0))
        final_amount = max(0.0, total_amount - req.discount - wallet_deduction + shipping_fee)
        actual_paid = min(req.paid_amount, final_amount) if req.paid_amount > 0 else 0.0
        debt_amount = max(0.0, final_amount - actual_paid)
        
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (req.staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        base_code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        code = base_code
        seq = 1
        while True:
            cur.execute("SELECT 1 FROM orders WHERE code = ?", (code,))
            if not cur.fetchone() and not is_code_archived(cur, code):
                archive_code(cur, code, "order")
                break
            code = f"{base_code}_{seq}"
            seq += 1

        shift_id = req.shift_id
        if not shift_id and user and "id" in user:
            cur.execute("SELECT id FROM shifts WHERE cashier_id = ? AND status = 'open' LIMIT 1", (user["id"],))
            s_row = cur.fetchone()
            if s_row:
                shift_id = s_row["id"]

        if not shift_id:
            role = user.get("role", "") if user else ""
            if role not in ("owner", "admin"):
                from dependencies import check_permission
                if not user or not check_permission(user["id"], role, "shifts.bypass"):
                    raise HTTPException(status_code=400, detail="Bạn chưa mở ca làm việc. Vui lòng mở ca trước khi bán hàng.")

        effective_staff_id = req.staff_id
        if user and user.get("id"):
            if not effective_staff_id or effective_staff_id == 1:
                effective_staff_id = user["id"]
        if not effective_staff_id:
            effective_staff_id = 1

        warehouse_id = req.warehouse_id or 1
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        cur.execute("""
        INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, shipping_fee, final_amount, paid_amount, debt_amount, commission_amount, note, shift_id, spa_wallet_deduction, warehouse_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (code, req.customer_id, effective_staff_id, total_amount, req.discount, shipping_fee, final_amount, actual_paid, debt_amount, commission_amount, req.note, shift_id, wallet_deduction, warehouse_id, user_name))
        
        order_id = cur.lastrowid

        # Cấn trừ số dư ví Spa & ghi nhận lịch sử spa_wallet_transactions
        if wallet_deduction > 0 and req.customer_id:
            bal_before = b_balance
            bal_after = bal_before - wallet_deduction
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (bal_after, req.customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, order_id, type, amount, balance_before, balance_after, note)
                VALUES (?, ?, 'spend', ?, ?, ?, ?)
            """, (req.customer_id, order_id, wallet_deduction, bal_before, bal_after, f"Trừ ví dịch vụ Spa cho đơn hàng {code}"))

        for item in req.items:
            subtotal = item.quantity * item.price
            # Quy doi don vi ban: quantity/price theo don vi da chon (vd Thung), ton kho tru theo don vi co ban
            ratio = float(item.unit_ratio or 1)
            if ratio <= 0:
                ratio = 1.0
            base_qty = round(item.quantity * ratio, 4)
            cur.execute("""
            INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit, unit_ratio)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, item.product_id, item.quantity, item.price, subtotal, item.unit, ratio))

            cur.execute("SELECT type FROM products WHERE id = ?", (item.product_id,))
            prod_type = cur.fetchone()

            if prod_type and prod_type["type"] == "combo":
                cur.execute("""
                SELECT ci.product_id, ci.quantity as component_qty
                FROM combo_items ci
                JOIN combos c ON ci.combo_id = c.id
                WHERE c.code = (SELECT code FROM products WHERE id = ? AND type = 'combo')
                AND c.is_active = 1
                """, (item.product_id,))
                combo_components = cur.fetchall()

                for comp in combo_components:
                    comp_id = comp["product_id"]
                    comp_qty = comp["component_qty"] * base_qty

                    cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (comp_qty, comp_id))
                    cur.execute("""
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, comp_id, -comp_qty, comp_qty))

                    cur.execute("""
                    SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                    FROM product_bom b
                    JOIN ingredients i ON b.ingredient_id = i.id
                    WHERE b.product_id = ?
                    """, (comp_id,))
                    bom_rows = cur.fetchall()
                    for bom in bom_rows:
                        if bom["ingredient_type"] == 'SERVICE':
                            continue
                        total_consumed = bom["quantity"] * comp_qty
                        cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                            quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                        """, (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))
                        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                        bal_row = cur.fetchone()
                        balance_after = bal_row["quantity"] if bal_row else 0
                        cur.execute("""
                        INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                        VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                        """, (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, order_id, code, f"Combo {code} - thanh phan"))

                cur.execute("""
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                VALUES (?, ?, 'COMBO_SALE', ?, ?, ?, ?, ?)
                """, (None, warehouse_id, item.quantity, 0, order_id, code, f"Ban combo {code} x{item.quantity}"))

            else:
                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (base_qty, item.product_id))
                cur.execute("""
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?,
                    updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, item.product_id, -base_qty, base_qty))

                cur.execute("""
                SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                FROM product_bom b
                JOIN ingredients i ON b.ingredient_id = i.id
                WHERE b.product_id = ?
                """, (item.product_id,))
                bom_rows = cur.fetchall()

                for bom in bom_rows:
                    if bom["ingredient_type"] == 'SERVICE':
                        continue
                    total_consumed = bom["quantity"] * base_qty
                    cur.execute("""
                    INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                        quantity = quantity - ?,
                        updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))
                    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                    bal_row = cur.fetchone()
                    balance_after = bal_row["quantity"] if bal_row else 0
                    cur.execute("""
                    INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                    VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                    """, (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, order_id, code, f"Ban {item.quantity} {item.product_id}"))

        if debt_amount > 0:
            if not req.customer_id or req.customer_id == 1:
                raise HTTPException(status_code=400, detail="Khách lẻ không thể ghi nợ. Vui lòng chọn hoặc thêm khách hàng để lưu công nợ đơn hàng.")
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (debt_amount, req.customer_id))

        if actual_paid > 0:
            cb_code = generate_cashbook_code(cur, "PT-BH")
            if req.payments:
                # Thanh toán tách nhiều hình thức: ghi 1 dòng order_payments/cashbook cho mỗi hình thức
                total_split = sum(p.amount for p in req.payments if p.amount > 0)
                for p in req.payments:
                    if p.amount <= 0:
                        continue
                    p_amt = p.amount
                    if total_split > actual_paid and total_split > 0:
                        p_amt = round(p.amount * (actual_paid / total_split))
                    cur.execute("""
                    INSERT INTO order_payments (order_id, method, amount, account_id)
                    VALUES (?, ?, ?, ?)
                    """, (order_id, p.method, p_amt, p.account_id))
                    sub_cb_code = generate_cashbook_code(cur, "PT-BH")
                    cur.execute("""
                    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                    VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?, ?)
                    """, (sub_cb_code, p_amt, req.customer_id, order_id, f"Thu tien don {code} ({p.method})", p.account_id, shift_id))
            else:
                acc_id = getattr(req, "account_id", None)
                pay_method = getattr(req, "payment_method", None) or "cash"
                if not acc_id:
                    if pay_method in ("transfer", "card", "wallet"):
                        cur.execute("SELECT id FROM payment_accounts WHERE account_type = 'bank' AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1")
                        row_acc = cur.fetchone()
                        acc_id = row_acc[0] if row_acc else None
                    else:
                        cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
                        row_acc = cur.fetchone()
                        acc_id = row_acc[0] if row_acc else None
                else:
                    cur.execute("SELECT account_type FROM payment_accounts WHERE id = ?", (acc_id,))
                    row_chk = cur.fetchone()
                    if row_chk:
                        acc_type = row_chk[0]
                        if acc_type == 'bank' and pay_method == 'cash':
                            pay_method = 'transfer'
                        elif acc_type == 'ewallet' and pay_method == 'cash':
                            pay_method = 'wallet'

                cur.execute("""
                INSERT INTO order_payments (order_id, method, amount, account_id)
                VALUES (?, ?, ?, ?)
                """, (order_id, pay_method, actual_paid, acc_id))
                cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?, ?)
                """, (cb_code, actual_paid, req.customer_id, order_id, f"Thu tien don {code} ({pay_method})", acc_id, shift_id))

        # Tích điểm và thăng hạng tự động (Loyalty / Points / Auto-upgrade)
        points_earned = 0
        current_points = 0
        tier_upgraded = None

        if req.customer_id:
            cur.execute("""
                SELECT c.id, c.points, c.segment_id, cs.allow_points, cs.name as segment_name
                FROM contacts c
                LEFT JOIN customer_segments cs ON c.segment_id = cs.id
                WHERE c.id = ?
            """, (req.customer_id,))
            cust_row = cur.fetchone()

            if cust_row:
                cust_points = cust_row["points"] or 0
                allow_pts = cust_row["allow_points"]
                # Khách chưa gắn phân hạng (allow_pts is None) hoặc allow_points == 1 thì cho phép tích điểm
                can_earn_points = (allow_pts is None or allow_pts == 1)

                if can_earn_points and actual_paid > 0:
                    cur.execute("SELECT value FROM settings WHERE key = 'points_exchange_rate'")
                    sett_row = cur.fetchone()
                    try:
                        rate = float(sett_row["value"]) if sett_row and sett_row["value"] else 1000.0
                    except (ValueError, TypeError):
                        rate = 1000.0
                    if rate <= 0:
                        rate = 1000.0

                    points_earned = int(actual_paid // rate)
                    current_points = cust_points + points_earned
                    cur.execute("UPDATE contacts SET points = ? WHERE id = ?", (current_points, req.customer_id))
                    cur.execute("UPDATE orders SET points_earned = ? WHERE id = ?", (points_earned, order_id))

                    # Xét thăng hạng tự động
                    cur.execute("""
                        SELECT id, name, min_points, priority
                        FROM customer_segments
                        WHERE is_active = 1 AND allow_points = 1 AND min_points <= ?
                        ORDER BY min_points DESC, priority DESC, id DESC
                        LIMIT 1
                    """, (current_points,))
                    highest_seg = cur.fetchone()

                    if highest_seg and highest_seg["id"] != cust_row["segment_id"]:
                        cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (highest_seg["id"], req.customer_id))
                        tier_upgraded = highest_seg["name"]
                else:
                    current_points = cust_points

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {
        "status": "ok",
        "order_code": code,
        "order_id": order_id,
        "total_amount": total_amount,
        "spa_wallet_deduction": wallet_deduction,
        "final_amount": final_amount,
        "points_earned": points_earned,
        "current_points": current_points,
        "tier_upgraded": tier_upgraded
    }

@router.delete("/api/orders/{code}")
def delete_order(code: str, user=Depends(require_role("owner"))):
    """
    Xoa/Huy don hang ban:
    - Hoan lai ton kho san pham (products, product_inventory)
    - Hoan lai ton kho nguyen lieu BOM (inventory, inventory_logs)
    - Tru lai cong no khach hang neu co no
    - Xoa phiếu thu tien trong so quỹ (cashbook)
    - Xoa chi tiet order_items va don orders
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM orders WHERE code = ?", (code,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Khong tim thay don hang")
        
        order_id = order["id"]
        customer_id = order["customer_id"]
        debt_amount = order["debt_amount"] or 0

        cur.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
        items = cur.fetchall()

        warehouse_id = order["warehouse_id"] if "warehouse_id" in order.keys() and order["warehouse_id"] else 1

        for item in items:
            prod_id = item["product_id"]
            # Hoan tra theo don vi co ban: nhan he so quy doi da chot luc ban
            qty = item["quantity"] * (float(item["unit_ratio"] or 1) if "unit_ratio" in item.keys() else 1.0)

            cur.execute("SELECT type FROM products WHERE id = ?", (prod_id,))
            p_type_row = cur.fetchone()
            p_type = p_type_row["type"] if p_type_row else "product"

            if p_type == "combo":
                cur.execute("""
                    SELECT ci.product_id, ci.quantity as component_qty
                    FROM combo_items ci
                    JOIN combos c ON ci.combo_id = c.id
                    WHERE c.code = (SELECT code FROM products WHERE id = ? AND type = 'combo')
                      AND c.is_active = 1
                """, (prod_id,))
                combo_components = cur.fetchall()
                for comp in combo_components:
                    comp_id = comp["product_id"]
                    comp_qty = comp["component_qty"] * qty
                    cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (comp_qty, comp_id))
                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, comp_id, comp_qty, comp_qty))

                    cur.execute("""
                        SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                        FROM product_bom b
                        JOIN ingredients i ON b.ingredient_id = i.id
                        WHERE b.product_id = ?
                    """, (comp_id,))
                    bom_rows = cur.fetchall()
                    for bom in bom_rows:
                        if bom["ingredient_type"] == 'SERVICE':
                            continue
                        total_consumed = bom["quantity"] * comp_qty
                        cur.execute("""
                            INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                            ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                                quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                        """, (warehouse_id, bom["ingredient_id"], total_consumed, total_consumed))
            else:
                cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (qty, prod_id))
                cur.execute("""
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, prod_id, qty, qty))

                cur.execute("""
                    SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                    FROM product_bom b
                    JOIN ingredients i ON b.ingredient_id = i.id
                    WHERE b.product_id = ?
                """, (prod_id,))
                bom_rows = cur.fetchall()

                for bom in bom_rows:
                    if bom["ingredient_type"] == 'SERVICE':
                        continue
                    total_consumed = bom["quantity"] * qty
                    cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, bom["ingredient_id"], total_consumed, total_consumed))

        cur.execute("DELETE FROM inventory_logs WHERE order_id = ? OR order_code = ?", (order_id, code))

        if debt_amount > 0 and customer_id:
            cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (debt_amount, customer_id))

        # Hoàn trả số dư ví Spa nếu đơn có trừ ví
        wallet_deduction = order["spa_wallet_deduction"] or 0.0
        if wallet_deduction > 0 and customer_id:
            cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
            c_row = cur.fetchone()
            bal_before = c_row["spa_wallet_balance"] if c_row and c_row["spa_wallet_balance"] else 0.0
            bal_after = bal_before + wallet_deduction
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (bal_after, customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, order_id, type, amount, balance_before, balance_after, note)
                VALUES (?, ?, 'refund', ?, ?, ?, ?)
            """, (customer_id, order_id, wallet_deduction, bal_before, bal_after, f"Hoàn tiền trừ ví do hủy đơn hàng {code}"))

        # Thu hồi điểm tích lũy & hạ hạng thành viên nếu đủ điều kiện
        pts_earned = int(order["points_earned"] or 0) if "points_earned" in order.keys() else 0
        if pts_earned > 0 and customer_id:
            cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (customer_id,))
            c_pts_row = cur.fetchone()
            if c_pts_row:
                cur_pts = c_pts_row["points"] or 0
                new_pts = max(0, cur_pts - pts_earned)
                cur.execute("UPDATE contacts SET points = ? WHERE id = ?", (new_pts, customer_id))

                # Tự động hạ/cập nhật lại phân hạng tương ứng với số điểm mới
                cur.execute("""
                    SELECT id, name, min_points, priority
                    FROM customer_segments
                    WHERE is_active = 1 AND allow_points = 1 AND min_points <= ?
                    ORDER BY min_points DESC, priority DESC, id DESC
                    LIMIT 1
                """, (new_pts,))
                target_seg = cur.fetchone()
                target_seg_id = target_seg["id"] if target_seg else None
                cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (target_seg_id, customer_id))

        cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (order_id,))

        cur.execute("DELETE FROM order_payments WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã xóa đơn hàng {code} thành công"}

@router.put("/api/orders/{code}")
def update_order(code: str, req: OrderUpdate, user=Depends(require_permission("pos.edit_delete_order"))):
    """
    Sua don hang: Cap nhat thong tin khach, nhan vien, ghi chu, thanh toán / cong no.
    Neu co cap nhat danh sach items: hoan kho cũ, áp dụng kho moi.
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM orders WHERE code = ?", (code,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Khong tim thay don hang")
        
        order_id = order["id"]
        old_customer_id = order["customer_id"]
        old_debt = order["debt_amount"] or 0
        old_paid = order["paid_amount"] or 0
        old_final = order["final_amount"] or 0
        warehouse_id = order["warehouse_id"] if "warehouse_id" in order.keys() and order["warehouse_id"] else (req.warehouse_id or 1)

        new_customer_id = req.customer_id if req.customer_id is not None else old_customer_id
        new_staff_id = req.staff_id if req.staff_id is not None else order["staff_id"]
        new_note = req.note if req.note is not None else order["note"]
        new_discount = req.discount if req.discount is not None else order["discount"]

        if req.items is not None:
            cur.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
            old_items = cur.fetchall()
            for oitem in old_items:
                old_base_qty = oitem["quantity"] * (float(oitem["unit_ratio"] or 1) if "unit_ratio" in oitem.keys() else 1.0)
                cur.execute("SELECT type FROM products WHERE id = ?", (oitem["product_id"],))
                p_type_row = cur.fetchone()
                p_type = p_type_row["type"] if p_type_row else "product"

                if p_type == "combo":
                    cur.execute("""
                        SELECT ci.product_id, ci.quantity as component_qty
                        FROM combo_items ci
                        JOIN combos c ON ci.combo_id = c.id
                        WHERE c.code = (SELECT code FROM products WHERE id = ? AND type = 'combo')
                          AND c.is_active = 1
                    """, (oitem["product_id"],))
                    combo_components = cur.fetchall()
                    for comp in combo_components:
                        comp_id = comp["product_id"]
                        comp_qty = comp["component_qty"] * old_base_qty
                        cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (comp_qty, comp_id))
                        cur.execute("""
                            INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                            ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                                quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                        """, (warehouse_id, comp_id, comp_qty, comp_qty))

                        cur.execute("""
                            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                            FROM product_bom b
                            JOIN ingredients i ON b.ingredient_id = i.id
                            WHERE b.product_id = ?
                        """, (comp_id,))
                        bom_rows = cur.fetchall()
                        for bom in bom_rows:
                            if bom["ingredient_type"] == 'SERVICE':
                                continue
                            total_consumed = bom["quantity"] * comp_qty
                            cur.execute("""
                                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                            """, (warehouse_id, bom["ingredient_id"], total_consumed, total_consumed))
                else:
                    cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (old_base_qty, oitem["product_id"]))
                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, oitem["product_id"], old_base_qty, old_base_qty))

                    cur.execute("""
                    SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                    FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?
                    """, (oitem["product_id"],))
                    for bom in cur.fetchall():
                        if bom["ingredient_type"] != 'SERVICE':
                            cur.execute("""
                                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                            """, (warehouse_id, bom["ingredient_id"], bom["quantity"] * old_base_qty, bom["quantity"] * old_base_qty))

            cur.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
            cur.execute("DELETE FROM inventory_logs WHERE order_id = ? OR order_code = ?", (order_id, code))

            total_amount = 0
            for nitem in req.items:
                subtotal = nitem.quantity * nitem.price
                total_amount += subtotal
                n_ratio = float(nitem.unit_ratio or 1)
                if n_ratio <= 0:
                    n_ratio = 1.0
                n_base_qty = round(nitem.quantity * n_ratio, 4)
                cur.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit, unit_ratio)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (order_id, nitem.product_id, nitem.quantity, nitem.price, subtotal, nitem.unit, n_ratio))

                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (n_base_qty, nitem.product_id))
                cur.execute("""
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, nitem.product_id, -n_base_qty, n_base_qty))

                cur.execute("""
                SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?
                """, (nitem.product_id,))
                for bom in cur.fetchall():
                    if bom["ingredient_type"] != 'SERVICE':
                        t_consumed = bom["quantity"] * n_base_qty
                        cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                            quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                        """, (warehouse_id, bom["ingredient_id"], -t_consumed, t_consumed))
                        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                        bal_after = cur.fetchone()["quantity"]
                        cur.execute("""
                        INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                        VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                        """, (bom["ingredient_id"], warehouse_id, -t_consumed, bal_after, order_id, code, f"Sua don {code}"))
        else:
            total_amount = order["total_amount"]

        shipping_fee = float(req.shipping_fee) if req.shipping_fee is not None else float(order["shipping_fee"] or 0.0)
        spa_wallet_deduct = order["spa_wallet_deduction"] or 0.0
        final_amount = max(0, total_amount - spa_wallet_deduct - new_discount + shipping_fee)
        new_paid = req.paid_amount if req.paid_amount is not None else old_paid
        actual_new_paid = min(new_paid, final_amount) if new_paid > 0 else 0.0
        new_debt = max(0, final_amount - actual_new_paid)

        updater_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
        UPDATE orders 
        SET customer_id = ?, staff_id = ?, total_amount = ?, discount = ?, shipping_fee = ?, final_amount = ?, paid_amount = ?, debt_amount = ?, note = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """, (new_customer_id, new_staff_id, total_amount, new_discount, shipping_fee, final_amount, actual_new_paid, new_debt, new_note, updater_name, now_vn, order_id))

        if old_customer_id == new_customer_id:
            diff_debt = new_debt - old_debt
            if diff_debt != 0 and new_customer_id:
                cur.execute("UPDATE contacts SET debt = MAX(0, debt + ?) WHERE id = ?", (diff_debt, new_customer_id))
        else:
            if old_debt > 0 and old_customer_id:
                cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (old_debt, old_customer_id))
            if new_debt > 0 and new_customer_id:
                cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (new_debt, new_customer_id))

        cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (order_id,))
        if actual_new_paid > 0:
            cb_code = generate_cashbook_code(cur, "PT-BH")
            cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?)
            """, (cb_code, actual_new_paid, new_customer_id, order_id, f"Thu tien don {code} (cap nhat)"))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã cập nhật đơn hàng {code}"}

# Nhap hang (Phieu Mua Hang / Nhap Ton)