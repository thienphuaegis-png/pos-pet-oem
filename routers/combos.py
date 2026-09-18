from fastapi import APIRouter, HTTPException
from database import get_db
from schemas import ComboCreate, ComboUpdate, ComboItemIn
from logger_config import get_module_logger
import datetime

logger = get_module_logger("combos")

router = APIRouter(prefix="/api/combos", tags=["Combos"])

# ---------- Helper ----------

def _combo_to_dict(cur, combo_id: int) -> dict | None:
    cur.execute("SELECT * FROM combos WHERE id = ?", (combo_id,))
    combo = cur.fetchone()
    if not combo:
        return None
    result = dict(combo)
    cur.execute('''
    SELECT ci.id as item_id, ci.product_id, ci.quantity, ci.price_at_time,
           p.name as product_name, p.code as product_code, p.unit, p.sell_price as current_price
    FROM combo_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.combo_id = ?
    ORDER BY ci.id ASC
    ''', (combo_id,))
    result["items"] = [dict(r) for r in cur.fetchall()]
    return result


def _sync_product_entry(conn, combo_id: int, code: str, name: str, sell_price: float, is_active: int):
    """Đồng bộ product entry (type='combo') với dữ liệu combo."""
    cur = conn.cursor()
    cur.execute("SELECT id FROM products WHERE code = ? AND type = 'combo'", (code,))
    existing = cur.fetchone()
    if existing:
        cur.execute(
            "UPDATE products SET name = ?, sell_price = ?, is_active = ? WHERE id = ?",
            (name, sell_price, is_active, existing["id"])
        )
    elif is_active:
        cur.execute(
            "INSERT INTO products (code, name, type, sell_price, stock, unit, is_active) VALUES (?, ?, 'combo', ?, 0, 'combo', ?)",
            (code, name, sell_price, is_active)
        )
    conn.commit()


# ---------- LIST ----------

@router.get("")
def list_combos():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM combos WHERE COALESCE(is_active, 1) = 1 ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        cur.execute('''
        SELECT ci.id as item_id, ci.product_id, ci.quantity, ci.price_at_time,
               p.name as product_name, p.code as product_code, p.unit, p.sell_price as current_price
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.combo_id = ?
        ORDER BY ci.id ASC
        ''', (r["id"],))
        r["items"] = [dict(x) for x in cur.fetchall()]
    conn.close()
    return rows


# ---------- DETAIL ----------

@router.get("/{combo_id}")
def get_combo(combo_id: int):
    conn = get_db()
    cur = conn.cursor()
    result = _combo_to_dict(cur, combo_id)
    conn.close()
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy combo")
    return result


# ---------- CREATE ----------

@router.post("")
def create_combo(req: ComboCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        if not req.items:
            conn.close()
            raise HTTPException(status_code=400, detail="Combo phải có ít nhất 1 sản phẩm")

        # Validate all products exist & không cho material/combo vào combo
        for item in req.items:
            cur.execute("SELECT id, name, sell_price, type FROM products WHERE id = ? AND COALESCE(is_active, 1) = 1", (item.product_id,))
            prod = cur.fetchone()
            if not prod:
                conn.close()
                raise HTTPException(status_code=400, detail=f"Sản phẩm ID {item.product_id} không tồn tại hoặc đã ẩn")
            if prod["type"] == "material":
                conn.close()
                raise HTTPException(status_code=400, detail=f"Không thể thêm nguyên liệu '{prod['name']}' vào combo")
            if prod["type"] == "combo":
                conn.close()
                raise HTTPException(status_code=400, detail=f"Không thể thêm combo '{prod['name']}' vào combo khác")

        code = req.code.strip()
        cur.execute("SELECT id FROM combos WHERE code = ?", (code,))
        if cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail=f"Mã combo '{code}' đã tồn tại")

        cur.execute(
            "INSERT INTO combos (code, name, sell_price, discount_percent) VALUES (?, ?, ?, ?)",
            (code, req.name, req.sell_price, req.discount_percent or 0)
        )
        combo_id = cur.lastrowid

        for item in req.items:
            cur.execute("SELECT sell_price FROM products WHERE id = ?", (item.product_id,))
            price = cur.fetchone()["sell_price"]
            cur.execute(
                "INSERT INTO combo_items (combo_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)",
                (combo_id, item.product_id, item.quantity, price)
            )

        # Đồng bộ product entry (type='combo') để hiện trong danh sách hàng hóa
        _sync_product_entry(conn, combo_id, code, req.name, req.sell_price, 1)

        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": combo_id}


# ---------- UPDATE ----------

@router.put("/{combo_id}")
def update_combo(combo_id: int, req: ComboUpdate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM combos WHERE id = ?", (combo_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy combo")

        updates = []
        params = []
        if req.code is not None:
            updates.append("code = ?")
            params.append(req.code.strip())
        if req.name is not None:
            updates.append("name = ?")
            params.append(req.name)
        if req.sell_price is not None:
            updates.append("sell_price = ?")
            params.append(req.sell_price)
        if req.discount_percent is not None:
            updates.append("discount_percent = ?")
            params.append(req.discount_percent)
        if req.is_active is not None:
            updates.append("is_active = ?")
            params.append(req.is_active)

        if updates:
            params.append(combo_id)
            cur.execute(f"UPDATE combos SET {', '.join(updates)} WHERE id = ?", params)

        # Đồng bộ product entry
        cur.execute("SELECT code, name, sell_price, is_active FROM combos WHERE id = ?", (combo_id,))
        combo = cur.fetchone()
        if combo:
            _sync_product_entry(conn, combo_id, combo["code"], combo["name"], combo["sell_price"], combo["is_active"])

        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
    return {"status": "ok"}


# ---------- DELETE (soft) ----------

@router.delete("/{combo_id}")
def delete_combo(combo_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE combos SET is_active = 0 WHERE id = ?", (combo_id,))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy combo")
    # Ẩn luôn product entry combo
    cur.execute("SELECT code FROM combos WHERE id = ?", (combo_id,))
    combo = cur.fetchone()
    if combo:
        cur.execute("UPDATE products SET is_active = 0 WHERE code = ? AND type = 'combo'", (combo["code"],))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "Đã ẩn combo"}


# ---------- RESTORE ----------

@router.post("/{combo_id}/restore")
def restore_combo(combo_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE combos SET is_active = 1 WHERE id = ?", (combo_id,))
    cur.execute("SELECT code, name, sell_price FROM combos WHERE id = ?", (combo_id,))
    combo = cur.fetchone()
    if combo:
        _sync_product_entry(conn, combo_id, combo["code"], combo["name"], combo["sell_price"], 1)
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ---------- ITEMS MANAGEMENT ----------

@router.post("/{combo_id}/items")
def add_item_to_combo(combo_id: int, req: ComboItemIn):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM combos WHERE id = ? AND COALESCE(is_active, 1) = 1", (combo_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy combo")

        cur.execute("SELECT id, name, sell_price, type FROM products WHERE id = ? AND COALESCE(is_active, 1) = 1", (req.product_id,))
        prod = cur.fetchone()
        if not prod:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Sản phẩm ID {req.product_id} không tồn tại")
        if prod["type"] == "material":
            conn.close()
            raise HTTPException(status_code=400, detail=f"Không thể thêm nguyên liệu '{prod['name']}' vào combo")
        if prod["type"] == "combo":
            conn.close()
            raise HTTPException(status_code=400, detail=f"Không thể thêm combo '{prod['name']}' vào combo khác")

        cur.execute("SELECT id FROM combo_items WHERE combo_id = ? AND product_id = ?", (combo_id, req.product_id))
        if cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Sản phẩm đã có trong combo này")

        cur.execute(
            "INSERT INTO combo_items (combo_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)",
            (combo_id, req.product_id, req.quantity, prod["sell_price"])
        )
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
    return {"status": "ok", "id": cur.lastrowid}


@router.delete("/{combo_id}/items/{item_id}")
def remove_item_from_combo(combo_id: int, item_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM combo_items WHERE id = ? AND combo_id = ?", (item_id, combo_id))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy mục trong combo")
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ---------- SELL COMBO ----------

@router.post("/sell")
def sell_combo(
    combo_id: int,
    quantity: float = 1,
    customer_id: int = 1,
    staff_id: int = 1,
    discount: float = 0,
    paid_amount: float = 0,
    note: str = ""
):
    """
    Bán combo: 1 dòng hàng trong đơn với giá combo.
    Trừ kho BOM thành phần bên dưới.
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        # 1. Lấy thông tin combo + items
        cur.execute("SELECT * FROM combos WHERE id = ? AND COALESCE(is_active, 1) = 1", (combo_id,))
        combo = cur.fetchone()
        if not combo:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy combo")

        cur.execute('''
        SELECT ci.product_id, ci.quantity as quantity, p.name, p.sell_price, p.unit, p.type
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.combo_id = ? AND p.type != 'material' AND COALESCE(p.is_active, 1) = 1
        ORDER BY ci.id ASC
        ''', (combo_id,))
        components = [dict(r) for r in cur.fetchall()]

        if not components:
            conn.close()
            raise HTTPException(status_code=400, detail="Combo không có sản phẩm hợp lệ để bán")

        # Kiểm tra tồn kho từng thành phần
        for c in components:
            cur.execute("SELECT stock FROM products WHERE id = ?", (c["product_id"],))
            stock_row = cur.fetchone()
            available = stock_row["stock"] if stock_row else 0
            needed = c["quantity"] * quantity
            if available < needed:
                conn.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough stock for '{c['name']}': have {available}, need {needed}"
                )

        # 2. Tạo đơn hàng - 1 dòng hàng cho combo với giá combo
        code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        total_amount = combo["sell_price"] * quantity
        final_amount = max(0.0, total_amount - discount)
        debt_amount = max(0.0, final_amount - paid_amount)

        # Staff commission
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        warehouse_id = 1

        cur.execute('''
        INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, f"Combo: {combo['name']} | {note}"))

        order_id = cur.lastrowid

        # Thêm order item - 1 dòng cho combo (dùng product entry type='combo')
        cur.execute("SELECT id FROM products WHERE code = ? AND type = 'combo'", (combo["code"],))
        combo_product = cur.fetchone()
        if not combo_product:
            conn.close()
            raise HTTPException(status_code=500, detail="Không tìm thấy product entry cho combo")
        combo_product_id = combo_product["id"]

        cur.execute('''
        INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, ?, ?, ?)
        ''', (order_id, combo_product_id, quantity, combo["sell_price"], combo["sell_price"] * quantity))

        # Ghi nhận combo_id trong note cho dễ tracking
        logger.info(f"Sell combo {combo['name']} x{quantity} = {combo['sell_price'] * quantity}")

        # 3. Trừ tồn kho thành phẩm (nếu không phải service)
        for c in components:
            line_qty = c["quantity"] * quantity
            if c["type"] != "service":
                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (line_qty, c["product_id"]))
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, c["product_id"], -line_qty, line_qty))

            # Trừ tồn kho nguyên liệu BOM của thành phần đó
            cur.execute('''
            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
            FROM product_bom b
            JOIN ingredients i ON b.ingredient_id = i.id
            WHERE b.product_id = ?
            ''', (c["product_id"],))
            bom_rows = cur.fetchall()
            for bom in bom_rows:
                if bom["ingredient_type"] == 'SERVICE':
                    continue
                total_consumed = bom["quantity"] * line_qty
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                ''', (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
                bal_row = cur.fetchone()
                balance_after = bal_row["quantity"] if bal_row else 0
                cur.execute('''
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
                VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
                ''', (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, order_id, code, f"Combo {combo['name']} - {c['name']}"))

        # Công nợ + sổ quỹ
        if debt_amount > 0:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (debt_amount, customer_id))
        if paid_amount > 0:
            cb_code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
            cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'in', 'Thu tiền bán hàng', ?, ?, 'order', ?, ?)
            ''', (cb_code, paid_amount, customer_id, order_id, f"Thu tiền combo {combo['name']}"))

        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"{type(e).__name__}: {str(e)}")
    conn.close()
    return {"status": "ok", "order_code": code, "combo_id": combo_id}