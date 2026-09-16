from fastapi import APIRouter, HTTPException
import datetime
import time
from database import get_db
from schemas import ProductionCreate

router = APIRouter(tags=["Production"])

@router.get("/api/productions")
def list_productions(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT pr.*, w.name as warehouse_name,
           (SELECT COUNT(*) FROM production_items WHERE production_id = pr.id) as item_count,
           (SELECT SUM(quantity) FROM production_items WHERE production_id = pr.id) as total_qty
    FROM productions pr
    LEFT JOIN warehouses w ON pr.warehouse_id = w.id
    ORDER BY pr.id DESC
    LIMIT ?
    ''', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/productions/{code}")
def get_production_detail(code: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT pr.*, w.name as warehouse_name
    FROM productions pr
    LEFT JOIN warehouses w ON pr.warehouse_id = w.id
    WHERE pr.code = ?
    ''', (code,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy lệnh sản xuất")
    
    prod_id = row["id"]
    cur.execute("SELECT * FROM production_items WHERE production_id = ?", (prod_id,))
    items = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM production_materials_consumed WHERE production_id = ?", (prod_id,))
    materials = [dict(r) for r in cur.fetchall()]

    res = dict(row)
    res["items"] = items
    res["materials"] = materials
    conn.close()
    return res

@router.post("/api/productions")
def create_production(req: ProductionCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        warehouse_id = req.warehouse_id or 1
        if not req.items or len(req.items) == 0:
            raise Exception("Vui lòng chọn ít nhất 1 thành phẩm để sản xuất!")

        # 1. Tổng hợp BOM của tất cả thành phẩm trong danh sách
        # Gom tổng nguyên liệu cần dùng: dict (type, id) -> {name, unit, needed_qty, cost_price}
        consumed_dict = {}
        produced_items_calc = []
        overall_total_cost = 0.0

        for item in req.items:
            prod_id = item.product_id
            prod_qty = item.quantity
            if prod_qty <= 0:
                continue

            cur.execute("SELECT id, code, name, unit, cost_price FROM products WHERE id = ?", (prod_id,))
            prod = cur.fetchone()
            if not prod:
                raise Exception(f"Không tìm thấy sản phẩm ID {prod_id}")

            # Kiểm tra BOM trong product_bom (Module Cost chuẩn)
            cur.execute('''
            SELECT pb.ingredient_id, pb.quantity, i.code, i.name, i.unit, i.type,
                   COALESCE((SELECT purchase_price FROM price_history ph 
                             WHERE ph.ingredient_id = pb.ingredient_id 
                             ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0) as latest_cost
            FROM product_bom pb
            JOIN ingredients i ON pb.ingredient_id = i.id
            WHERE pb.product_id = ?
            ''', (prod_id,))
            boms_ing = cur.fetchall()

            # Kiểm tra cả bảng bom legacy nếu có
            cur.execute("SELECT material_id, quantity FROM bom WHERE product_id = ?", (prod_id,))
            boms_legacy = cur.fetchall()

            if not boms_ing and not boms_legacy:
                raise Exception(f"Sản phẩm '{prod['name']}' chưa được cài đặt định lượng nguyên liệu (BOM)!")

            single_unit_cost = 0.0

            # Tính từ product_bom
            for b in boms_ing:
                ing_id = b["ingredient_id"]
                needed = b["quantity"] * prod_qty
                cost = b["latest_cost"]
                single_unit_cost += b["quantity"] * cost

                key = ("ingredient", ing_id)
                if key not in consumed_dict:
                    consumed_dict[key] = {
                        "type": "ingredient",
                        "id": ing_id,
                        "name": b["name"],
                        "unit": b["unit"],
                        "needed_qty": 0.0,
                        "cost_price": cost
                    }
                consumed_dict[key]["needed_qty"] += needed

            # Tính từ legacy bom
            for b in boms_legacy:
                mat_id = b["material_id"]
                needed = b["quantity"] * prod_qty
                cur.execute("SELECT id, name, unit, cost_price FROM products WHERE id = ?", (mat_id,))
                mat_row = cur.fetchone()
                cost = mat_row["cost_price"] if mat_row else 0
                single_unit_cost += b["quantity"] * cost

                key = ("material", mat_id)
                if key not in consumed_dict:
                    consumed_dict[key] = {
                        "type": "material",
                        "id": mat_id,
                        "name": mat_row["name"] if mat_row else f"NL-{mat_id}",
                        "unit": mat_row["unit"] if mat_row else "đv",
                        "needed_qty": 0.0,
                        "cost_price": cost
                    }
                consumed_dict[key]["needed_qty"] += needed

            total_line_cost = round(single_unit_cost * prod_qty, 2)
            overall_total_cost += total_line_cost
            produced_items_calc.append({
                "product_id": prod_id,
                "product_name": prod["name"],
                "unit": prod["unit"],
                "quantity": prod_qty,
                "unit_cost": round(single_unit_cost, 2),
                "total_cost": total_line_cost
            })

        # 2. Kiểm tra tồn kho tất cả nguyên vật liệu cần dùng
        for key, mat in consumed_dict.items():
            m_type, m_id = key
            needed = mat["needed_qty"]
            if m_type == "ingredient":
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, m_id))
                stock_row = cur.fetchone()
                cur_stock = stock_row["quantity"] if stock_row else 0.0
                if cur_stock < needed:
                    raise Exception(f"Không đủ nguyên liệu '{mat['name']}' (Kho cần {needed} {mat['unit']}, hiện chỉ có {cur_stock} {mat['unit']})")
            else:
                cur.execute("SELECT stock FROM products WHERE id = ?", (m_id,))
                stock_row = cur.fetchone()
                cur_stock = stock_row["stock"] if stock_row else 0.0
                if cur_stock < needed:
                    raise Exception(f"Không đủ vật tư '{mat['name']}' (Kho cần {needed} {mat['unit']}, hiện chỉ có {cur_stock} {mat['unit']})")

        # 3. Tạo phiếu lệnh sản xuất
        code = f"LSX{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        first_prod_id = produced_items_calc[0]["product_id"] if produced_items_calc else 0
        total_prod_qty = sum(p["quantity"] for p in produced_items_calc)

        cur.execute('''
        INSERT INTO productions (code, product_id, quantity, warehouse_id, total_cost, status, note)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
        ''', (code, first_prod_id, total_prod_qty, warehouse_id, overall_total_cost, req.note))
        production_id = cur.lastrowid

        # 4. Ghi nhận chi tiết thành phẩm sản xuất (production_items) & Cộng kho thành phẩm
        for p in produced_items_calc:
            cur.execute('''
            INSERT INTO production_items (production_id, product_id, product_name, unit, quantity, unit_cost, total_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (production_id, p["product_id"], p["product_name"], p["unit"], p["quantity"], p["unit_cost"], p["total_cost"]))

            # Cộng tồn kho sản phẩm
            cur.execute("UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?", (p["quantity"], p["unit_cost"], p["product_id"]))
            cur.execute('''
            INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                quantity = quantity + ?,
                updated_at = CURRENT_TIMESTAMP
            ''', (warehouse_id, p["product_id"], p["quantity"], p["quantity"]))

            cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, p["product_id"]))
            bal_p = cur.fetchone()
            bal_p_after = bal_p["quantity"] if bal_p else p["quantity"]

            cur.execute('''
            INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
            VALUES ('product', ?, ?, 'PRODUCE_IN', ?, ?, ?)
            ''', (p["product_id"], warehouse_id, p["quantity"], bal_p_after, f"Sản xuất nhập kho {code}"))

        # 5. Trừ kho nguyên liệu & ghi nhật ký xuất kho sản xuất (production_materials_consumed)
        for key, mat in consumed_dict.items():
            m_type, m_id = key
            needed = mat["needed_qty"]
            m_cost = mat["cost_price"]
            line_tot = round(needed * m_cost, 2)

            cur.execute('''
            INSERT INTO production_materials_consumed (production_id, item_type, item_id, item_name, unit, quantity_needed, cost_price, total_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (production_id, m_type, m_id, mat["name"], mat["unit"], needed, m_cost, line_tot))

            if m_type == "ingredient":
                cur.execute("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND ingredient_id = ?", (needed, warehouse_id, m_id))
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, m_id))
                bal_i = cur.fetchone()
                bal_after = bal_i["quantity"] if bal_i else 0
                cur.execute('''
                INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES (?, ?, 'PRODUCE_OUT', ?, ?, ?)
                ''', (m_id, warehouse_id, -needed, bal_after, f"Xuất sản xuất theo {code}"))
            else:
                cur.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (needed, m_id))
                cur.execute("UPDATE product_inventory SET quantity = quantity - ? WHERE warehouse_id = ? AND product_id = ?", (needed, warehouse_id, m_id))
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, m_id))
                bal_m = cur.fetchone()
                bal_after = bal_m["quantity"] if bal_m else 0
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('product', ?, ?, 'PRODUCE_OUT', ?, ?, ?)
                ''', (m_id, warehouse_id, -needed, bal_after, f"Xuất sản xuất theo {code}"))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "production_code": code, "total_cost": overall_total_cost}

# So quy & Thu chi
