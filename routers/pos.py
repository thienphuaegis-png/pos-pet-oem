from fastapi import APIRouter, HTTPException
import datetime
import time
from database import get_db
from schemas import OrderCreate

router = APIRouter(tags=["POS & Orders"])

@router.get("/api/orders")
def list_orders(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT o.*, c.name as customer_name, s.name as staff_name,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    ORDER BY o.id DESC
    LIMIT ?
    ''', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/orders/{code}")
def get_order_detail(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, s.name as staff_name
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    WHERE o.code = ?
    ''', (code,))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")
    
    cur.execute('''
    SELECT oi.*, p.name as product_name, p.code as product_code, p.unit
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
    ''', (order["id"],))
    items = [dict(r) for r in cur.fetchall()]
    
    result = dict(order)
    result["items"] = items
    conn.close()
    return result


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
def create_order(req: OrderCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Tinh tong tien
        total_amount = sum(item.quantity * item.price for item in req.items)
        final_amount = max(0.0, total_amount - req.discount)
        debt_amount = max(0.0, final_amount - req.paid_amount)
        
        # Lay % hoa hong cua staff
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (req.staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

        cur.execute('''
        INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (code, req.customer_id, req.staff_id, total_amount, req.discount, final_amount, req.paid_amount, debt_amount, commission_amount, req.note))
        
        order_id = cur.lastrowid
        warehouse_id = req.warehouse_id or 1

        for item in req.items:
            subtotal = item.quantity * item.price
            cur.execute('''
            INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
            VALUES (?, ?, ?, ?, ?)
            ''', (order_id, item.product_id, item.quantity, item.price, subtotal))
            
            # 1. Trừ tồn kho thành phẩm (nếu không phải là dịch vụ)
            cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (item.quantity, item.product_id))
            cur.execute('''
            INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                quantity = quantity - ?,
                updated_at = CURRENT_TIMESTAMP
            ''', (warehouse_id, item.product_id, -item.quantity, item.quantity))

            # 2. Trừ tồn kho nguyên liệu BOM (nếu sản phẩm có cấu thành từ ingredients)
            cur.execute('''
            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
            FROM product_bom b
            JOIN ingredients i ON b.ingredient_id = i.id
            WHERE b.product_id = ?
            ''', (item.product_id,))
            bom_rows = cur.fetchall()

            for bom in bom_rows:
                # Thành phần SERVICE không quản lý tồn kho -> bỏ qua
                if bom["ingredient_type"] == 'SERVICE':
                    continue

                total_consumed = bom["quantity"] * item.quantity
                
                # Trừ tồn kho trong inventory (tự động thêm mới dòng nếu chưa có để ghi nhận âm kho)
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity - ?,
                    updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))

                # Lấy tồn sau khi trừ
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                bal_row = cur.fetchone()
                balance_after = bal_row["quantity"] if bal_row else 0

                # Ghi nhật ký trừ kho do bán đơn hàng
                cur.execute('''
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                ''', (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, order_id, code, f"Bán {item.quantity} {item.product_id}"))

        # Cong cong no khach hang
        if debt_amount > 0:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (debt_amount, req.customer_id))

        # Ghi so quy tien thu
        if req.paid_amount > 0:
            cb_code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
            cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'in', 'Thu tiền bán hàng', ?, ?, 'order', ?, ?)
            ''', (cb_code, req.paid_amount, req.customer_id, order_id, f"Thu tiền đơn {code}"))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "order_code": code}

# Nhap hang (Phieu Mua Hang / Nhap Ton)
