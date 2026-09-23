from fastapi import APIRouter, HTTPException, Depends
import datetime
import time
from database import get_db
from schemas import OrderCreate, OrderUpdate
from logger_config import get_module_logger
from routers.cashbook import generate_cashbook_code
from dependencies import get_current_user, require_role, require_permission

logger = get_module_logger("pos")

router = APIRouter(tags=["POS & Orders"])

@router.get("/api/pos/draft")
def get_draft(current: dict = Depends(get_current_user)):
    """Khôi phục hóa đơn đang gõ dở của nhân viên hiện tại (chống mất khi tắt máy/mất điện)."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT data, updated_at FROM draft_orders WHERE staff_id=?", (current["id"],))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {"data": row["data"], "updated_at": row["updated_at"]}


@router.post("/api/pos/draft")
def save_draft(body: dict, current: dict = Depends(get_current_user)):
    """Lưu snapshot hóa đơn đang gõ dở — client gọi định kỳ (debounce ~3-5s)."""
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
def clear_draft(current: dict = Depends(get_current_user)):
    """Xóa draft sau khi thanh toán xong hoặc dọn tay — tránh khôi phục hóa đơn đã bán."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM draft_orders WHERE staff_id=?", (current["id"],))
    conn.commit()
    conn.close()
    return {"message": "cleared"}


@router.get("/api/orders")
def list_orders(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    SELECT o.*, c.name as customer_name, s.name as staff_name,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    ORDER BY o.id DESC
    LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/orders/{code}")
def get_order_detail(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, s.name as staff_name
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    LEFT JOIN staff s ON o.staff_id = s.id
    WHERE o.code = ?
    """, (code,))
    order = cur.fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Khong tim thay don hang")
    
    cur.execute("""
    SELECT oi.*, p.name as product_name, p.code as product_code, p.unit
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
    """, (order["id"],))
    items = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT method, amount, account_id FROM order_payments WHERE order_id = ?", (order["id"],))
    payments = [dict(r) for r in cur.fetchall()]

    result = dict(order)
    result["items"] = items
    result["payments"] = payments
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
def create_order(req: OrderCreate, user=Depends(require_permission("pos.sell"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        total_amount = sum(item.quantity * item.price for item in req.items)
        final_amount = max(0.0, total_amount - req.discount)
        debt_amount = max(0.0, final_amount - req.paid_amount)
        
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (req.staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

        cur.execute("""
        INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, note, shift_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (code, req.customer_id, req.staff_id, total_amount, req.discount, final_amount, req.paid_amount, debt_amount, commission_amount, req.note, req.shift_id))
        
        order_id = cur.lastrowid
        warehouse_id = req.warehouse_id or 1

        for item in req.items:
            subtotal = item.quantity * item.price
            cur.execute("""
            INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
            VALUES (?, ?, ?, ?, ?)
            """, (order_id, item.product_id, item.quantity, item.price, subtotal))

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
                    comp_qty = comp["component_qty"] * item.quantity

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
                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (item.quantity, item.product_id))
                cur.execute("""
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?,
                    updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, item.product_id, -item.quantity, item.quantity))

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
                    total_consumed = bom["quantity"] * item.quantity
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
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (debt_amount, req.customer_id))

        if req.paid_amount > 0:
            cb_code = generate_cashbook_code(cur, "PT-BH")
            if req.payments:
                # Thanh toán tách nhiều hình thức: ghi 1 dòng order_payments/cashbook cho mỗi hình thức
                for p in req.payments:
                    if p.amount <= 0:
                        continue
                    cur.execute("""
                    INSERT INTO order_payments (order_id, method, amount, account_id)
                    VALUES (?, ?, ?, ?)
                    """, (order_id, p.method, p.amount, p.account_id))
                    sub_cb_code = generate_cashbook_code(cur, "PT-BH")
                    cur.execute("""
                    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                    VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?, ?)
                    """, (sub_cb_code, p.amount, req.customer_id, order_id, f"Thu tien don {code} ({p.method})", p.account_id, req.shift_id))
            else:
                acc_id = getattr(req, "account_id", None)
                if not acc_id:
                    cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
                    row_acc = cur.fetchone()
                    acc_id = row_acc[0] if row_acc else None
                cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?, ?)
                """, (cb_code, req.paid_amount, req.customer_id, order_id, f"Thu tien don {code}", acc_id, req.shift_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "order_code": code}

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

        warehouse_id = 1

        for item in items:
            prod_id = item["product_id"]
            qty = item["quantity"]

            cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (qty, prod_id))
            cur.execute("""
            UPDATE product_inventory 
            SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            WHERE warehouse_id = ? AND product_id = ?
            """, (qty, warehouse_id, prod_id))

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
                UPDATE inventory 
                SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                WHERE warehouse_id = ? AND ingredient_id = ?
                """, (total_consumed, warehouse_id, bom["ingredient_id"]))

        cur.execute("DELETE FROM inventory_logs WHERE order_id = ? OR order_code = ?", (order_id, code))

        if debt_amount > 0 and customer_id:
            cur.execute("UPDATE contacts SET debt = MAX(0, debt - ?) WHERE id = ?", (debt_amount, customer_id))

        cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (order_id,))

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
        warehouse_id = req.warehouse_id or 1

        new_customer_id = req.customer_id if req.customer_id is not None else old_customer_id
        new_staff_id = req.staff_id if req.staff_id is not None else order["staff_id"]
        new_note = req.note if req.note is not None else order["note"]
        new_discount = req.discount if req.discount is not None else order["discount"]

        if req.items is not None:
            cur.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
            old_items = cur.fetchall()
            for oitem in old_items:
                cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (oitem["quantity"], oitem["product_id"]))
                cur.execute("""
                UPDATE product_inventory 
                SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                WHERE warehouse_id = ? AND product_id = ?
                """, (oitem["quantity"], warehouse_id, oitem["product_id"]))

                cur.execute("""
                SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?
                """, (oitem["product_id"],))
                for bom in cur.fetchall():
                    if bom["ingredient_type"] != 'SERVICE':
                        cur.execute("""
                        UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                        WHERE warehouse_id = ? AND ingredient_id = ?
                        """, (bom["quantity"] * oitem["quantity"], warehouse_id, bom["ingredient_id"]))

            cur.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
            cur.execute("DELETE FROM inventory_logs WHERE order_id = ? OR order_code = ?", (order_id, code))

            total_amount = 0
            for nitem in req.items:
                subtotal = nitem.quantity * nitem.price
                total_amount += subtotal
                cur.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
                VALUES (?, ?, ?, ?, ?)
                """, (order_id, nitem.product_id, nitem.quantity, nitem.price, subtotal))

                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (nitem.quantity, nitem.product_id))
                cur.execute("""
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                """, (warehouse_id, nitem.product_id, -nitem.quantity, nitem.quantity))

                cur.execute("""
                SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
                FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?
                """, (nitem.product_id,))
                for bom in cur.fetchall():
                    if bom["ingredient_type"] != 'SERVICE':
                        t_consumed = bom["quantity"] * nitem.quantity
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

        final_amount = max(0, total_amount - new_discount)
        new_paid = req.paid_amount if req.paid_amount is not None else old_paid
        new_debt = max(0, final_amount - new_paid)

        cur.execute("""
        UPDATE orders 
        SET customer_id = ?, staff_id = ?, total_amount = ?, discount = ?, final_amount = ?, paid_amount = ?, debt_amount = ?, note = ?
        WHERE id = ?
        """, (new_customer_id, new_staff_id, total_amount, new_discount, final_amount, new_paid, new_debt, new_note, order_id))

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
        if new_paid > 0:
            cb_code = generate_cashbook_code(cur, "PT-BH")
            cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?)
            """, (cb_code, new_paid, new_customer_id, order_id, f"Thu tien don {code} (cap nhat)"))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã cập nhật đơn hàng {code}"}

# Nhap hang (Phieu Mua Hang / Nhap Ton)