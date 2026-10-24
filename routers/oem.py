from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
import datetime
from database import get_db, archive_code, is_code_archived
from schemas import (
    OEMOrderCreate, OEMOrderUpdate, OEMOrderDeposit, OEMOrderReceive
)
from pydantic import BaseModel
from dependencies import require_permission, require_any_permission, get_current_user, check_permission

class OEMStockCheckItem(BaseModel):
    item_type: Optional[str] = "product"  # 'product' hoac 'ingredient'
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    quantity: float

class OEMStockCheckRequest(BaseModel):
    warehouse_id: int
    items: List[OEMStockCheckItem]

class LinkWarehouseRequest(BaseModel):
    supplier_id: int
    warehouse_id: int

class LinkProductRequest(BaseModel):
    product_id: int

class SupplierDebtPaymentRequest(BaseModel):
    supplier_id: int
    amount: float
    fund_source: str = "COMPANY"
    note: Optional[str] = None
    payment_date: Optional[str] = None
    account_id: Optional[int] = None

class OrderDebtPaymentRequest(BaseModel):
    order_type: str # 'PO' or 'OEM'
    order_id: int
    amount: float
    fund_source: str = "COMPANY"
    note: Optional[str] = None
    payment_date: Optional[str] = None
    account_id: Optional[int] = None

from logger_config import get_module_logger
from routers.cashbook import generate_cashbook_code

logger = get_module_logger("oem")

router = APIRouter(tags=["oem"])

def generate_oem_code(cur):
    """Sinh mã đơn đặt gia công: OEM-{YYYYMMDD}-{seq:03d} (chống trùng mã vĩnh viễn)"""
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    pattern = f"OEM-{today_str}-%"
    cur.execute("""
        SELECT MAX(CAST(SUBSTR(code, 14) AS INTEGER))
        FROM (
            SELECT code FROM oem_orders WHERE code LIKE ?
            UNION ALL
            SELECT code FROM archived_codes WHERE code LIKE ?
        )
    """, (pattern, pattern))
    row = cur.fetchone()
    max_seq = row[0] if row and row[0] is not None else 0
    seq = max_seq + 1

    while True:
        candidate = f"OEM-{today_str}-{seq:03d}"
        cur.execute("SELECT 1 FROM oem_orders WHERE code = ?", (candidate,))
        if not cur.fetchone() and not is_code_archived(cur, candidate):
            archive_code(cur, candidate, "oem")
            return candidate
        seq += 1

@router.get("/api/oem/factories")
def list_oem_factories():
    """Chỉ trả về các nhà máy gia công có gắn kho xưởng OEM"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            c.id, c.name, c.phone, c.address,
            w.id as warehouse_id, w.name as warehouse_name, w.code as warehouse_code,
            (SELECT COUNT(*) FROM supplier_items si WHERE si.supplier_id = c.id AND si.item_type = 'product') as product_count
        FROM contacts c
        JOIN warehouses w ON w.supplier_id = c.id
        WHERE c.type = 'supplier' AND w.is_active = 1
        ORDER BY c.name ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

class UnlinkWarehouseRequest(BaseModel):
    warehouse_id: int

@router.post("/api/oem/factories/link-warehouse")
def link_factory_warehouse(req: LinkWarehouseRequest, user=Depends(require_permission("oem.manage"))):
    """Gán nhà máy với một kho hàng để nhận diện kho tự động"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE warehouses SET supplier_id = ?, is_oem = 1 WHERE id = ?", (req.supplier_id, req.warehouse_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Đã gán nhà máy với kho xưởng thành công"}

@router.post("/api/oem/factories/unlink-warehouse")
def unlink_factory_warehouse(req: UnlinkWarehouseRequest, user=Depends(require_permission("oem.manage"))):
    """Gỡ liên kết kho xưởng khỏi nhà máy gia công"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE warehouses SET supplier_id = NULL, is_oem = 0 WHERE id = ?", (req.warehouse_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Đã gỡ liên kết kho xưởng thành công"}

@router.get("/api/oem/factories/{supplier_id}/products")
def list_factory_products(supplier_id: int):
    """Lấy danh sách sản phẩm thuộc nhà máy này gia công (không cần bơi trong 100+ SP)"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            p.id, p.code, p.name, p.unit,
            COALESCE(
                (SELECT oi.unit_price FROM oem_order_items oi JOIN oem_orders o ON oi.order_id = o.id WHERE o.partner_id = ? AND oi.product_id = p.id ORDER BY o.id DESC LIMIT 1),
                CASE WHEN MAX(si.default_cost) > 0 THEN MAX(si.default_cost) ELSE NULL END,
                CASE WHEN p.cost_price > 0 THEN p.cost_price ELSE NULL END,
                0
            ) as cost_price,
            p.sell_price,
            (SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = p.id) as bom_count
        FROM supplier_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.supplier_id = ? AND si.item_type = 'product' AND p.is_active = 1
        GROUP BY p.id
        ORDER BY p.name ASC
    """, (supplier_id, supplier_id))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/oem/factories/{supplier_id}/link-product")
def link_product_to_factory(supplier_id: int, req: LinkProductRequest, user=Depends(require_permission("oem.manage"))):
    """Gán nhanh một sản phẩm cho nhà máy gia công"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id)
        VALUES (?, 'product', ?)
    """, (supplier_id, req.product_id))
    conn.commit()
    conn.close()
    return {"success": True}

@router.post("/api/oem/calculate-bom-stock")
def calculate_bom_stock(req: OEMStockCheckRequest):
    """Tính toán nhu cầu tem, chai, nắp theo BOM và đối chiếu với tồn kho thực tế tại xưởng"""
    conn = get_db()
    cur = conn.cursor()
    
    needed_materials = {} # ingredient_id -> dict
    
    for item in req.items:
        if item.quantity <= 0:
            continue
        
        # Nếu là sản phẩm hoàn thiện
        if item.item_type != "ingredient" and item.product_id:
            cur.execute("""
                SELECT pb.ingredient_id, pb.quantity, i.code, i.name, i.unit
                FROM product_bom pb
                JOIN ingredients i ON pb.ingredient_id = i.id
                WHERE pb.product_id = ?
            """, (item.product_id,))
            rows = cur.fetchall()
        # Nếu là nguyên liệu gia công từ phôi
        elif item.item_type == "ingredient" and item.ingredient_id:
            cur.execute("""
                SELECT ib.child_ingredient_id as ingredient_id, ib.quantity, i.code, i.name, i.unit
                FROM ingredient_bom ib
                JOIN ingredients i ON ib.child_ingredient_id = i.id
                WHERE ib.parent_ingredient_id = ?
            """, (item.ingredient_id,))
            rows = cur.fetchall()
        else:
            rows = []

        for row in rows:
            ing_id = row["ingredient_id"]
            qty = row["quantity"] * item.quantity
            if ing_id not in needed_materials:
                needed_materials[ing_id] = {
                    "ingredient_id": ing_id,
                    "code": row["code"],
                    "name": row["name"],
                    "unit": row["unit"],
                    "needed_qty": 0.0,
                    "current_stock": 0.0,
                }
            needed_materials[ing_id]["needed_qty"] += qty
            
    # Lấy tồn kho hiện tại tại kho req.warehouse_id
    results = []
    for ing_id, data in needed_materials.items():
        cur.execute("""
            SELECT COALESCE(quantity, 0) as stock
            FROM inventory
            WHERE warehouse_id = ? AND ingredient_id = ?
        """, (req.warehouse_id, ing_id))
        stock_row = cur.fetchone()
        stock = float(stock_row["stock"]) if stock_row else 0.0
        data["current_stock"] = stock
        diff = stock - data["needed_qty"]
        data["diff_qty"] = diff
        data["is_sufficient"] = (diff >= 0)
        results.append(data)
        
    conn.close()
    return results

@router.get("/api/oem/orders")
def list_oem_orders(status: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT 
            o.*,
            c.name as partner_name,
            c.phone as partner_phone,
            w_oem.name as oem_warehouse_name,
            w_dest.name as dest_warehouse_name,
            (SELECT COUNT(*) FROM oem_order_items oi WHERE oi.order_id = o.id) as item_count
        FROM oem_orders o
        LEFT JOIN contacts c ON o.partner_id = c.id
        LEFT JOIN warehouses w_oem ON o.oem_warehouse_id = w_oem.id
        LEFT JOIN warehouses w_dest ON o.dest_warehouse_id = w_dest.id
    """
    params = []
    if status:
        query += " WHERE o.status = ?"
        params.append(status)
    query += " ORDER BY o.id DESC"
    
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/oem/orders/{order_id}")
def get_oem_order_detail(order_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            o.*,
            c.name as partner_name,
            c.phone as partner_phone,
            w_oem.name as oem_warehouse_name,
            w_dest.name as dest_warehouse_name
        FROM oem_orders o
        LEFT JOIN contacts c ON o.partner_id = c.id
        LEFT JOIN warehouses w_oem ON o.oem_warehouse_id = w_oem.id
        LEFT JOIN warehouses w_dest ON o.dest_warehouse_id = w_dest.id
        WHERE o.id = ?
    """, (order_id,))
    order_row = cur.fetchone()
    if not order_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn gia công OEM")
    
    order = dict(order_row)
    
    # Lấy danh sách sản phẩm/nguyên liệu trong đơn
    cur.execute("""
        SELECT 
            oi.*,
            COALESCE(p.code, ing.code, '') as product_code,
            COALESCE(p.name, ing.name, '') as product_name,
            COALESCE(p.unit, ing.unit, '') as product_unit,
            CASE 
                WHEN oi.item_type = 'ingredient' THEN (SELECT COUNT(*) FROM ingredient_bom ib WHERE ib.parent_ingredient_id = oi.ingredient_id)
                ELSE (SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = oi.product_id)
            END as bom_count
        FROM oem_order_items oi
        LEFT JOIN products p ON oi.product_id = p.id AND (oi.item_type IS NULL OR oi.item_type = 'product')
        LEFT JOIN ingredients ing ON oi.ingredient_id = ing.id AND oi.item_type = 'ingredient'
        WHERE oi.order_id = ?
    """, (order_id,))
    items = [dict(r) for r in cur.fetchall()]
    
    # Lấy bảng BOM nguyên liệu cần dùng (tem, chai, phôi...) và tồn kho hiện tại ở kho xưởng
    materials_needed = []
    for it in items:
        qty = it["received_qty"] if it["received_qty"] > 0 else it["ordered_qty"]
        is_ing = (it.get("item_type") == "ingredient")
        
        if not is_ing and it.get("product_id"):
            prod_id = it["product_id"]
            cur.execute("""
                SELECT 
                    pb.quantity as bom_qty,
                    i.id as ingredient_id,
                    i.code as ingredient_code,
                    i.name as ingredient_name,
                    i.unit as ingredient_unit,
                    i.type as ingredient_type,
                    COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as ingredient_latest_cost,
                    COALESCE(inv.quantity, 0) as current_stock_at_oem
                FROM product_bom pb
                JOIN ingredients i ON pb.ingredient_id = i.id
                LEFT JOIN inventory inv ON inv.ingredient_id = i.id AND inv.warehouse_id = ?
                WHERE pb.product_id = ?
            """, (order["oem_warehouse_id"], prod_id))
            bom_rows = cur.fetchall()
        elif is_ing and it.get("ingredient_id"):
            ing_id = it["ingredient_id"]
            cur.execute("""
                SELECT 
                    ib.quantity as bom_qty,
                    i.id as ingredient_id,
                    i.code as ingredient_code,
                    i.name as ingredient_name,
                    i.unit as ingredient_unit,
                    i.type as ingredient_type,
                    COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as ingredient_latest_cost,
                    COALESCE(inv.quantity, 0) as current_stock_at_oem
                FROM ingredient_bom ib
                JOIN ingredients i ON ib.child_ingredient_id = i.id
                LEFT JOIN inventory inv ON inv.ingredient_id = i.id AND inv.warehouse_id = ?
                WHERE ib.parent_ingredient_id = ?
            """, (order["oem_warehouse_id"], ing_id))
            bom_rows = cur.fetchall()
        else:
            bom_rows = []
        
        for bom in bom_rows:
            materials_needed.append({
                "product_id": it.get("product_id"),
                "ingredient_parent_id": it.get("ingredient_id"),
                "product_name": it["product_name"],
                "ingredient_id": bom["ingredient_id"],
                "ingredient_code": bom["ingredient_code"],
                "ingredient_name": bom["ingredient_name"],
                "ingredient_unit": bom["ingredient_unit"],
                "ingredient_type": bom["ingredient_type"],
                "bom_qty": bom["bom_qty"],
                "needed_qty": bom["bom_qty"] * qty,
                "current_stock_at_oem": bom["current_stock_at_oem"],
                "latest_cost": bom["ingredient_latest_cost"]
            })
            
    order["items"] = items
    order["materials_needed"] = materials_needed
    conn.close()
    return order

@router.post("/api/oem/orders")
def create_oem_order(req: OEMOrderCreate, user=Depends(require_permission("oem.manage"))):
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Đơn hàng phải có ít nhất 1 sản phẩm")
        
    conn = get_db()
    cur = conn.cursor()
    try:
        code = generate_oem_code(cur)
        total_raw = sum(it.ordered_qty * it.unit_price for it in req.items)

        # Tính chiết khấu theo % hoặc theo số tiền cụ thể
        if getattr(req, "discount_type", "percent") == "amount" and req.discount_amount is not None:
            discount_val = max(0.0, float(req.discount_amount))
            discount_pct = (discount_val / total_raw * 100.0) if total_raw > 0 else 0.0
        else:
            discount_pct = max(0.0, float(req.discount_percent or 0.0))
            discount_val = total_raw * (discount_pct / 100.0)

        raw_after_discount = max(0.0, total_raw - discount_val)
        discount_factor = (raw_after_discount / total_raw) if total_raw > 0 else 1.0

        # Multi-VAT cho từng item
        has_item_vat = any(getattr(it, "vat_rate", None) is not None for it in req.items)
        total_vat_amount = 0.0
        item_vat_data = []
        for it in req.items:
            item_vat_rate = it.vat_rate if getattr(it, "vat_rate", None) is not None else (req.vat_percent or 8.0)
            item_raw = it.ordered_qty * it.unit_price
            item_vat = round(item_raw * (item_vat_rate / 100.0), 2)
            total_vat_amount += item_vat
            # Phương án B: giá vốn gồm thuế = unit_price * discount_factor * (1 + vat_rate / 100)
            net_cost = it.unit_price * discount_factor * (1.0 + (item_vat_rate / 100.0))
            item_vat_data.append((item_vat_rate, item_vat, net_cost))

        if not has_item_vat and req.vat_percent > 0:
            total_vat_amount = round(total_raw * (req.vat_percent / 100.0), 2)

        vat_amount = round(total_vat_amount, 2)
        total_final = round(raw_after_discount + vat_amount, 2)
        deposit_val = 0.0 if getattr(req, "is_draft", False) else req.deposit_amount
        remaining = max(0.0, total_final - deposit_val)
        
        status = "DRAFT" if getattr(req, "is_draft", False) or deposit_val <= 0 else "DEPOSITED"
        deposit_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") if deposit_val > 0 else None
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        
        cur.execute("""
            INSERT INTO oem_orders (
                code, partner_id, target_type, oem_warehouse_id, dest_warehouse_id,
                status, expected_delivery_date, fund_source,
                vat_percent, discount_percent, deposit_amount, deposit_date,
                total_raw_amount, vat_amount, total_final_amount, remaining_payment,
                payment_status, note, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code, req.partner_id, getattr(req, "target_type", "product") or "product", req.oem_warehouse_id, req.dest_warehouse_id,
            status, req.expected_delivery_date, req.fund_source,
            req.vat_percent, discount_pct, deposit_val, deposit_date,
            total_raw, vat_amount, total_final, remaining,
            "PARTIAL" if deposit_val > 0 else "UNPAID", req.note or "", user_name
        ))
        order_id = cur.lastrowid
        
        for idx, it in enumerate(req.items):
            item_vat_rate, item_vat_amt, net_cost = item_vat_data[idx]
            item_type = getattr(it, "item_type", "product") or ("ingredient" if it.ingredient_id else "product")
            cur.execute("""
                INSERT INTO oem_order_items (
                    order_id, item_type, product_id, ingredient_id, ordered_qty, received_qty,
                    unit_price, final_unit_cost, full_cost_per_unit, vat_rate, vat_amount
                ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)
            """, (order_id, item_type, it.product_id, it.ingredient_id, it.ordered_qty, it.unit_price, net_cost, item_vat_rate, item_vat_amt))

            # Ghi nhớ đơn giá gia công vào quan hệ nhà máy nếu có giá > 0
            if it.unit_price > 0 and it.product_id:
                cur.execute("""
                    UPDATE supplier_items 
                    SET default_cost = ? 
                    WHERE supplier_id = ? AND item_type = 'product' AND product_id = ?
                """, (it.unit_price, req.partner_id, it.product_id))
            elif it.unit_price > 0 and it.ingredient_id:
                cur.execute("""
                    UPDATE supplier_items 
                    SET default_cost = ? 
                    WHERE supplier_id = ? AND item_type = 'ingredient' AND ingredient_id = ?
                """, (it.unit_price, req.partner_id, it.ingredient_id))
            
        # Nếu có cọc đợt 1 ngay, ghi nhận vào Sổ Quỹ (cashbook)
        if not getattr(req, "is_draft", False) and deposit_val > 0:
            cb_code = generate_cashbook_code(cur, "PC-OEM")
            cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (req.fund_source,))
            row_acc = cur.fetchone()
            acc_id = row_acc[0] if row_acc else None
            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, fund_source, account_id)
                VALUES (?, 'out', 'OEM_DEPOSIT', ?, ?, 'oem_order', ?, ?, ?, ?)
            """, (
                cb_code, deposit_val, req.partner_id, order_id,
                f"Cọc 50% đơn gia công OEM {code}", req.fund_source, acc_id
            ))
            
        conn.commit()
        return {"success": True, "id": order_id, "code": code, "total_final": total_final, "deposit": deposit_val}
    except Exception as e:
        conn.rollback()
        logger.error(f"Lỗi tạo đơn OEM: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.put("/api/oem/orders/{order_id}")
def update_oem_order(order_id: int, req: OEMOrderUpdate, user=Depends(require_permission("oem.manage"))):
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Đơn hàng phải có ít nhất 1 sản phẩm")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
        o = cur.fetchone()
        if not o:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn gia công")

        total_raw = sum(it.ordered_qty * it.unit_price for it in req.items)

        if getattr(req, "discount_type", "percent") == "amount" and req.discount_amount is not None:
            discount_val = max(0.0, float(req.discount_amount))
            discount_pct = (discount_val / total_raw * 100.0) if total_raw > 0 else 0.0
        else:
            discount_pct = max(0.0, float(req.discount_percent or 0.0))
            discount_val = total_raw * (discount_pct / 100.0)

        raw_after_discount = max(0.0, total_raw - discount_val)
        discount_factor = (raw_after_discount / total_raw) if total_raw > 0 else 1.0

        # Multi-VAT cho từng item
        has_item_vat = any(getattr(it, "vat_rate", None) is not None for it in req.items)
        total_vat_amount = 0.0
        item_vat_data = []
        for it in req.items:
            item_vat_rate = it.vat_rate if getattr(it, "vat_rate", None) is not None else (req.vat_percent or 8.0)
            item_raw = it.ordered_qty * it.unit_price
            item_vat = round(item_raw * (item_vat_rate / 100.0), 2)
            total_vat_amount += item_vat
            net_cost = it.unit_price * discount_factor * (1.0 + (item_vat_rate / 100.0))
            item_vat_data.append((item_vat_rate, item_vat, net_cost))

        if not has_item_vat and req.vat_percent > 0:
            total_vat_amount = round(total_raw * (req.vat_percent / 100.0), 2)

        vat_amount = round(total_vat_amount, 2)
        total_final = round(raw_after_discount + vat_amount, 2)
        remaining = max(0.0, total_final - (o["deposit_amount"] or 0.0))

        if getattr(req, "is_draft", False):
            status = "DRAFT"
        elif getattr(req, "is_confirm", False):
            status = "DEPOSITED"
        elif o["status"] == "DRAFT":
            # Nếu đang là DRAFT mà không yêu cầu draft tiếp, kiểm tra có cọc không để chuyển DEPOSITED
            status = "DEPOSITED" if (o["deposit_amount"] or 0.0) > 0 else "DRAFT"
        else:
            status = o["status"]

        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        cur.execute("""
            UPDATE oem_orders
            SET partner_id = ?, oem_warehouse_id = ?, dest_warehouse_id = ?,
                expected_delivery_date = ?, vat_percent = ?, discount_percent = ?,
                total_raw_amount = ?, vat_amount = ?, total_final_amount = ?, remaining_payment = ?, note = ?,
                fund_source = ?, status = ?, updated_by = ?, updated_at = ?
            WHERE id = ?
        """, (
            req.partner_id, req.oem_warehouse_id, req.dest_warehouse_id,
            req.expected_delivery_date, req.vat_percent, discount_pct,
            total_raw, vat_amount, total_final, remaining, req.note or "", getattr(req, "fund_source", "COMPANY") or "COMPANY", status, user_name, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), order_id
        ))

        is_received = o["status"] in ("RECEIVED", "COMPLETED")
        # Bảo toàn số lượng đặt ban đầu nếu đơn đã nhận hàng, tránh lệnh sửa đơn xóa đè
        cur.execute("SELECT product_id, ingredient_id, ordered_qty, received_qty FROM oem_order_items WHERE order_id = ?", (order_id,))
        old_items_map = {}
        for r in cur.fetchall():
            key = (r["product_id"], r["ingredient_id"])
            old_items_map[key] = (r["ordered_qty"], r["received_qty"])

        cur.execute("DELETE FROM oem_order_items WHERE order_id = ?", (order_id,))
        for idx, it in enumerate(req.items):
            item_vat_rate, item_vat_amt, net_cost = item_vat_data[idx]
            key = (it.product_id, getattr(it, "ingredient_id", None))
            if is_received and key in old_items_map:
                old_ord, old_rec = old_items_map[key]
                # Nếu đã nhận hàng: giữ nguyên ordered_qty gốc
                ord_qty = old_ord if old_ord and old_ord > 0 else it.ordered_qty
                rec_qty = old_rec if old_rec and old_rec > 0 else it.ordered_qty
            else:
                ord_qty = it.ordered_qty
                rec_qty = it.ordered_qty if is_received else 0

            cur.execute("""
                INSERT INTO oem_order_items (
                    order_id, product_id, ordered_qty, received_qty,
                    unit_price, final_unit_cost, full_cost_per_unit, vat_rate, vat_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (order_id, it.product_id, ord_qty, rec_qty, it.unit_price, net_cost, net_cost, item_vat_rate, item_vat_amt))

        conn.commit()
        return {"success": True, "id": order_id, "total_final": total_final}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Lỗi sửa đơn OEM: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.delete("/api/oem/orders/{order_id}")
def delete_oem_order(order_id: int, user=Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
        o = cur.fetchone()
        if not o:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn gia công")

        order = dict(o)
        status = order.get("status")

        if status != "DRAFT":
            if user.get("role") not in ("owner", "admin") and not check_permission(user.get("id"), user.get("role", ""), "oem.manage"):
                raise HTTPException(status_code=403, detail="Chỉ Quản trị viên mới được quyền xóa đơn gia công đã đặt cọc hoặc đã nhận hàng")

        # 1. Nếu đơn đã nhận hàng: hoàn tác tồn kho thành phẩm + nguyên liệu xưởng
        if status in ("RECEIVED", "COMPLETED"):
            cur.execute("SELECT * FROM oem_order_items WHERE order_id = ?", (order_id,))
            items = [dict(r) for r in cur.fetchall()]
            for it in items:
                prod_id = it["product_id"]
                rec_qty = float(it.get("received_qty") or it.get("ordered_qty") or 0.0)
                if rec_qty > 0:
                    # Trừ tồn kho thành phẩm tại kho đích
                    if order.get("dest_warehouse_id"):
                        cur.execute("""
                            UPDATE product_inventory 
                            SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP
                            WHERE product_id = ? AND warehouse_id = ?
                        """, (rec_qty, prod_id, order["dest_warehouse_id"]))
                    cur.execute("""
                        UPDATE products
                        SET stock = MAX(0, stock - ?)
                        WHERE id = ?
                    """, (rec_qty, prod_id))
                    cur.execute("""
                        INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                        VALUES ('product', ?, ?, 'ADJUST', ?, 
                                (SELECT COALESCE(quantity, 0) FROM product_inventory WHERE product_id = ? AND warehouse_id = ?), 
                                ?)
                    """, (prod_id, order.get("dest_warehouse_id") or 1, -rec_qty, prod_id, order.get("dest_warehouse_id") or 1, f"Hủy đơn OEM {order['code']}: Thu hồi thành phẩm"))

                    # Hoàn trả nguyên liệu BOM vào kho xưởng
                    if order.get("oem_warehouse_id"):
                        cur.execute("""
                            SELECT pb.ingredient_id, pb.quantity as bom_qty, i.type as ingredient_type
                            FROM product_bom pb
                            JOIN ingredients i ON pb.ingredient_id = i.id
                            WHERE pb.product_id = ?
                        """, (prod_id,))
                        for bom_row in cur.fetchall():
                            if bom_row["ingredient_type"] == "IS_PHYSICAL":
                                refund_qty = float(bom_row["bom_qty"] or 0) * rec_qty
                                if refund_qty > 0:
                                    cur.execute("""
                                        UPDATE inventory
                                        SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                                        WHERE ingredient_id = ? AND warehouse_id = ?
                                    """, (refund_qty, bom_row["ingredient_id"], order["oem_warehouse_id"]))
                                    cur.execute("""
                                        INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                                        VALUES ('ingredient', ?, ?, 'ADJUST', ?, 
                                                (SELECT COALESCE(quantity, 0) FROM inventory WHERE ingredient_id = ? AND warehouse_id = ?), 
                                                ?)
                                    """, (bom_row["ingredient_id"], order["oem_warehouse_id"], refund_qty, bom_row["ingredient_id"], order["oem_warehouse_id"], f"Hủy đơn OEM {order['code']}: Hoàn trả NVL xưởng"))

            # Giảm nợ NCC nếu từng ghi nhận công nợ
            remaining_debt = float(order.get("remaining_payment") or 0.0)
            if order.get("payment_status") != "PAID" and remaining_debt > 0 and order.get("partner_id"):
                cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (remaining_debt, order["partner_id"]))

        # 2. Xóa toàn bộ phiếu chi cashbook liên quan đến đơn OEM này
        cur.execute("DELETE FROM cashbook WHERE ref_type = 'oem_order' AND ref_id = ?", (order_id,))

        # 3. Xóa chi tiết đơn và đơn hàng
        cur.execute("DELETE FROM oem_order_items WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM oem_orders WHERE id = ?", (order_id,))
        conn.commit()
        return {"success": True, "message": f"Đã xóa đơn gia công OEM {order['code']} và hoàn tác tồn kho, sổ quỹ thành công"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Lỗi xóa đơn OEM: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/oem/orders/{order_id}/confirm")
def confirm_oem_order(order_id: int, user=Depends(require_permission("oem.manage"))):
    """1-chạm xác nhận đơn nháp OEM thành đơn đặt hàng chính thức (DEPOSITED)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
        order_row = cur.fetchone()
        if not order_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn OEM")
        order = dict(order_row)
        if order["status"] != "DRAFT":
            raise HTTPException(status_code=400, detail=f"Đơn hàng đang ở trạng thái {order['status']}, không phải đơn nháp")

        cur.execute("""
            UPDATE oem_orders
            SET status = 'DEPOSITED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (order_id,))
        conn.commit()
        return {"success": True, "id": order_id, "code": order["code"], "status": "DEPOSITED"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/oem/orders/{order_id}/deposit")
def deposit_oem_order(order_id: int, req: OEMOrderDeposit, user=Depends(require_permission("oem.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
        order_row = cur.fetchone()
        if not order_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn OEM")
        order = dict(order_row)
        
        deposit_date = req.deposit_date or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_deposit = req.deposit_amount
        remaining = max(0.0, order["total_final_amount"] - new_deposit)
        fund_source = req.fund_source or order["fund_source"] or "COMPANY"
        
        cur.execute("""
            UPDATE oem_orders
            SET deposit_amount = ?, deposit_date = ?, remaining_payment = ?,
                fund_source = ?, status = 'DEPOSITED', payment_status = 'PARTIAL',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (new_deposit, deposit_date, remaining, fund_source, order_id))
        
        # Ghi sổ quỹ
        cb_code = generate_cashbook_code(cur, "PC-OEM")
        cur.execute("DELETE FROM cashbook WHERE ref_type = 'oem_order' AND ref_id = ? AND category = 'OEM_DEPOSIT'", (order_id,))
        cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (fund_source,))
        row_acc = cur.fetchone()
        acc_id = row_acc[0] if row_acc else None
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, fund_source, account_id)
            VALUES (?, 'out', 'OEM_DEPOSIT', ?, ?, 'oem_order', ?, ?, ?, ?)
        """, (
            cb_code, new_deposit, order["partner_id"], order_id,
            f"Thanh toán cọc đơn gia công {order['code']}" + (f": {req.note}" if req.note else ""),
            fund_source, acc_id
        ))
        
        conn.commit()
        return {"success": True, "deposit_amount": new_deposit, "remaining_payment": remaining}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/oem/orders/{order_id}/receive")
def receive_oem_order(order_id: int, req: OEMOrderReceive, user=Depends(require_permission("oem.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM oem_orders WHERE id = ?", (order_id,))
        order_row = cur.fetchone()
        if not order_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn OEM")
        order = dict(order_row)
        
        if order["status"] == "RECEIVED" or order["status"] == "COMPLETED":
            raise HTTPException(status_code=400, detail="Đơn hàng này đã được nhận trước đó!")
            
        discount_factor = 1.0 - (order["discount_percent"] / 100.0)
        
        # Cập nhật số lượng thực nhận cho từng item
        total_raw = 0.0
        for rec in req.items:
            cur.execute("""
                UPDATE oem_order_items 
                SET received_qty = ?
                WHERE id = ? AND order_id = ?
            """, (rec.received_qty, rec.item_id, order_id))
            
        # Lấy lại các items đã cập nhật
        cur.execute("SELECT * FROM oem_order_items WHERE order_id = ?", (order_id,))
        items = [dict(r) for r in cur.fetchall()]
        
        has_item_vat = any("vat_rate" in it and it["vat_rate"] is not None for it in items)
        total_vat = 0.0
        for it in items:
            item_raw = it["received_qty"] * it["unit_price"]
            total_raw += item_raw
            item_vat_rate = it["vat_rate"] if ("vat_rate" in it and it["vat_rate"] is not None) else (order["vat_percent"] or 8.0)
            item_vat_amt = round(item_raw * (item_vat_rate / 100.0), 2)
            total_vat += item_vat_amt
            cur.execute("UPDATE oem_order_items SET vat_rate = ?, vat_amount = ? WHERE id = ?", (item_vat_rate, item_vat_amt, it["id"]))
            
        if not has_item_vat and order["vat_percent"] > 0:
            total_vat = round(total_raw * (order["vat_percent"] / 100.0), 2)

        raw_after_discount = total_raw * discount_factor
        total_final = round(raw_after_discount + total_vat, 2)
        remaining = max(0.0, total_final - order["deposit_amount"])
        
        # Xử lý từng sản phẩm/nguyên liệu: trừ kho NVL/phôi tại xưởng, tính giá vốn gộp, nhập kho
        for it in items:
            rec_qty = it["received_qty"]
            if rec_qty <= 0:
                continue
                
            item_vat_rate = it["vat_rate"] if ("vat_rate" in it and it["vat_rate"] is not None) else (order["vat_percent"] or 8.0)
            item_vat_factor = 1.0 + (item_vat_rate / 100.0)
            # Phương án B: Giá vốn tính gộp thuế
            net_proc_cost = it["unit_price"] * discount_factor * item_vat_factor
            material_cost_per_unit = 0.0

            # ── Nhánh A: Gia công ra Nguyên Vật Liệu (item_type == 'ingredient') ──
            if it.get("item_type") == "ingredient" and it.get("ingredient_id"):
                ing_id = it["ingredient_id"]
                cur.execute("""
                    SELECT 
                        ib.child_ingredient_id as ingredient_id,
                        ib.quantity as bom_qty,
                        i.name as ingredient_name,
                        i.type as ingredient_type,
                        COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as ingredient_cost
                    FROM ingredient_bom ib
                    JOIN ingredients i ON ib.child_ingredient_id = i.id
                    WHERE ib.parent_ingredient_id = ?
                """, (ing_id,))
                bom_rows = cur.fetchall()

                for b in bom_rows:
                    b_ing_id = b["ingredient_id"]
                    bom_qty = b["bom_qty"]
                    ing_cost = b["ingredient_cost"]
                    total_deduct_qty = bom_qty * rec_qty

                    if b["ingredient_type"] == "IS_PHYSICAL":
                        material_cost_per_unit += bom_qty * ing_cost
                        
                        # Trừ tồn kho phôi tại kho xưởng
                        cur.execute("SELECT quantity FROM inventory WHERE ingredient_id = ? AND warehouse_id = ?", (b_ing_id, order["oem_warehouse_id"]))
                        inv_row = cur.fetchone()
                        cur_stock = inv_row[0] if inv_row else 0.0
                        new_stock = cur_stock - total_deduct_qty
                        
                        if inv_row:
                            cur.execute("UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE ingredient_id = ? AND warehouse_id = ?", (new_stock, b_ing_id, order["oem_warehouse_id"]))
                        else:
                            cur.execute("INSERT INTO inventory (ingredient_id, warehouse_id, quantity) VALUES (?, ?, ?)", (b_ing_id, order["oem_warehouse_id"], new_stock))
                            
                        # Ghi log xuất kho phôi
                        cur.execute("""
                            INSERT INTO inventory_logs (
                                item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note
                            ) VALUES ('ingredient', ?, ?, 'EXPORT', ?, ?, ?)
                        """, (b_ing_id, order["oem_warehouse_id"], total_deduct_qty, new_stock, f"Xuất phôi gia công OEM đơn {order['code']}"))

                full_unit_cost = net_proc_cost + material_cost_per_unit

                # Cập nhật chi phí ròng và giá vốn chuẩn vào item
                cur.execute("""
                    UPDATE oem_order_items
                    SET final_unit_cost = ?, full_cost_per_unit = ?
                    WHERE id = ?
                """, (net_proc_cost, full_unit_cost, it["id"]))

                # Tăng tồn kho NGUYÊN LIỆU tại kho đích (bảng inventory)
                cur.execute("SELECT quantity FROM inventory WHERE ingredient_id = ? AND warehouse_id = ?", (ing_id, order["dest_warehouse_id"]))
                ing_inv = cur.fetchone()
                cur_ing_stock = ing_inv[0] if ing_inv else 0.0
                new_ing_stock = cur_ing_stock + rec_qty

                if ing_inv:
                    cur.execute("UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE ingredient_id = ? AND warehouse_id = ?", (new_ing_stock, ing_id, order["dest_warehouse_id"]))
                else:
                    cur.execute("INSERT INTO inventory (ingredient_id, warehouse_id, quantity) VALUES (?, ?, ?)", (ing_id, order["dest_warehouse_id"], new_ing_stock))

                # Ghi log nhập kho nguyên liệu thành phẩm
                cur.execute("""
                    INSERT INTO inventory_logs (
                        item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note
                    ) VALUES ('ingredient', ?, ?, 'IMPORT', ?, ?, ?)
                """, (ing_id, order["dest_warehouse_id"], rec_qty, new_ing_stock, f"Nhập kho nguyên liệu gia công OEM đơn {order['code']}"))

                # Cập nhật giá vốn hoàn thiện vào price_history
                cur.execute("""
                    INSERT INTO price_history (ingredient_id, purchase_price, effective_date, note)
                    VALUES (?, ?, CURRENT_TIMESTAMP, ?)
                """, (ing_id, full_unit_cost, f"Giá vốn OEM đơn {order['code']}"))

            # ── Nhánh B: Gia công ra Sản Phẩm hoàn thiện (mặc định) ──
            else:
                prod_id = it["product_id"]
                # Tính tổng chi phí tem, chai, nắp từ BOM
                cur.execute("""
                    SELECT 
                        pb.ingredient_id,
                        pb.quantity as bom_qty,
                        i.name as ingredient_name,
                        i.type as ingredient_type,
                        COALESCE((SELECT ph.purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as ingredient_cost
                    FROM product_bom pb
                    JOIN ingredients i ON pb.ingredient_id = i.id
                    WHERE pb.product_id = ?
                """, (prod_id,))
                bom_rows = cur.fetchall()
                
                material_cost_per_unit = 0.0
                for b in bom_rows:
                    ing_id = b["ingredient_id"]
                    bom_qty = b["bom_qty"]
                    ing_cost = b["ingredient_cost"]
                    total_deduct_qty = bom_qty * rec_qty
                    
                    # Nếu là nguyên liệu vật lý (IS_PHYSICAL) thì trừ tồn kho tại kho xưởng
                    if b["ingredient_type"] == "IS_PHYSICAL":
                        material_cost_per_unit += bom_qty * ing_cost
                        
                        # Lấy tồn kho hiện tại
                        cur.execute("""
                            SELECT quantity FROM inventory 
                            WHERE ingredient_id = ? AND warehouse_id = ?
                        """, (ing_id, order["oem_warehouse_id"]))
                        inv_row = cur.fetchone()
                        cur_stock = inv_row[0] if inv_row else 0.0
                        new_stock = cur_stock - total_deduct_qty
                        
                        if inv_row:
                            cur.execute("""
                                UPDATE inventory 
                                SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE ingredient_id = ? AND warehouse_id = ?
                            """, (new_stock, ing_id, order["oem_warehouse_id"]))
                        else:
                            cur.execute("""
                                INSERT INTO inventory (ingredient_id, warehouse_id, quantity)
                                VALUES (?, ?, ?)
                            """, (ing_id, order["oem_warehouse_id"], new_stock))
                            
                        # Ghi log xuất kho nguyên liệu gia công
                        cur.execute("""
                            INSERT INTO inventory_logs (
                                item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note
                            ) VALUES ('ingredient', ?, ?, 'EXPORT', ?, ?, ?)
                        """, (ing_id, order["oem_warehouse_id"], total_deduct_qty, new_stock, f"Xuất gia công OEM đơn {order['code']}"))
                        
                full_unit_cost = net_proc_cost + material_cost_per_unit
                
                # Cập nhật chi phí ròng và giá vốn chuẩn vào item
                cur.execute("""
                    UPDATE oem_order_items
                    SET final_unit_cost = ?, full_cost_per_unit = ?
                    WHERE id = ?
                """, (net_proc_cost, full_unit_cost, it["id"]))
                
                # Tăng tồn kho thành phẩm tại kho đích (Kho Tổng)
                cur.execute("""
                    SELECT quantity FROM product_inventory 
                    WHERE product_id = ? AND warehouse_id = ?
                """, (prod_id, order["dest_warehouse_id"]))
                p_inv = cur.fetchone()
                cur_p_stock = p_inv[0] if p_inv else 0.0
                new_p_stock = cur_p_stock + rec_qty
                
                if p_inv:
                    cur.execute("""
                        UPDATE product_inventory 
                        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE product_id = ? AND warehouse_id = ?
                    """, (new_p_stock, prod_id, order["dest_warehouse_id"]))
                else:
                    cur.execute("""
                        INSERT INTO product_inventory (product_id, warehouse_id, quantity)
                        VALUES (?, ?, ?)
                    """, (prod_id, order["dest_warehouse_id"], new_p_stock))
                    
                # Cập nhật giá vốn cost_price và tổng stock của sản phẩm
                cur.execute("""
                    UPDATE products
                    SET cost_price = ?, stock = stock + ?
                    WHERE id = ?
                """, (full_unit_cost, rec_qty, prod_id))
                
                # Ghi log nhập kho thành phẩm
                cur.execute("""
                    INSERT INTO inventory_logs (
                        item_type, product_id, warehouse_id, change_type, quantity, balance_after, note
                    ) VALUES ('product', ?, ?, 'IMPORT', ?, ?, ?)
                """, (prod_id, order["dest_warehouse_id"], rec_qty, new_p_stock, f"Nhập kho thành phẩm từ OEM {order['code']}"))
            
        # Xử lý thanh toán số tiền còn lại (nếu có yêu cầu trả ngay)
        pay_fund = req.payment_fund_source or order["fund_source"] or "COMPANY"
        if req.pay_remaining_now and remaining > 0:
            cb_code = generate_cashbook_code(cur, "PC-OEM")
            cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (pay_fund,))
            row_acc = cur.fetchone()
            acc_id = row_acc[0] if row_acc else None
            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, fund_source, account_id)
                VALUES (?, 'out', 'OEM_PAYMENT', ?, ?, 'oem_order', ?, ?, ?, ?)
            """, (
                cb_code, remaining, order["partner_id"], order_id,
                f"Thanh toán đợt 2 khi nhận hàng đơn {order['code']}", pay_fund, acc_id
            ))
            payment_status = "PAID"
            final_remaining = 0.0
            new_deposit = total_final
        else:
            payment_status = "PARTIAL" if order["deposit_amount"] > 0 else "UNPAID"
            final_remaining = remaining
            new_deposit = order["deposit_amount"]
            # Ghi nhận nợ NCC nếu nhận hàng chưa trả đủ
            if final_remaining > 0 and order["partner_id"]:
                cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (final_remaining, order["partner_id"]))
            
        # Cập nhật đơn OEM sang trạng thái RECEIVED
        cur.execute("""
            UPDATE oem_orders
            SET status = 'RECEIVED', total_raw_amount = ?, vat_amount = ?, total_final_amount = ?,
                deposit_amount = ?, remaining_payment = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (total_raw, total_vat, total_final, new_deposit, final_remaining, payment_status, order_id))
        
        conn.commit()
        return {
            "success": True,
            "total_raw": total_raw,
            "total_final": total_final,
            "deposit_amount": new_deposit,
            "remaining_payment": final_remaining,
            "payment_status": payment_status
        }
    except Exception as e:
        conn.rollback()
        logger.error(f"Lỗi nhận hàng OEM: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/api/oem/cashflow-forecast")
def get_cashflow_forecast(days: int = 30):
    """
    Dự báo dòng tiền chi dựa trên các đơn OEM và đơn nhập hàng đang chờ nhận.
    Phân tách rõ ràng giữa Quỹ Công Ty (COMPANY) và Quỹ Cá Nhân (PERSONAL).
    """
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Đơn OEM chờ nhận
    cur.execute("""
        SELECT 
            o.id,
            o.code,
            o.expected_delivery_date,
            o.fund_source,
            o.remaining_payment as amount,
            c.name as partner_name,
            'OEM' as order_type,
            o.status
        FROM oem_orders o
        LEFT JOIN contacts c ON o.partner_id = c.id
        WHERE o.status IN ('DRAFT', 'DEPOSITED') AND o.remaining_payment > 0
    """)
    oem_rows = [dict(r) for r in cur.fetchall()]
    
    # 2. Đơn Nhập Hàng (PO) chờ nhận
    cur.execute("""
        SELECT 
            p.id,
            p.code,
            COALESCE(p.expected_date, p.created_at) as expected_delivery_date,
            CASE WHEN p.fund_source = 'COMPANY' OR p.vat_rate > 0 THEN 'COMPANY' ELSE 'PERSONAL' END as fund_source,
            (p.total_amount - COALESCE(p.paid_amount, 0)) as amount,
            c.name as partner_name,
            'PURCHASE' as order_type,
            p.status
        FROM purchases p
        LEFT JOIN contacts c ON p.supplier_id = c.id
        WHERE p.status = 'pending' AND (p.total_amount - COALESCE(p.paid_amount, 0)) > 0
    """)
    po_rows = [dict(r) for r in cur.fetchall()]

    # 3. Kế hoạch hẹn trả nợ NCC (debt payment plans đang chờ chi)
    cur.execute("""
        SELECT 
            dp.id,
            COALESCE(p.code, 'HẸN TRẢ NỢ NCC') as code,
            dp.plan_date as expected_delivery_date,
            dp.fund_source,
            dp.amount,
            c.name as partner_name,
            'DEBT_PLAN' as order_type,
            dp.status,
            dp.note,
            dp.supplier_id,
            dp.purchase_id
        FROM supplier_debt_plans dp
        LEFT JOIN contacts c ON dp.supplier_id = c.id
        LEFT JOIN purchases p ON dp.purchase_id = p.id
        WHERE dp.status = 'PENDING'
    """)
    plan_rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    all_forecasts = oem_rows + po_rows + plan_rows
    
    # Tính tổng theo từng nguồn tiền
    total_company = sum(f["amount"] for f in all_forecasts if f.get("fund_source") == "COMPANY")
    total_personal = sum(f["amount"] for f in all_forecasts if f.get("fund_source") == "PERSONAL")
    
    # Sắp xếp theo ngày dự kiến
    all_forecasts.sort(key=lambda x: x.get("expected_delivery_date") or "9999-12-31")
    
    return {
        "total_forecast": total_company + total_personal,
        "total_company": total_company,
        "total_personal": total_personal,
        "items": all_forecasts
    }

@router.get("/api/cashflow-debts/summary")
def get_cashflow_debts_summary():
    conn = get_db()
    cur = conn.cursor()
    
    # Tổng nợ NCC (gộp cả đơn mua PO, đơn gia công OEM và nợ đầu kỳ còn nợ)
    cur.execute("""
        SELECT 
            COALESCE((
                SELECT SUM(p.debt_amount) 
                FROM purchases p 
                WHERE p.debt_amount > 0 AND p.status != 'cancelled'
            ), 0) + 
            COALESCE((
                SELECT SUM(o.remaining_payment) 
                FROM oem_orders o 
                WHERE o.remaining_payment > 0 AND o.status != 'CANCELLED'
            ), 0) +
            COALESCE((
                SELECT SUM(COALESCE(initial_debt_company, 0) + COALESCE(initial_debt_personal, 0))
                FROM contacts WHERE type = 'supplier'
            ), 0)
    """)
    total_debt = cur.fetchone()[0]
    
    # Quỹ Cty & Quỹ Cá nhân trong cashbook
    cur.execute("""
        SELECT 
            COALESCE(fund_source, 'COMPANY') as fund_source,
            SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END) as balance
        FROM cashbook
        GROUP BY fund_source
    """)
    balances = {r["fund_source"]: r["balance"] for r in cur.fetchall()}
    cash_company = balances.get("COMPANY", 0.0) or 0.0
    cash_personal = balances.get("PERSONAL", 0.0) or 0.0
    
    # Dự báo dòng tiền
    forecast_data = get_cashflow_forecast()
    
    conn.close()
    return {
        "total_supplier_debt": total_debt,
        "cash_company": cash_company,
        "cash_personal": cash_personal,
        "forecast_total": forecast_data["total_forecast"],
        "forecast_company": forecast_data["total_company"],
        "forecast_personal": forecast_data["total_personal"]
    }

@router.get("/api/cashflow-debts/suppliers")
def list_debt_suppliers():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            c.id, c.name, c.phone, c.address, 
            COALESCE(c.debt, 0) as initial_debt,
            COALESCE(c.initial_debt_company, 0) as initial_debt_company,
            COALESCE(c.initial_debt_personal, 0) as initial_debt_personal,
            w.name as warehouse_name,
            (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled') as po_debt_count,
            (SELECT COUNT(*) FROM oem_orders o WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED') as oem_debt_count,
            
            -- Nợ Có Thuế (Quỹ Cty: PO có vat_rate>0 hoặc vat_amount>0, OEM có vat_percent>0 hoặc fund_source='COMPANY')
            COALESCE((
                SELECT SUM(p.debt_amount) 
                FROM purchases p 
                WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled' AND (p.vat_rate > 0 OR p.vat_amount > 0)
            ), 0) + COALESCE((
                SELECT SUM(o.remaining_payment) 
                FROM oem_orders o 
                WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED' AND (o.vat_percent > 0 OR o.fund_source = 'COMPANY')
            ), 0) as debt_company,
            
            -- Nợ Không Thuế (Quỹ Cá Nhân: PO không vat, OEM không vat)
            COALESCE((
                SELECT SUM(p.debt_amount) 
                FROM purchases p 
                WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled' AND (p.vat_rate = 0 OR p.vat_rate IS NULL) AND (p.vat_amount = 0 OR p.vat_amount IS NULL)
            ), 0) + COALESCE((
                SELECT SUM(o.remaining_payment) 
                FROM oem_orders o 
                WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED' AND (o.vat_percent = 0 OR o.vat_percent IS NULL) AND (o.fund_source != 'COMPANY' OR o.fund_source IS NULL)
            ), 0) as debt_personal
        FROM contacts c
        LEFT JOIN warehouses w ON w.supplier_id = c.id
        WHERE c.type = 'supplier'
    """)
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        init_c = float(d.get("initial_debt_company", 0.0) or 0.0)
        init_p = float(d.get("initial_debt_personal", 0.0) or 0.0)

        po_oem_company = float(d.get("debt_company", 0.0) or 0.0)
        po_oem_personal = float(d.get("debt_personal", 0.0) or 0.0)
        
        final_company_debt = round(po_oem_company + init_c, 2)
        final_personal_debt = round(po_oem_personal + init_p, 2)
        total_d = round(final_company_debt + final_personal_debt, 2)

        d["initial_debt_company"] = init_c
        d["initial_debt_personal"] = init_p
        d["debt_company"] = final_company_debt
        d["debt_personal"] = final_personal_debt
        d["debt"] = total_d
        d["total_debt"] = total_d
        rows.append(d)
    rows.sort(key=lambda x: x["total_debt"], reverse=True)
    conn.close()
    return rows

@router.get("/api/cashflow-debts/suppliers/{supplier_id}/orders")
def list_supplier_debt_orders(supplier_id: int):
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT id, name, debt FROM contacts WHERE id = ?", (supplier_id,))
    supp = cur.fetchone()
    if not supp:
        conn.close()
        return []
    
    # 1. Đơn PO có nợ
    cur.execute("""
        SELECT 
            p.id, p.code, p.created_at, p.total_amount, p.paid_amount, p.debt_amount, p.status, 
            'PURCHASE' as order_type,
            p.vat_rate, p.vat_amount,
            CASE WHEN (p.vat_rate > 0 OR p.vat_amount > 0) THEN 1 ELSE 0 END as has_vat
        FROM purchases p
        WHERE p.supplier_id = ? AND p.debt_amount > 0
        ORDER BY p.id ASC
    """, (supplier_id,))
    po_orders = [dict(r) for r in cur.fetchall()]
    
    # 2. Đơn OEM có nợ
    cur.execute("""
        SELECT 
            o.id, o.code, o.created_at, o.total_final_amount as total_amount, o.deposit_amount as paid_amount, 
            o.remaining_payment as debt_amount, o.status, 
            'OEM' as order_type,
            o.vat_percent as vat_rate, 0 as vat_amount,
            CASE WHEN (o.vat_percent > 0 OR o.fund_source = 'COMPANY') THEN 1 ELSE 0 END as has_vat
        FROM oem_orders o
        WHERE o.partner_id = ? AND o.remaining_payment > 0
        ORDER BY o.id ASC
    """, (supplier_id,))
    oem_orders = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    all_orders = po_orders + oem_orders
    for o in all_orders:
        o["fund_source_required"] = "COMPANY" if o["has_vat"] else "PERSONAL"
    return all_orders

@router.post("/api/cashflow-debts/pay-supplier")
def pay_supplier_debt(req: SupplierDebtPaymentRequest, user=Depends(require_any_permission("oem.manage", "partners.manage", "cashbook.manage"))):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải lớn hơn 0")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, debt FROM contacts WHERE id = ? AND type = 'supplier'", (req.supplier_id,))
    supp = cur.fetchone()
    if not supp:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
    
    is_company = (req.fund_source == "COMPANY")
    if is_company:
        cur.execute("""
            SELECT id, debt_amount, paid_amount, 'PO' as order_type
            FROM purchases 
            WHERE supplier_id = ? AND debt_amount > 0 AND (vat_rate > 0 OR vat_amount > 0)
            ORDER BY id ASC
        """, (req.supplier_id,))
        pos = [dict(r) for r in cur.fetchall()]
        
        cur.execute("""
            SELECT id, remaining_payment as debt_amount, deposit_amount as paid_amount, 'OEM' as order_type
            FROM oem_orders
            WHERE partner_id = ? AND remaining_payment > 0 AND (vat_percent > 0 OR fund_source = 'COMPANY')
            ORDER BY id ASC
        """, (req.supplier_id,))
        oems = [dict(r) for r in cur.fetchall()]
        fund_label = "Quỹ Công Ty (Hóa đơn có VAT)"
    else:
        cur.execute("""
            SELECT id, debt_amount, paid_amount, 'PO' as order_type
            FROM purchases 
            WHERE supplier_id = ? AND debt_amount > 0 AND (vat_rate = 0 OR vat_rate IS NULL) AND (vat_amount = 0 OR vat_amount IS NULL)
            ORDER BY id ASC
        """, (req.supplier_id,))
        pos = [dict(r) for r in cur.fetchall()]
        
        cur.execute("""
            SELECT id, remaining_payment as debt_amount, deposit_amount as paid_amount, 'OEM' as order_type
            FROM oem_orders
            WHERE partner_id = ? AND remaining_payment > 0 AND (vat_percent = 0 OR vat_percent IS NULL) AND (fund_source != 'COMPANY' OR fund_source IS NULL)
            ORDER BY id ASC
        """, (req.supplier_id,))
        oems = [dict(r) for r in cur.fetchall()]
        fund_label = "Quỹ Cá Nhân (Đơn không VAT)"
        
    target_orders = pos + oems
    total_basket_debt = sum(o["debt_amount"] for o in target_orders)
    
    cur.execute("SELECT initial_debt_company, initial_debt_personal, debt FROM contacts WHERE id = ?", (req.supplier_id,))
    c_row = cur.fetchone()
    init_c = float(c_row["initial_debt_company"] or 0.0) if c_row else 0.0
    init_p = float(c_row["initial_debt_personal"] or 0.0) if c_row else 0.0
    init_fund_debt = init_c if is_company else init_p
    total_allowed_debt = round(total_basket_debt + init_fund_debt, 2)
    
    if total_allowed_debt <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Nhà cung cấp này hiện không có công nợ nào thuộc {fund_label}")
        
    if req.amount > total_allowed_debt + 1.0:
        conn.close()
        raise HTTPException(
            status_code=400, 
            detail=f"Số tiền thanh toán ({req.amount:,.0f} đ) vượt quá tổng nợ thuộc {fund_label} ({total_allowed_debt:,.0f} đ). Vui lòng nhập tối đa {total_allowed_debt:,.0f} đ."
        )
        
    rem = req.amount
    # Nới dung sai làm tròn 1 đồng: Nếu thanh toán khớp gần tuyệt đối, cấn trừ sạch toàn bộ nợ
    if abs(total_allowed_debt - rem) <= 1.0:
        rem = total_allowed_debt

    for o in target_orders:
        if rem <= 0:
            break
        alloc = min(rem, o["debt_amount"])
        if (o["debt_amount"] - alloc) <= 1.0:
            alloc = o["debt_amount"]
        rem -= alloc
        if o["order_type"] == "PO":
            new_po_debt = max(0.0, o["debt_amount"] - alloc)
            if new_po_debt <= 1.0:
                new_po_debt = 0.0
            cur.execute("UPDATE purchases SET debt_amount = ?, paid_amount = paid_amount + ? WHERE id = ?", (new_po_debt, alloc, o["id"]))
        else:
            new_remaining = max(0.0, o["debt_amount"] - alloc)
            if new_remaining <= 1.0:
                new_remaining = 0.0
            new_deposit = o["paid_amount"] + alloc
            payment_status = "PAID" if new_remaining <= 0 else "PARTIAL"
            cur.execute("UPDATE oem_orders SET remaining_payment = ?, deposit_amount = ?, payment_status = ? WHERE id = ?", (new_remaining, new_deposit, payment_status, o["id"]))
            
    # Nếu còn dư tiền thanh toán sau khi trừ đơn -> trừ tiếp vào nợ đầu kỳ
    if rem > 0:
        if is_company:
            cur.execute("UPDATE contacts SET initial_debt_company = CASE WHEN (initial_debt_company - ?) <= 1.0 THEN 0.0 ELSE MAX(0.0, initial_debt_company - ?) END WHERE id = ?", (rem, rem, req.supplier_id))
        else:
            cur.execute("UPDATE contacts SET initial_debt_personal = CASE WHEN (initial_debt_personal - ?) <= 1.0 THEN 0.0 ELSE MAX(0.0, initial_debt_personal - ?) END WHERE id = ?", (rem, rem, req.supplier_id))

    cur.execute("UPDATE contacts SET debt = CASE WHEN (debt - ?) <= 1.0 THEN 0.0 ELSE MAX(0.0, debt - ?) END WHERE id = ?", (req.amount, req.amount, req.supplier_id))
    
    cb_code = generate_cashbook_code(cur, "PC-NH")
    note = req.note or f"Thanh toán nợ cho {supp['name']} ({fund_label})"
    acc_id = req.account_id
    if not acc_id:
        cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (req.fund_source,))
        row_acc = cur.fetchone()
        acc_id = row_acc[0] if row_acc else None

    user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    if req.payment_date:
        cb_created_at = req.payment_date if " " in req.payment_date else f"{req.payment_date} 12:00:00"
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, fund_source, note, account_id, created_by, created_at)
            VALUES (?, 'out', 'Chi trả nợ NCC', ?, ?, 'supplier_debt', ?, ?, ?, ?, ?)
        """, (cb_code, req.amount, req.supplier_id, req.fund_source, note, acc_id, user_name, cb_created_at))
    else:
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, fund_source, note, account_id, created_by)
            VALUES (?, 'out', 'Chi trả nợ NCC', ?, ?, 'supplier_debt', ?, ?, ?, ?)
        """, (cb_code, req.amount, req.supplier_id, req.fund_source, note, acc_id, user_name))
    
    conn.commit()
    conn.close()
    return {
        "success": True,
        "status": "ok",
        "paid_amount": req.amount,
        "message": f"Đã thanh toán {req.amount:,.0f} đ cho {supp['name']} bằng {fund_label} (đã cấn trừ {len(target_orders)} đơn)"
    }

@router.post("/api/cashflow-debts/pay-order")
def pay_single_order_debt(req: OrderDebtPaymentRequest, user=Depends(require_any_permission("oem.manage", "partners.manage", "cashbook.manage"))):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải lớn hơn 0")
    conn = get_db()
    cur = conn.cursor()
    
    if req.order_type.upper() in ("PO", "PURCHASE"):
        cur.execute("SELECT id, code, supplier_id, debt_amount, paid_amount, vat_rate, vat_amount FROM purchases WHERE id = ?", (req.order_id,))
        order = cur.fetchone()
        if not order:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn mua hàng")
        supplier_id = order["supplier_id"]
        order_code = order["code"]
        order_debt = order["debt_amount"]
        has_vat = (order["vat_rate"] or 0) > 0 or (order["vat_amount"] or 0) > 0
    elif req.order_type.upper() == "OEM":
        cur.execute("SELECT id, code, partner_id as supplier_id, remaining_payment as debt_amount, deposit_amount as paid_amount, vat_percent, fund_source FROM oem_orders WHERE id = ?", (req.order_id,))
        order = cur.fetchone()
        if not order:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn gia công")
        supplier_id = order["supplier_id"]
        order_code = order["code"]
        order_debt = order["debt_amount"]
        has_vat = (order["vat_percent"] or 0) > 0 or order["fund_source"] == "COMPANY"
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Loại đơn không hợp lệ")
        
    if has_vat and req.fund_source != "COMPANY":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Đơn hàng {order_code} có hóa đơn VAT, bắt buộc phải thanh toán bằng Quỹ Công Ty!")
    if not has_vat and req.fund_source != "PERSONAL":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Đơn hàng {order_code} không có thuế VAT, bắt buộc thanh toán bằng Quỹ Cá Nhân!")
        
    if req.amount > order_debt + 1.0:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Số tiền thanh toán vượt quá nợ còn lại của đơn ({order_debt:,.0f} đ)")

    if req.account_id:
        cur.execute("SELECT owner_type FROM payment_accounts WHERE id = ? AND is_active = 1", (req.account_id,))
        acc_row = cur.fetchone()
        if not acc_row:
            conn.close()
            raise HTTPException(status_code=400, detail="Tài khoản chi không tồn tại hoặc đã ngừng hoạt động")
        if (acc_row["owner_type"] or "COMPANY") != req.fund_source:
            conn.close()
            fund_label = "Quỹ Cty" if req.fund_source == "COMPANY" else "Quỹ Cá Nhân"
            raise HTTPException(status_code=400, detail=f"Tài khoản chi không thuộc {fund_label}")
        
    alloc = req.amount
    # Nới dung sai làm tròn: Nếu chênh lệch <= 1 đ, cấn trừ sạch nợ còn lại
    if abs(order_debt - alloc) <= 1.0:
        alloc = order_debt

    new_debt = max(0.0, order_debt - alloc)
    if new_debt <= 1.0:
        new_debt = 0.0
    new_paid = order["paid_amount"] + alloc
    
    if req.order_type.upper() in ("PO", "PURCHASE"):
        cur.execute("UPDATE purchases SET debt_amount = ?, paid_amount = ? WHERE id = ?", (new_debt, new_paid, req.order_id))
    else:
        payment_status = "PAID" if new_debt <= 0 else "PARTIAL"
        cur.execute("UPDATE oem_orders SET remaining_payment = ?, deposit_amount = ?, payment_status = ? WHERE id = ?", (new_debt, new_paid, payment_status, req.order_id))
        
    cur.execute("UPDATE contacts SET debt = CASE WHEN (debt - ?) <= 1.0 THEN 0.0 ELSE MAX(0.0, debt - ?) END WHERE id = ?", (alloc, alloc, supplier_id))
    
    cur.execute("SELECT name FROM contacts WHERE id = ?", (supplier_id,))
    supp_row = cur.fetchone()
    supp_name = supp_row["name"] if supp_row else f"NCC #{supplier_id}"
    
    cb_prefix = "PC-OEM" if req.order_type.upper() == "OEM" else "PC-NH"
    cb_code = generate_cashbook_code(cur, cb_prefix)
    fund_text = "Quỹ Cty" if req.fund_source == "COMPANY" else "Quỹ Cá Nhân"
    note = req.note or f"Thanh toán đơn {order_code} ({supp_name}) - {fund_text}"
    
    acc_id = req.account_id
    if not acc_id:
        cur.execute("SELECT id FROM payment_accounts WHERE owner_type = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1", (req.fund_source,))
        row_acc = cur.fetchone()
        acc_id = row_acc[0] if row_acc else None
        
    user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    if req.payment_date:
        cb_created_at = req.payment_date if " " in req.payment_date else f"{req.payment_date} 12:00:00"
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_by, created_at)
            VALUES (?, 'out', 'Chi trả nợ NCC', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (cb_code, alloc, supplier_id, f"order_{req.order_type.lower()}", req.order_id, req.fund_source, note, acc_id, user_name, cb_created_at))
    else:
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_by)
            VALUES (?, 'out', 'Chi trả nợ NCC', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (cb_code, alloc, supplier_id, f"order_{req.order_type.lower()}", req.order_id, req.fund_source, note, acc_id, user_name))
    
    conn.commit()
    conn.close()
    return {
        "success": True,
        "allocated_amount": alloc,
        "remaining_order_debt": new_debt,
        "message": f"Đã thanh toán {alloc:,.0f} đ cho đơn {order_code} ({fund_text})"
    }

class CreateDebtPlanRequest(BaseModel):
    supplier_id: int
    plan_date: str
    amount: float
    fund_source: str = "PERSONAL"
    purchase_id: Optional[int] = None
    note: Optional[str] = None

@router.post("/api/cashflow-debts/payment-plans")
def create_debt_payment_plan(req: CreateDebtPlanRequest, user=Depends(require_any_permission("oem.manage", "partners.manage", "cashbook.manage"))):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền hẹn trả phải lớn hơn 0")
    if not req.plan_date:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ngày hẹn thanh toán")
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM contacts WHERE id = ?", (req.supplier_id,))
    supp = cur.fetchone()
    if not supp:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhà cung cấp")
        
    cur.execute("""
        INSERT INTO supplier_debt_plans (supplier_id, purchase_id, plan_date, amount, fund_source, note, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    """, (req.supplier_id, req.purchase_id, req.plan_date, req.amount, req.fund_source, req.note))
    plan_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": plan_id, "message": f"Đã lưu kế hoạch hẹn trả nợ {req.amount:,.0f} đ vào ngày {req.plan_date}"}

@router.delete("/api/cashflow-debts/payment-plans/{plan_id}")
def cancel_debt_payment_plan(plan_id: int, user=Depends(require_any_permission("oem.manage", "partners.manage", "cashbook.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM supplier_debt_plans WHERE id = ?", (plan_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã hủy kế hoạch hẹn trả nợ"}
