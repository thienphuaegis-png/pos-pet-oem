from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
import datetime
import time
from database import get_db
from schemas import PurchaseCreate
from logger_config import get_module_logger
from dependencies import require_role, require_permission
from routers.cashbook import generate_cashbook_code

logger = get_module_logger("purchases")

router = APIRouter(tags=["Purchases"])

class PurchaseReceiveItem(BaseModel):
    item_id: int
    actual_quantity: float

class PurchaseReceiveRequest(BaseModel):
    items: Optional[List[PurchaseReceiveItem]] = None
    note: Optional[str] = None

class PurchasePayRequest(BaseModel):
    amount: float
    account_id: Optional[int] = None
    fund_source: Optional[str] = "PERSONAL"
    note: Optional[str] = None

@router.get("/api/purchases/kpi")
def get_purchases_kpi():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count,
            COALESCE(SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END), 0) as received_count,
            COALESCE(SUM(paid_amount), 0) as total_paid,
            COALESCE(SUM(debt_amount), 0) as total_debt,
            COALESCE(SUM(total_amount), 0) as total_amount
        FROM purchases
        WHERE status != 'cancelled'
    """)
    row = dict(cur.fetchone())
    conn.close()
    return row

@router.get("/api/suppliers/{supplier_id}/items")
def get_supplier_items(supplier_id: int):
    conn = get_db()
    cur = conn.cursor()
    # Lấy danh sách sản phẩm/nguyên liệu cung cấp bởi supplier_id (DISTINCT)
    cur.execute('''
    SELECT DISTINCT si.item_type,
           CASE 
               WHEN si.item_type = 'product' THEN p.id 
               ELSE i.id 
           END as id,
           CASE 
               WHEN si.item_type = 'product' THEN p.code 
               ELSE i.code 
           END as code,
           CASE 
               WHEN si.item_type = 'product' THEN p.name 
               ELSE i.name 
           END as name,
           CASE 
               WHEN si.item_type = 'product' THEN p.unit 
               ELSE i.unit 
           END as unit,
           CASE 
               WHEN si.item_type = 'product' THEN p.cost_price 
               ELSE COALESCE(NULLIF(si.default_cost, 0), (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0.0)
           END as cost_price
    FROM supplier_items si
    LEFT JOIN products p ON si.item_type = 'product' AND si.product_id = p.id
    LEFT JOIN ingredients i ON si.item_type = 'ingredient' AND si.ingredient_id = i.id
    WHERE si.supplier_id = ?
    ORDER BY name ASC
    ''', (supplier_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/purchases")
def list_purchases(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT p.*, c.name as supplier_name, c.phone as supplier_phone, w.name as warehouse_name,
           (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) as item_count,
           (SELECT cb.code FROM cashbook cb WHERE cb.ref_type = 'purchase' AND cb.ref_id = p.id ORDER BY cb.id DESC LIMIT 1) as cashbook_code,
           (SELECT cb.id FROM cashbook cb WHERE cb.ref_type = 'purchase' AND cb.ref_id = p.id ORDER BY cb.id DESC LIMIT 1) as cashbook_id,
           (SELECT COUNT(*) FROM cashbook cb WHERE cb.ref_type = 'purchase' AND cb.ref_id = p.id) as cashbook_count
    FROM purchases p
    LEFT JOIN contacts c ON p.supplier_id = c.id
    LEFT JOIN warehouses w ON p.warehouse_id = w.id
    ORDER BY p.id DESC
    LIMIT ?
    ''', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/purchases-pricing/comparison")
def get_price_comparison(search: Optional[str] = None, item_type: Optional[str] = None):
    """
    Bảng so sánh giá nhập giữa các NCC cho từng mặt hàng (Hàng hóa & Nguyên liệu).
    Chỉ lấy 1 mức giá gần nhất duy nhất cho mỗi Nhà cung cấp.
    """
    conn = get_db()
    cur = conn.cursor()

    query = '''
    WITH all_pairs AS (
        SELECT DISTINCT
            si.item_type,
            CASE WHEN si.item_type = 'product' THEN si.product_id ELSE si.ingredient_id END as item_id,
            si.supplier_id
        FROM supplier_items si
        WHERE si.supplier_id IS NOT NULL AND (si.product_id IS NOT NULL OR si.ingredient_id IS NOT NULL)

        UNION

        SELECT DISTINCT
            pi.item_type,
            CASE WHEN pi.item_type = 'product' THEN pi.product_id ELSE pi.ingredient_id END as item_id,
            pch.supplier_id
        FROM purchase_items pi
        JOIN purchases pch ON pi.purchase_id = pch.id
        WHERE pch.supplier_id IS NOT NULL AND (pi.product_id IS NOT NULL OR pi.ingredient_id IS NOT NULL)
    )
    SELECT 
        ap.item_type,
        ap.item_id,
        COALESCE(p.code, i.code, '') as item_code,
        COALESCE(p.name, i.name, '') as item_name,
        COALESCE(p.unit, i.unit, 'cái') as unit,
        ap.supplier_id,
        c.name as supplier_name,
        c.phone as supplier_phone,
        COALESCE((
            SELECT si.default_cost 
            FROM supplier_items si 
            WHERE si.supplier_id = ap.supplier_id 
              AND si.item_type = ap.item_type 
              AND ((ap.item_type = 'product' AND si.product_id = ap.item_id) OR (ap.item_type = 'ingredient' AND si.ingredient_id = ap.item_id))
            LIMIT 1
        ), 0) as default_cost,
        (
            SELECT pi.cost_price 
            FROM purchase_items pi 
            JOIN purchases pch ON pi.purchase_id = pch.id
            WHERE pch.supplier_id = ap.supplier_id 
              AND ((ap.item_type = 'product' AND pi.product_id = ap.item_id) OR (ap.item_type = 'ingredient' AND pi.ingredient_id = ap.item_id))
            ORDER BY pch.created_at DESC, pch.id DESC LIMIT 1
        ) as latest_purchase_price,
        (
            SELECT pch.created_at 
            FROM purchase_items pi 
            JOIN purchases pch ON pi.purchase_id = pch.id
            WHERE pch.supplier_id = ap.supplier_id 
              AND ((ap.item_type = 'product' AND pi.product_id = ap.item_id) OR (ap.item_type = 'ingredient' AND pi.ingredient_id = ap.item_id))
            ORDER BY pch.created_at DESC, pch.id DESC LIMIT 1
        ) as latest_purchase_date,
        (
            SELECT pch.code 
            FROM purchase_items pi 
            JOIN purchases pch ON pi.purchase_id = pch.id
            WHERE pch.supplier_id = ap.supplier_id 
              AND ((ap.item_type = 'product' AND pi.product_id = ap.item_id) OR (ap.item_type = 'ingredient' AND pi.ingredient_id = ap.item_id))
            ORDER BY pch.created_at DESC, pch.id DESC LIMIT 1
        ) as latest_purchase_code
    FROM all_pairs ap
    JOIN contacts c ON ap.supplier_id = c.id
    LEFT JOIN products p ON ap.item_type = 'product' AND ap.item_id = p.id
    LEFT JOIN ingredients i ON ap.item_type = 'ingredient' AND ap.item_id = i.id
    WHERE (p.id IS NOT NULL OR i.id IS NOT NULL)
    '''
    params = []
    if item_type and item_type != 'all':
        query += " AND ap.item_type = ?"
        params.append(item_type)

    if search:
        s = f"%{search}%"
        query += " AND (p.name LIKE ? OR p.code LIKE ? OR i.name LIKE ? OR i.code LIKE ? OR c.name LIKE ?)"
        params.extend([s, s, s, s, s])

    query += " ORDER BY item_name ASC, ap.supplier_id ASC"

    cur.execute(query, params)
    raw_rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    # Nhóm theo mặt hàng để so sánh NCC rẻ nhất / đắt nhất (1 NCC chỉ xuất hiện 1 lần duy nhất)
    grouped = {}
    for r in raw_rows:
        key = f"{r['item_type']}_{r['item_id']}"
        effective_price = r['latest_purchase_price'] if (r['latest_purchase_price'] and r['latest_purchase_price'] > 0) else r['default_cost']
        r['effective_price'] = effective_price

        if key not in grouped:
            grouped[key] = {
                "item_type": r['item_type'],
                "item_id": r['item_id'],
                "item_code": r['item_code'],
                "item_name": r['item_name'],
                "unit": r['unit'],
                "suppliers": [],
                "min_price": None,
                "max_price": None
            }
        grouped[key]["suppliers"].append(r)

    # Tính min_price và max_price cho mỗi mặt hàng
    result = list(grouped.values())
    for item in result:
        valid_prices = [s['effective_price'] for s in item['suppliers'] if s['effective_price'] and s['effective_price'] > 0]
        if valid_prices:
            item['min_price'] = min(valid_prices)
            item['max_price'] = max(valid_prices)

    return result


@router.get("/api/purchases-pricing/fluctuations")
def get_price_fluctuations(search: Optional[str] = None, item_type: Optional[str] = None, filter_status: Optional[str] = "all"):
    """
    Theo dõi biến động giá nhập của từng sản phẩm / nguyên liệu qua các lần nhập (không phân biệt NCC).
    Phục vụ biết giá có tăng hay giảm, tăng bao nhiêu tiền / %.
    filter_status: 'all' | 'increased' (tăng giá) | 'decreased' (giảm giá) | 'changed' (có biến động)
    """
    conn = get_db()
    cur = conn.cursor()

    query = '''
    SELECT 
        pi.item_type,
        CASE WHEN pi.item_type = 'product' THEN pi.product_id ELSE pi.ingredient_id END as item_id,
        COALESCE(p.code, i.code, '') as item_code,
        COALESCE(p.name, i.name, pi.item_name) as item_name,
        COALESCE(p.unit, i.unit, 'cái') as unit,
        pch.code as purchase_code,
        pch.created_at,
        c.name as supplier_name,
        pi.quantity,
        pi.cost_price
    FROM purchase_items pi
    JOIN purchases pch ON pi.purchase_id = pch.id
    LEFT JOIN contacts c ON pch.supplier_id = c.id
    LEFT JOIN products p ON pi.item_type = 'product' AND pi.product_id = p.id
    LEFT JOIN ingredients i ON pi.item_type = 'ingredient' AND pi.ingredient_id = i.id
    WHERE pi.cost_price > 0 AND (p.id IS NOT NULL OR i.id IS NOT NULL)
    '''
    params = []
    if item_type and item_type != 'all':
        query += " AND pi.item_type = ?"
        params.append(item_type)

    if search:
        s = f"%{search}%"
        query += " AND (p.name LIKE ? OR p.code LIKE ? OR i.name LIKE ? OR i.code LIKE ? OR pi.item_name LIKE ?)"
        params.extend([s, s, s, s, s])

    query += " ORDER BY item_name ASC, pch.created_at ASC, pch.id ASC"

    cur.execute(query, params)
    raw_rows = cur.fetchall()
    conn.close()

    items_dict = {}
    for row in raw_rows:
        itype, iid, icode, iname, iunit, pcode, pdate, supname, qty, cost = row
        key = f"{itype}_{iid}"
        if key not in items_dict:
            items_dict[key] = {
                "item_type": itype,
                "item_id": iid,
                "item_code": icode,
                "item_name": iname,
                "unit": iunit,
                "history": []
            }
        items_dict[key]["history"].append({
            "purchase_code": pcode,
            "created_at": pdate,
            "supplier_name": supname,
            "quantity": qty,
            "cost_price": cost
        })

    result = []
    for item in items_dict.values():
        h = item["history"]
        total_p = len(h)
        first_price = h[0]["cost_price"]
        latest_price = h[-1]["cost_price"]
        prev_price = h[-2]["cost_price"] if total_p > 1 else first_price
        min_p = min(x["cost_price"] for x in h)
        max_p = max(x["cost_price"] for x in h)

        # Chênh lệch so với lần nhập liền trước
        diff_prev = latest_price - prev_price
        pct_prev = round((diff_prev / prev_price) * 100, 1) if prev_price > 0 else 0

        # Chênh lệch so với lần nhập đầu tiên
        diff_first = latest_price - first_price
        pct_first = round((diff_first / first_price) * 100, 1) if first_price > 0 else 0

        status = "unchanged"
        if diff_prev > 0:
            status = "increased"
        elif diff_prev < 0:
            status = "decreased"

        item_data = {
            **item,
            "total_purchases": total_p,
            "first_price": first_price,
            "latest_price": latest_price,
            "latest_date": h[-1]["created_at"],
            "latest_supplier": h[-1]["supplier_name"],
            "previous_price": prev_price,
            "min_price": min_p,
            "max_price": max_p,
            "diff_prev": diff_prev,
            "pct_prev": pct_prev,
            "diff_first": diff_first,
            "pct_first": pct_first,
            "status": status
        }

        # Áp dụng bộ lọc biến động
        if filter_status == "increased" and status != "increased":
            continue
        if filter_status == "decreased" and status != "decreased":
            continue
        if filter_status == "changed" and (diff_prev == 0 and diff_first == 0):
            continue

        result.append(item_data)

    # Ưu tiên đưa những mặt hàng có biến động giá lên đầu
    result.sort(key=lambda x: (abs(x["diff_prev"]) == 0, -abs(x["diff_prev"]), x["item_name"]))
    return result


@router.get("/api/purchases/price-history-all")
def get_price_history_all(search: Optional[str] = None, item_type: Optional[str] = None, supplier_id: Optional[int] = None, limit: int = 100):
    """
    Toàn bộ lịch sử biến động giá nhập từng đợt của tất cả các mặt hàng
    """
    conn = get_db()
    cur = conn.cursor()

    query = '''
    SELECT 
        pi.id,
        p_hdr.code as purchase_code,
        p_hdr.created_at,
        pi.item_type,
        COALESCE(pi.product_id, pi.ingredient_id) as item_id,
        COALESCE(p.code, i.code, '') as item_code,
        COALESCE(p.name, i.name, pi.item_name) as item_name,
        COALESCE(p.unit, i.unit, pi.unit, 'cái') as unit,
        c.id as supplier_id,
        c.name as supplier_name,
        pi.quantity,
        pi.cost_price,
        pi.subtotal,
        w.name as warehouse_name
    FROM purchase_items pi
    JOIN purchases p_hdr ON pi.purchase_id = p_hdr.id
    LEFT JOIN contacts c ON p_hdr.supplier_id = c.id
    LEFT JOIN warehouses w ON p_hdr.warehouse_id = w.id
    LEFT JOIN products p ON pi.product_id = p.id
    LEFT JOIN ingredients i ON pi.ingredient_id = i.id
    WHERE 1=1
    '''
    params = []
    if item_type and item_type != 'all':
        query += " AND pi.item_type = ?"
        params.append(item_type)

    if supplier_id:
        query += " AND p_hdr.supplier_id = ?"
        params.append(supplier_id)

    if search:
        s = f"%{search}%"
        query += " AND (p.name LIKE ? OR p.code LIKE ? OR i.name LIKE ? OR i.code LIKE ? OR pi.item_name LIKE ? OR c.name LIKE ? OR p_hdr.code LIKE ?)"
        params.extend([s, s, s, s, s, s, s])

    query += " ORDER BY p_hdr.created_at DESC, pi.id DESC LIMIT ?"
    params.append(limit)

    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/api/purchases/{code}")
def get_purchase_detail(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT p.*, c.name as supplier_name, c.phone as supplier_phone, c.address as supplier_address,
           w.name as warehouse_name
    FROM purchases p
    LEFT JOIN contacts c ON p.supplier_id = c.id
    LEFT JOIN warehouses w ON p.warehouse_id = w.id
    WHERE p.code = ?
    ''', (code,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")
    
    cur.execute('''
    SELECT pi.*,
           COALESCE(p.name, i.name, pi.item_name) as item_name,
           COALESCE(p.code, i.code, '') as item_code,
           COALESCE(p.unit, i.unit, pi.unit, 'cái') as unit
    FROM purchase_items pi
    LEFT JOIN products p ON pi.item_type = 'product' AND pi.product_id = p.id
    LEFT JOIN ingredients i ON pi.item_type = 'ingredient' AND pi.ingredient_id = i.id
    WHERE pi.purchase_id = ?
    ORDER BY pi.id ASC
    ''', (row["id"],))
    items = [dict(r) for r in cur.fetchall()]
    
    result = dict(row)
    result["items"] = items
    conn.close()
    return result

@router.post("/api/purchases")
def create_purchase(req: PurchaseCreate, user=Depends(require_permission("purchases.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        warehouse_id = req.warehouse_id or 1
        subtotal_amount = sum(item.quantity * item.cost_price for item in req.items)
        vat_amount = round((subtotal_amount - req.discount) * (req.vat_rate / 100.0), 2) if req.vat_rate > 0 else 0.0
        total_amount = round(max(0.0, subtotal_amount - req.discount + req.shipping_fee + req.other_fee + vat_amount), 2)
        debt_amount = round(max(0.0, total_amount - req.paid_amount), 2)
        code = f"PN{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

        status = 'draft' if req.status == 'draft' else 'pending'
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"

        cur.execute('''
        INSERT INTO purchases (
            code, supplier_id, warehouse_id, subtotal_amount, discount, 
            shipping_fee, other_fee, vat_rate, vat_amount, total_amount, 
            paid_amount, debt_amount, status, expected_date, fund_source, note, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            code, req.supplier_id, warehouse_id, subtotal_amount, req.discount,
            req.shipping_fee, req.other_fee, req.vat_rate, vat_amount, total_amount,
            req.paid_amount, debt_amount, status, req.expected_date, req.fund_source or 'PERSONAL', req.note, user_name
        ))
        purchase_id = cur.lastrowid

        for item in req.items:
            subtotal = round(item.quantity * item.cost_price, 2)
            prod_id_val = item.product_id if item.item_type == 'product' and item.product_id else None
            cur.execute('''
            INSERT INTO purchase_items (
                purchase_id, item_type, product_id, ingredient_id, item_name, unit, unit_ratio, quantity, cost_price, subtotal, actual_quantity
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                purchase_id, item.item_type, prod_id_val, item.ingredient_id,
                item.item_name, item.unit, max(float(item.unit_ratio or 1), 0.000001),
                item.quantity, item.cost_price, subtotal, item.quantity
            ))

        if req.paid_amount > 0:
            cb_code = generate_cashbook_code(cur, "PC-NH")
            fund_source = req.fund_source or 'PERSONAL'
            cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (fund_source,))
            row_acc = cur.fetchone()
            acc_id = row_acc[0] if row_acc else None
            cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_by)
            VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?, ?, ?, ?)
            ''', (cb_code, req.paid_amount, req.supplier_id, purchase_id, fund_source, f"Chi thanh toán phiếu nhập {code}", acc_id, user_name))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "purchase_code": code, "message": "Tạo phiếu nhập hàng ở trạng thái chờ nhận hàng"}

@router.put("/api/purchases/{code}")
def update_purchase(code: str, req: PurchaseCreate, user=Depends(require_permission("purchases.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchases WHERE code = ?", (code,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")
        if p["status"] not in ('pending', 'draft'):
            raise HTTPException(status_code=400, detail="Chỉ có thể sửa đơn đặt hàng khi còn ở trạng thái chờ nhận hàng hoặc bản nháp!")

        new_status = req.status if req.status in ('pending', 'draft') else p["status"]

        purchase_id = p["id"]
        warehouse_id = req.warehouse_id or 1
        subtotal_amount = sum(item.quantity * item.cost_price for item in req.items)
        vat_amount = round((subtotal_amount - req.discount) * (req.vat_rate / 100.0), 2) if req.vat_rate > 0 else 0.0
        total_amount = round(max(0.0, subtotal_amount - req.discount + req.shipping_fee + req.other_fee + vat_amount), 2)
        debt_amount = round(max(0.0, total_amount - req.paid_amount), 2)

        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute('''
        UPDATE purchases
        SET supplier_id = ?, warehouse_id = ?, subtotal_amount = ?, discount = ?,
            shipping_fee = ?, other_fee = ?, vat_rate = ?, vat_amount = ?, total_amount = ?,
            paid_amount = ?, debt_amount = ?, expected_date = ?, fund_source = ?, note = ?, status = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
        ''', (
            req.supplier_id, warehouse_id, subtotal_amount, req.discount,
            req.shipping_fee, req.other_fee, req.vat_rate, vat_amount, total_amount,
            req.paid_amount, debt_amount, req.expected_date, req.fund_source or 'PERSONAL', req.note, new_status,
            user_name, now_vn, purchase_id
        ))

        cur.execute("DELETE FROM purchase_items WHERE purchase_id = ?", (purchase_id,))

        for item in req.items:
            subtotal = round(item.quantity * item.cost_price, 2)
            prod_id_val = item.product_id if item.item_type == 'product' and item.product_id else None
            cur.execute('''
            INSERT INTO purchase_items (
                purchase_id, item_type, product_id, ingredient_id, item_name, unit, unit_ratio, quantity, cost_price, subtotal, actual_quantity
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                purchase_id, item.item_type, prod_id_val, item.ingredient_id,
                item.item_name, item.unit, max(float(item.unit_ratio or 1), 0.000001),
                item.quantity, item.cost_price, subtotal, item.quantity
            ))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "purchase_code": code, "message": f"Đã cập nhật đơn đặt hàng {code} thành công"}

@router.post("/api/purchases/{code}/receive")
def receive_purchase(code: str, req: Optional[PurchaseReceiveRequest] = None, user=Depends(require_permission("purchases.manage"))):
    """
    Xác nhận nhận hàng thực tế & Kiểm đếm:
    - Nếu có req.items: đối chiếu số lượng thực nhận actual_quantity
    - Cập nhật tồn kho theo số lượng thực nhận
    - Ghi lịch sử giá nhập & thẻ kho
    - Cập nhật công nợ NCC và chi tiền sổ quỹ (nếu có paid_amount)
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchases WHERE code = ?", (code,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")
        if p["status"] == 'received':
            raise HTTPException(status_code=400, detail="Phiếu nhập này đã được nhận hàng trước đó!")
        if p["status"] == 'cancelled':
            raise HTTPException(status_code=400, detail="Phiếu nhập này đã bị hủy, không thể nhận hàng!")

        purchase_id = p["id"]
        warehouse_id = p["warehouse_id"] or 1

        cur.execute("SELECT * FROM purchase_items WHERE purchase_id = ?", (purchase_id,))
        items = [dict(r) for r in cur.fetchall()]

        # Map actual quantity nếu có
        actual_map = {}
        if req and req.items:
            actual_map = {item.item_id: item.actual_quantity for item in req.items}

        new_subtotal = 0.0

        for item in items:
            item_id = item["id"]
            qty = actual_map.get(item_id, item["quantity"])
            if qty < 0:
                qty = 0
            cost = item["cost_price"]
            subtotal = round(qty * cost, 2)
            new_subtotal += subtotal

            cur.execute("UPDATE purchase_items SET actual_quantity = ?, subtotal = ? WHERE id = ?", (qty, subtotal, item_id))

            # Quy doi don vi: qty/cost dang theo don vi nhap (vd Thung), ton kho & gia von luu theo don vi co ban (Chai)
            ratio = float(item["unit_ratio"] or 1) if "unit_ratio" in item.keys() else 1.0
            if ratio <= 0:
                ratio = 1.0
            base_qty = round(qty * ratio, 4)
            base_cost = round(cost / ratio, 4)
            unit_note = f" ({qty:g} {item['unit']} x {ratio:g})" if ratio != 1 else ""

            item_type = item["item_type"]
            if item_type == 'ingredient' and item["ingredient_id"]:
                ing_id = item["ingredient_id"]
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?,
                    updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, ing_id, base_qty, base_qty))

                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, ing_id))
                bal_row = cur.fetchone()
                balance_after = bal_row["quantity"] if bal_row else base_qty

                cur.execute('''
                INSERT INTO price_history (ingredient_id, supplier_id, purchase_price, note)
                VALUES (?, ?, ?, ?)
                ''', (ing_id, p["supplier_id"], base_cost, f"Nhận hàng thực tế phiếu {code}{unit_note}"))

                cur.execute('''
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, supplier_id, note)
                VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?)
                ''', (ing_id, warehouse_id, base_qty, balance_after, p["supplier_id"], f"Nhận hàng thực tế phiếu {code}{unit_note}"))

            elif item["product_id"]:
                prod_id = item["product_id"]
                cur.execute(
                    "UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?",
                    (base_qty, base_cost, prod_id)
                )
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity + ?,
                    updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, prod_id, base_qty, base_qty))

                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, prod_id))
                bal_p = cur.fetchone()
                bal_p_after = bal_p["quantity"] if bal_p else base_qty

                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, supplier_id, note)
                VALUES ('product', ?, ?, 'PURCHASE', ?, ?, ?, ?)
                ''', (prod_id, warehouse_id, base_qty, bal_p_after, p["supplier_id"], f"Nhận hàng thực tế phiếu {code}{unit_note}"))

        # Tính toán lại tổng tiền dựa trên số lượng thực nhận
        vat_rate = p["vat_rate"] or 0
        discount = p["discount"] or 0
        shipping_fee = p["shipping_fee"] or 0
        other_fee = p["other_fee"] or 0
        vat_amount = round((new_subtotal - discount) * (vat_rate / 100.0), 2) if vat_rate > 0 else 0.0
        final_total = round(max(0.0, new_subtotal - discount + shipping_fee + other_fee + vat_amount), 2)
        paid_amount = p["paid_amount"] or 0
        final_debt = round(max(0.0, final_total - paid_amount), 2)

        # Cập nhật công nợ NCC theo số nợ thực tế mới
        if final_debt > 0 and p["supplier_id"]:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (final_debt, p["supplier_id"]))

        # Ghi sổ quỹ nếu có trả trước nhưng chưa sinh phiếu chi đủ
        if paid_amount > 0:
            cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE ref_type = 'purchase' AND ref_id = ?", (purchase_id,))
            already_paid_cb = cur.fetchone()[0] or 0.0
            remaining_to_pay = round(paid_amount - already_paid_cb, 2)
            if remaining_to_pay > 0:
                cb_code = generate_cashbook_code(cur, "PC-NH")
                fund_source = p["fund_source"] or 'PERSONAL'
                cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (fund_source,))
                row_acc = cur.fetchone()
                acc_id = row_acc[0] if row_acc else None
                cur.execute('''
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id)
                VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?, ?, ?)
                ''', (cb_code, remaining_to_pay, p["supplier_id"], purchase_id, fund_source, f"Chi thanh toán phiếu nhập {code}", acc_id))

        # Đổi trạng thái phiếu nhập sang 'received'
        cur.execute('''
        UPDATE purchases 
        SET status = 'received', received_date = CURRENT_TIMESTAMP,
            subtotal_amount = ?, vat_amount = ?, total_amount = ?, debt_amount = ?
        WHERE id = ?
        ''', (new_subtotal, vat_amount, final_total, final_debt, purchase_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã xác nhận nhập kho thực tế thành công phiếu {code}"}

@router.get("/api/purchases/{code}/print-checklist", response_class=HTMLResponse)
def print_purchase_checklist(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.*, c.name as supplier_name, c.phone as supplier_phone, c.address as supplier_address,
               w.name as warehouse_name
        FROM purchases p
        LEFT JOIN contacts c ON p.supplier_id = c.id
        LEFT JOIN warehouses w ON p.warehouse_id = w.id
        WHERE p.code = ?
    """, (code,))
    p = cur.fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")
    p = dict(p)
    
    cur.execute("""
        SELECT pi.*,
               COALESCE(p.name, i.name, pi.item_name) as item_name,
               COALESCE(p.code, i.code, '') as item_code,
               COALESCE(p.unit, i.unit, pi.unit, 'cái') as unit
        FROM purchase_items pi
        LEFT JOIN products p ON pi.item_type = 'product' AND pi.product_id = p.id
        LEFT JOIN ingredients i ON pi.item_type = 'ingredient' AND pi.ingredient_id = i.id
        WHERE pi.purchase_id = ?
        ORDER BY pi.id ASC
    """, (p["id"],))
    items = [dict(r) for r in cur.fetchall()]
    conn.close()

    rows_html = ""
    for idx, item in enumerate(items, 1):
        rows_html += f"""
        <tr>
            <td class="text-center">{idx}</td>
            <td class="font-bold">{item.get('item_name', '')}</td>
            <td class="text-center">{item.get('unit', '')}</td>
            <td class="text-center font-bold" style="font-size: 14px;">{item.get('quantity', 0):,.0f}</td>
            <td class="text-center"><div style="border: 1.5px dashed #475569; width: 60px; height: 28px; margin: auto;"></div></td>
            <td></td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Phiếu Kiểm Nhập Hàng - {code}</title>
    <style>
        @page {{ size: A4 portrait; margin: 15mm; }}
        body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 20px; max-width: 800px; margin: auto; }}
        .header {{ display: flex; justify-content: space-between; border-b: 2px solid #334155; padding-bottom: 12px; margin-bottom: 15px; }}
        .title {{ text-align: center; margin: 20px 0; }}
        .title h1 {{ font-size: 20px; font-weight: 800; text-transform: uppercase; margin: 0; color: #0f172a; }}
        .title p {{ font-size: 12px; color: #64748b; margin: 4px 0 0; }}
        .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-bottom: 15px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 13px; }}
        th {{ background: #f1f5f9; font-weight: bold; text-align: center; }}
        .text-center {{ text-align: center; }}
        .text-right {{ text-align: right; }}
        .font-bold {{ font-weight: bold; }}
        .sign-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; text-align: center; font-size: 13px; }}
        .sign-line {{ margin-top: 70px; border-top: 1px dashed #94a3b8; width: 80%; margin-left: auto; margin-right: auto; }}
        @media print {{
            .no-print {{ display: none !important; }}
            body {{ padding: 0; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px;">
        <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">🖨️ In Phiếu Kiểm Đếm Cầm Tay</button>
        <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">Đóng</button>
    </div>

    <div class="header">
        <div>
            <div style="font-weight: 800; font-size: 16px; color: #0284c7;">HỆ THỐNG QUẢN LÝ MASTERCARE</div>
            <div style="font-size: 12px; color: #64748b;">Kho & Chuỗi Cung Ứng</div>
        </div>
        <div style="text-align: right; font-size: 12px;">
            <div>Mã đơn: <strong style="font-size: 14px;">{code}</strong></div>
            <div>Ngày in: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}</div>
        </div>
    </div>

    <div class="title">
        <h1>PHIẾU KIỂM TAY NHẬP HÀNG THỰC TẾ</h1>
        <p>(Dùng cho thủ kho kiểm đếm số lượng thực tế trước khi nhập hệ thống)</p>
    </div>

    <div class="meta-grid">
        <div><strong>Nhà cung cấp:</strong> {p.get('supplier_name') or '-'}</div>
        <div><strong>Kho nhập hàng:</strong> {p.get('warehouse_name') or 'Kho Chính'}</div>
        <div><strong>Số điện thoại:</strong> {p.get('supplier_phone') or '-'}</div>
        <div><strong>Ngày hẹn giao:</strong> {p.get('expected_date') or '-'}</div>
        <div style="grid-column: span 2;"><strong>Ghi chú đơn:</strong> {p.get('note') or '-'}</div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 40px;">STT</th>
                <th>Tên Hàng Hóa / Vật Tư</th>
                <th style="width: 70px;">ĐVT</th>
                <th style="width: 80px;">SL Đặt</th>
                <th style="width: 100px;">SL Thực Nhận</th>
                <th style="width: 150px;">Tình Trạng & Ghi Chú</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>

    <div class="sign-grid">
        <div>
            <strong>Đại Diện Giao Hàng</strong>
            <div style="font-size: 11px; color: #64748b;">(Ký & ghi rõ họ tên)</div>
            <div class="sign-line"></div>
        </div>
        <div>
            <strong>Người Lập Phiếu</strong>
            <div style="font-size: 11px; color: #64748b;">(Ký & ghi rõ họ tên)</div>
            <div class="sign-line"></div>
        </div>
        <div>
            <strong>Thủ Kho Nhận Hàng</strong>
            <div style="font-size: 11px; color: #64748b;">(Ký & ghi rõ họ tên)</div>
            <div class="sign-line"></div>
        </div>
    </div>
</body>
</html>
"""
    return HTMLResponse(content=html)

@router.delete("/api/purchases/{code}")
def delete_purchase(code: str, user=Depends(require_role("owner"))):
    """
    Xóa/Hủy phiếu nhập hàng: Hoàn lại tồn kho, công nợ NCC và xóa phiếu.
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchases WHERE code = ?", (code,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")

        cur.execute("SELECT * FROM purchase_items WHERE purchase_id = ?", (p["id"],))
        items = cur.fetchall()

        # Hoàn lại tồn kho nếu phiếu đã nhận hàng
        if p["status"] == 'received':
            for item in items:
                if item["item_type"] == 'ingredient' and item["ingredient_id"]:
                    cur.execute('''
                    UPDATE inventory SET quantity = quantity - ? WHERE warehouse_id = ? AND ingredient_id = ?
                    ''', (item["quantity"], p["warehouse_id"], item["ingredient_id"]))

                    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (p["warehouse_id"], item["ingredient_id"]))
                    bal = cur.fetchone()
                    bal_after = bal["quantity"] if bal else 0

                    cur.execute('''
                    INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES (?, ?, 'ADJUST', ?, ?, ?)
                    ''', (item["ingredient_id"], p["warehouse_id"], -item["quantity"], bal_after, f"Hủy phiếu nhập {code}"))

                elif item["product_id"]:
                    cur.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (item["quantity"], item["product_id"]))
                    cur.execute('''
                    UPDATE product_inventory SET quantity = quantity - ? 
                    WHERE warehouse_id = ? AND product_id = ?
                    ''', (item["quantity"], p["warehouse_id"], item["product_id"]))
                    
                    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (p["warehouse_id"], item["product_id"]))
                    bal_p = cur.fetchone()
                    bal_p_after = bal_p["quantity"] if bal_p else 0
                    cur.execute('''
                    INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES ('product', ?, ?, 'ADJUST', ?, ?, ?)
                    ''', (item["product_id"], p["warehouse_id"], -item["quantity"], bal_p_after, f"Hủy phiếu nhập {code}"))

            # Hoàn lại công nợ NCC
            if p["debt_amount"] > 0 and p["supplier_id"]:
                cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (p["debt_amount"], p["supplier_id"]))

            # Xóa bản ghi thu chi cashbook liên quan
            cur.execute("DELETE FROM cashbook WHERE ref_type = 'purchase' AND ref_id = ?", (p["id"],))

        # Xóa purchase_items và purchase
        cur.execute("DELETE FROM purchase_items WHERE purchase_id = ?", (p["id"],))
        cur.execute("DELETE FROM purchases WHERE id = ?", (p["id"],))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã hủy phiếu nhập {code}"}

@router.get("/api/suppliers/{supplier_id}/assignable-items")
def get_supplier_assignable_items(supplier_id: int):
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT product_id FROM supplier_items WHERE supplier_id = ? AND item_type = 'product'", (supplier_id,))
    assigned_prod_ids = set(r[0] for r in cur.fetchall() if r[0])
    
    cur.execute("SELECT ingredient_id FROM supplier_items WHERE supplier_id = ? AND item_type = 'ingredient'", (supplier_id,))
    assigned_ing_ids = set(r[0] for r in cur.fetchall() if r[0])
    
    cur.execute("SELECT id, code, name, unit, cost_price, category FROM products WHERE is_active = 1 ORDER BY name ASC")
    products = [
        {
            "id": r["id"],
            "item_type": "product",
            "code": r["code"] or "",
            "name": r["name"],
            "unit": r["unit"] or "cái",
            "cost_price": r["cost_price"] or 0,
            "category": r["category"] or "Hàng Hóa",
            "is_assigned": r["id"] in assigned_prod_ids
        }
        for r in cur.fetchall()
    ]
    
    cur.execute("""
        SELECT i.id, i.code, i.name, i.unit, i.type as ing_type,
               COALESCE((SELECT purchase_price FROM price_history WHERE ingredient_id = i.id ORDER BY effective_date DESC LIMIT 1), 0) as cost_price
        FROM ingredients i
        ORDER BY i.name ASC
    """)
    ingredients = [
        {
            "id": r["id"],
            "item_type": "ingredient",
            "code": r["code"] or "",
            "name": r["name"],
            "unit": r["unit"] or "kg",
            "cost_price": r["cost_price"] or 0,
            "category": "Nguyên Liệu",
            "is_assigned": r["id"] in assigned_ing_ids
        }
        for r in cur.fetchall()
    ]
    
    conn.close()
    return {
        "supplier_id": supplier_id,
        "items": products + ingredients
    }

class SupplierItemAssignPayload(BaseModel):
    items: List[dict]

@router.post("/api/suppliers/{supplier_id}/assign-items")
def assign_supplier_items(supplier_id: int, payload: SupplierItemAssignPayload):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM supplier_items WHERE supplier_id = ?", (supplier_id,))
        for it in payload.items:
            itype = it.get("item_type")
            iid = it.get("item_id")
            if not itype or not iid:
                continue
            if itype == "product":
                cur.execute(
                    "INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, ?)",
                    (supplier_id, iid, it.get("cost_price", 0))
                )
            elif itype == "ingredient":
                cur.execute(
                    "INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, ingredient_id, default_cost) VALUES (?, 'ingredient', ?, ?)",
                    (supplier_id, iid, it.get("cost_price", 0))
                )
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã gán {len(payload.items)} mặt hàng cho nhà cung cấp!"}

@router.post("/api/purchases/{code}/pay")
def pay_purchase_debt(code: str, req: PurchasePayRequest, user=Depends(require_permission("purchases.manage"))):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải lớn hơn 0")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchases WHERE code = ?", (code,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu nhập")
        if p["status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Phiếu nhập đã bị hủy, không thể thanh toán!")

        current_debt = float(p["debt_amount"] or 0.0)
        if req.amount > current_debt + 100:  # dung sai 100đ
            raise HTTPException(status_code=400, detail=f"Số tiền thanh toán ({req.amount:,.0f} đ) vượt quá số nợ còn lại ({current_debt:,.0f} đ)")

        pay_amount = min(req.amount, current_debt)
        new_paid = round(float(p["paid_amount"] or 0) + pay_amount, 2)
        new_debt = round(max(0.0, float(current_debt) - pay_amount), 2)

        # Cập nhật phiếu nhập
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
            UPDATE purchases
            SET paid_amount = ?, debt_amount = ?, updated_by = ?, updated_at = ?
            WHERE id = ?
        """, (new_paid, new_debt, user_name, now_vn, p["id"]))

        # Giảm công nợ NCC
        if p["supplier_id"]:
            fund_source = (req.fund_source or p["fund_source"] or "PERSONAL").upper()
            if fund_source == "PERSONAL":
                cur.execute("UPDATE contacts SET debt = MAX(0.0, debt - ?), initial_debt_personal = MAX(0.0, initial_debt_personal - ?) WHERE id = ?", (pay_amount, pay_amount, p["supplier_id"]))
            else:
                cur.execute("UPDATE contacts SET debt = MAX(0.0, debt - ?), initial_debt_company = MAX(0.0, initial_debt_company - ?) WHERE id = ?", (pay_amount, pay_amount, p["supplier_id"]))

        # Lập phiếu chi cashbook
        cb_code = generate_cashbook_code(cur, "PC-NH")
        acc_id = req.account_id
        fund_source = (req.fund_source or p["fund_source"] or "PERSONAL").upper()
        if not acc_id:
            cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (fund_source,))
            row_acc = cur.fetchone()
            acc_id = row_acc[0] if row_acc else None

        cb_note = req.note or f"Chi thanh toán công nợ phiếu nhập {code}"
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_by)
            VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?, ?, ?, ?)
        """, (cb_code, pay_amount, p["supplier_id"], p["id"], fund_source, cb_note, acc_id, user_name))

        conn.commit()
        return {
            "status": "ok",
            "message": f"Đã lập phiếu chi {cb_code} thanh toán {pay_amount:,.0f} đ cho phiếu nhập {code}",
            "cashbook_code": cb_code,
            "paid_amount": new_paid,
            "debt_amount": new_debt
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# San xuat (BOM Execution)
