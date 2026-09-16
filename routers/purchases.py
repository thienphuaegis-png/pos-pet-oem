from fastapi import APIRouter, HTTPException
import datetime
import time
from database import get_db
from schemas import PurchaseCreate

router = APIRouter(tags=["Purchases"])

@router.get("/api/purchases")
def list_purchases(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT p.*, c.name as supplier_name, c.phone as supplier_phone, w.name as warehouse_name,
           (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) as item_count
    FROM purchases p
    LEFT JOIN contacts c ON p.supplier_id = c.id
    LEFT JOIN warehouses w ON p.warehouse_id = w.id
    ORDER BY p.id DESC
    LIMIT ?
    ''', (limit,))
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
    SELECT pi.*
    FROM purchase_items pi
    WHERE pi.purchase_id = ?
    ORDER BY pi.id ASC
    ''', (row["id"],))
    items = [dict(r) for r in cur.fetchall()]
    
    result = dict(row)
    result["items"] = items
    conn.close()
    return result

@router.post("/api/purchases")
def create_purchase(req: PurchaseCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        warehouse_id = req.warehouse_id or 1
        subtotal_amount = sum(item.quantity * item.cost_price for item in req.items)
        vat_amount = round((subtotal_amount - req.discount) * (req.vat_rate / 100.0), 2) if req.vat_rate > 0 else 0.0
        total_amount = round(max(0.0, subtotal_amount - req.discount + req.shipping_fee + req.other_fee + vat_amount), 2)
        debt_amount = round(max(0.0, total_amount - req.paid_amount), 2)
        code = f"PN{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

        cur.execute('''
        INSERT INTO purchases (
            code, supplier_id, warehouse_id, subtotal_amount, discount, 
            shipping_fee, other_fee, vat_rate, vat_amount, total_amount, 
            paid_amount, debt_amount, status, expected_date, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        ''', (
            code, req.supplier_id, warehouse_id, subtotal_amount, req.discount,
            req.shipping_fee, req.other_fee, req.vat_rate, vat_amount, total_amount,
            req.paid_amount, debt_amount, req.expected_date, req.note
        ))
        purchase_id = cur.lastrowid

        for item in req.items:
            subtotal = round(item.quantity * item.cost_price, 2)
            prod_id_val = item.product_id if item.item_type == 'product' and item.product_id else 1
            cur.execute('''
            INSERT INTO purchase_items (
                purchase_id, item_type, product_id, ingredient_id, item_name, unit, quantity, cost_price, subtotal
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                purchase_id, item.item_type, prod_id_val, item.ingredient_id,
                item.item_name, item.unit, item.quantity, item.cost_price, subtotal
            ))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "purchase_code": code, "message": "Tạo phiếu nhập hàng ở trạng thái chờ nhận hàng"}

@router.post("/api/purchases/{code}/receive")
def receive_purchase(code: str):
    """
    Xác nhận nhận hàng thực tế & Kiểm đếm:
    - Đổi status sang 'received'
    - Cập nhật tăng tồn kho trong kho tương ứng (sản phẩm hoặc nguyên liệu)
    - Ghi lịch sử giá nhập & thẻ kho
    - Ghi nợ NCC và chi tiền sổ quỹ (nếu có paid_amount)
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
        items = cur.fetchall()

        for item in items:
            item_type = item["item_type"]
            qty = item["quantity"]
            cost = item["cost_price"]

            if item_type == 'ingredient' and item["ingredient_id"]:
                ing_id = item["ingredient_id"]
                # 1. Cập nhật tồn kho nguyên liệu trong inventory
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?,
                    updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, ing_id, qty, qty))

                # Lấy số tồn sau khi cộng
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, ing_id))
                bal_row = cur.fetchone()
                balance_after = bal_row["quantity"] if bal_row else qty

                # Ghi lịch sử giá nhập theo NCC
                cur.execute('''
                INSERT INTO price_history (ingredient_id, supplier_id, purchase_price, note)
                VALUES (?, ?, ?, ?)
                ''', (ing_id, p["supplier_id"], cost, f"Nhận hàng phiếu {code}"))

                # Ghi nhật ký biến động kho
                cur.execute('''
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, supplier_id, note)
                VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?)
                ''', (ing_id, warehouse_id, qty, balance_after, p["supplier_id"], f"Nhận hàng phiếu {code}"))

            elif item["product_id"]:
                prod_id = item["product_id"]
                # 2. Cập nhật tồn kho và giá vốn của sản phẩm
                cur.execute(
                    "UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?",
                    (qty, cost, prod_id)
                )
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity + ?,
                    updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, prod_id, qty, qty))

                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, prod_id))
                bal_p = cur.fetchone()
                bal_p_after = bal_p["quantity"] if bal_p else qty

                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, supplier_id, note)
                VALUES ('product', ?, ?, 'PURCHASE', ?, ?, ?, ?)
                ''', (prod_id, warehouse_id, qty, bal_p_after, p["supplier_id"], f"Nhận hàng phiếu {code}"))

        # Cập nhật công nợ NCC
        if p["debt_amount"] > 0 and p["supplier_id"]:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (p["debt_amount"], p["supplier_id"]))

        # Ghi sổ quỹ chi tiền đã trả
        if p["paid_amount"] > 0:
            cb_code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
            cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?)
            ''', (cb_code, p["paid_amount"], p["supplier_id"], purchase_id, f"Chi thanh toán phiếu nhập {code}"))

        # Cập nhật trạng thái phiếu nhập sang 'received'
        cur.execute('''
        UPDATE purchases 
        SET status = 'received', received_date = CURRENT_TIMESTAMP 
        WHERE id = ?
        ''', (purchase_id,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã xác nhận nhận hàng và cập nhật tồn kho phiếu {code}"}

@router.delete("/api/purchases/{code}")
def delete_purchase(code: str):
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

# San xuat (BOM Execution)
