from fastapi import APIRouter, HTTPException
from typing import Optional
import datetime
from database import get_db
from schemas import (
    WarehouseCreate, WarehouseUpdate, IngredientCreate, IngredientUpdate,
    InventoryAdjust, TransferCreate, AuditCreate, WriteOffCreate
)

router = APIRouter(tags=["Warehouses & Inventory"])

@router.get("/api/warehouses")
def list_warehouses():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM warehouses ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/warehouses")
def create_warehouse(w: WarehouseCreate):
    conn = get_db()
    cur = conn.cursor()
    code = w.code or f"WH-{int(time.time() * 1000)}"
    try:
        cur.execute("INSERT INTO warehouses (code, name, address, is_active) VALUES (?, ?, ?, ?)", 
                    (code, w.name, w.address, w.is_active if w.is_active is not None else 1))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code}

@router.put("/api/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, w: WarehouseUpdate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, code FROM warehouses WHERE id = ?", (warehouse_id,))
        existing = cur.fetchone()
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")

        code = w.code if w.code else existing["code"]
        is_active = w.is_active if w.is_active is not None else 1
        cur.execute(
            "UPDATE warehouses SET code = ?, name = ?, address = ?, is_active = ? WHERE id = ?",
            (code, w.name, w.address, is_active, warehouse_id)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM warehouses WHERE id = ?", (warehouse_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# --- 2. Ingredients (Nguyên liệu / Dịch vụ thành phần) ---
@router.get("/api/ingredients")
def list_ingredients():
    conn = get_db()
    cur = conn.cursor()
    # Lấy thông tin kèm tổng tồn kho, giá nhập gần nhất và danh sách nhà cung cấp
    query = '''
    SELECT 
        i.*,
        COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) AS total_stock,
        COALESCE(
            (SELECT purchase_price FROM price_history ph 
             WHERE ph.ingredient_id = i.id 
             ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
            0
        ) AS latest_cost,
        (SELECT GROUP_CONCAT(DISTINCT c.name) 
         FROM supplier_items si 
         JOIN contacts c ON si.supplier_id = c.id 
         WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
    FROM ingredients i
    ORDER BY i.id DESC
    '''
    cur.execute(query)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/ingredients")
def create_ingredient(ing: IngredientCreate):
    conn = get_db()
    cur = conn.cursor()
    code = ing.code or f"NL-{int(time.time() * 1000)}"
    try:
        cur.execute(
            "INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, ?, ?)",
            (code, ing.name, ing.unit, ing.type)
        )
        ing_id = cur.lastrowid

        # Nếu là thành phần vật lý và có số lượng ban đầu -> tạo tồn kho
        if ing.type == 'IS_PHYSICAL' and ing.initial_stock > 0:
            wh_id = ing.warehouse_id or 1
            cur.execute(
                "INSERT INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (?, ?, ?)",
                (wh_id, ing_id, ing.initial_stock)
            )

        # Lưu giá nhập ban đầu vào lịch sử nếu có
        if ing.initial_cost > 0:
            cur.execute(
                "INSERT INTO price_history (ingredient_id, purchase_price, note) VALUES (?, ?, ?)",
                (ing_id, ing.initial_cost, "Khởi tạo ban đầu")
            )

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": ing_id, "code": code}

@router.put("/api/ingredients/{ingredient_id}")
def update_ingredient(ingredient_id: int, ing: IngredientUpdate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE ingredients SET name = ?, unit = ?, type = ? WHERE id = ?",
            (ing.name, ing.unit, ing.type, ingredient_id)
        )
        # Nếu đổi sang SERVICE thì xóa tồn kho
        if ing.type == 'SERVICE':
            cur.execute("DELETE FROM inventory WHERE ingredient_id = ?", (ingredient_id,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.delete("/api/ingredients/{ingredient_id}")
def delete_ingredient(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM inventory WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM price_history WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM product_bom WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM supplier_items WHERE item_type = 'ingredient' AND ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

# --- 3. Inventory & Price History (Tồn kho & Lịch sử giá) ---
@router.get("/api/inventory")
def list_inventory(warehouse_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    if warehouse_id:
        cur.execute('''
        SELECT inv.*, i.name as ingredient_name, i.unit, i.type, w.name as warehouse_name
        FROM inventory inv
        JOIN ingredients i ON inv.ingredient_id = i.id
        JOIN warehouses w ON inv.warehouse_id = w.id
        WHERE inv.warehouse_id = ?
        ORDER BY i.name ASC
        ''', (warehouse_id,))
    else:
        cur.execute('''
        SELECT inv.*, i.name as ingredient_name, i.unit, i.type, w.name as warehouse_name
        FROM inventory inv
        JOIN ingredients i ON inv.ingredient_id = i.id
        JOIN warehouses w ON inv.warehouse_id = w.id
        ORDER BY w.name ASC, i.name ASC
        ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/inventory/adjust")
def adjust_inventory(req: InventoryAdjust):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Kiểm tra loại thành phần
        cur.execute("SELECT type FROM ingredients WHERE id = ?", (req.ingredient_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy nguyên liệu")
        if row["type"] == "SERVICE":
            raise HTTPException(status_code=400, detail="Thành phần SERVICE không lưu trữ tồn kho")

        if req.mode == "set":
            new_qty = req.quantity
        else: # add
            cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                        (req.warehouse_id, req.ingredient_id))
            cur_inv = cur.fetchone()
            new_qty = (cur_inv["quantity"] if cur_inv else 0) + req.quantity

        cur.execute('''
        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
            quantity = ?,
            updated_at = CURRENT_TIMESTAMP
        ''', (req.warehouse_id, req.ingredient_id, new_qty, new_qty))

        # Ghi nhật ký điều chỉnh tồn kho (inventory_logs)
        cur.execute('''
        INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, supplier_id, note)
        VALUES (?, ?, 'ADJUST', ?, ?, ?, ?)
        ''', (req.ingredient_id, req.warehouse_id, req.quantity if req.mode == 'add' else (new_qty - (cur_inv["quantity"] if cur_inv else 0)), new_qty, req.supplier_id, req.note or "Điều chỉnh tồn kho"))

        # Lưu giá nhập vào price_history nếu có truyền vào
        if req.purchase_price is not None and req.purchase_price > 0:
            cur.execute('''
            INSERT INTO price_history (ingredient_id, supplier_id, purchase_price, note)
            VALUES (?, ?, ?, ?)
            ''', (req.ingredient_id, req.supplier_id, req.purchase_price, req.note or "Điều chỉnh tồn / Nhập kho"))

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "new_quantity": new_qty}

@router.get("/api/ingredients/{ingredient_id}/price-history")
def get_price_history(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT ph.*, c.name as supplier_name
    FROM price_history ph
    LEFT JOIN contacts c ON ph.supplier_id = c.id
    WHERE ph.ingredient_id = ?
    ORDER BY ph.effective_date DESC, ph.id DESC
    ''', (ingredient_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/ingredients/{ingredient_id}/logs")
def get_ingredient_logs(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT 
        l.*,
        w.name as warehouse_name,
        c.name as supplier_name
    FROM inventory_logs l
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN contacts c ON l.supplier_id = c.id
    WHERE l.ingredient_id = ?
    ORDER BY l.created_at DESC, l.id DESC
    ''', (ingredient_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/api/ingredients/{ingredient_id}/detail")
def get_ingredient_detail(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ingredients WHERE id = ?", (ingredient_id,))
    ing = cur.fetchone()
    if not ing:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nguyên liệu")
    
    # Tồn kho theo từng kho
    cur.execute('''
    SELECT inv.*, w.name as warehouse_name, w.address as warehouse_address
    FROM inventory inv
    JOIN warehouses w ON inv.warehouse_id = w.id
    WHERE inv.ingredient_id = ?
    ORDER BY w.id ASC
    ''', (ingredient_id,))
    stocks = [dict(r) for r in cur.fetchall()]
    
    # Lịch sử giá theo NCC
    cur.execute('''
    SELECT ph.*, c.name as supplier_name, c.phone as supplier_phone
    FROM price_history ph
    LEFT JOIN contacts c ON ph.supplier_id = c.id
    WHERE ph.ingredient_id = ?
    ORDER BY ph.effective_date DESC, ph.id DESC
    ''', (ingredient_id,))
    prices = [dict(r) for r in cur.fetchall()]

    # Nhật ký xuất/nhập/trừ bill
    cur.execute('''
    SELECT l.*, w.name as warehouse_name, c.name as supplier_name
    FROM inventory_logs l
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN contacts c ON l.supplier_id = c.id
    WHERE l.ingredient_id = ?
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 50
    ''', (ingredient_id,))
    logs = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "ingredient": dict(ing),
        "stocks": stocks,
        "price_history": prices,
        "logs": logs
    }

# --- 4. Quản lý kho hàng mở rộng (Warehouses Overview, Unified Inventory, Transfers, Audits) ---

@router.get("/api/warehouses/overview")
def get_warehouses_overview():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM warehouses ORDER BY id ASC")
    whs = [dict(r) for r in cur.fetchall()]
    res = []
    for w in whs:
        wid = w["id"]
        # Số lượng & giá trị sản phẩm
        cur.execute('''
            SELECT 
                COUNT(*) as count_p,
                COALESCE(SUM(pi.quantity), 0) as stock_p,
                COALESCE(SUM(pi.quantity * p.cost_price), 0) as val_p
            FROM product_inventory pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.warehouse_id = ? AND pi.quantity > 0
        ''', (wid,))
        row_p = cur.fetchone()
        
        # Số lượng & giá trị nguyên liệu (IS_PHYSICAL)
        cur.execute('''
            SELECT 
                COUNT(*) as count_ing,
                COALESCE(SUM(inv.quantity), 0) as stock_ing,
                COALESCE(SUM(inv.quantity * COALESCE(
                    (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
                )), 0) as val_ing
            FROM inventory inv
            JOIN ingredients i ON inv.ingredient_id = i.id
            WHERE inv.warehouse_id = ? AND inv.quantity > 0 AND i.type = 'IS_PHYSICAL'
        ''', (wid,))
        row_ing = cur.fetchone()
        
        w_data = dict(w)
        w_data["product_count"] = row_p["count_p"] if row_p else 0
        w_data["ingredient_count"] = row_ing["count_ing"] if row_ing else 0
        w_data["total_items"] = w_data["product_count"] + w_data["ingredient_count"]
        w_data["total_stock"] = (row_p["stock_p"] if row_p else 0) + (row_ing["stock_ing"] if row_ing else 0)
        w_data["total_val"] = (row_p["val_p"] if row_p else 0) + (row_ing["val_ing"] if row_ing else 0)
        res.append(w_data)
    conn.close()
    return res

@router.get("/api/inventory/unified")
def get_unified_inventory(warehouse_id: Optional[int] = None, item_type: Optional[str] = None, search: Optional[str] = None, low_stock: Optional[bool] = False):
    conn = get_db()
    cur = conn.cursor()
    
    params_p = []
    where_p = ["p.type != 'service'"]
    if warehouse_id:
        where_p.append("w.id = ?")
        params_p.append(warehouse_id)
        params_p.append(warehouse_id)
        
    prod_sql = f'''
    SELECT 
        'product' as item_type,
        p.id,
        p.code,
        p.name,
        p.unit,
        p.type as sub_type,
        p.cost_price,
        p.sell_price,
        COALESCE(w.id, 1) as warehouse_id,
        COALESCE(w.name, 'Kho Mặc Định') as warehouse_name,
        COALESCE(pi.quantity, 0) as quantity,
        COALESCE(pi.quantity * p.cost_price, 0) as total_value,
        (SELECT GROUP_CONCAT(DISTINCT c.name) 
         FROM supplier_items si 
         JOIN contacts c ON si.supplier_id = c.id 
         WHERE si.item_type = 'product' AND si.product_id = p.id) as supplier_names
    FROM products p
    LEFT JOIN warehouses w ON ({"w.id = ?" if warehouse_id else "w.id = 1"})
    LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.warehouse_id = COALESCE(w.id, 1)
    WHERE {' AND '.join(where_p)}
    '''
    
    params_i = []
    where_i = ["i.type = 'IS_PHYSICAL'"]
    if warehouse_id:
        where_i.append("w.id = ?")
        params_i.append(warehouse_id)
        params_i.append(warehouse_id)
        
    ing_sql = f'''
    SELECT 
        'ingredient' as item_type,
        i.id,
        i.code,
        i.name,
        i.unit,
        i.type as sub_type,
        COALESCE(
            (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
        ) as cost_price,
        0 as sell_price,
        COALESCE(w.id, 1) as warehouse_id,
        COALESCE(w.name, 'Kho Mặc Định') as warehouse_name,
        COALESCE(inv.quantity, 0) as quantity,
        COALESCE(inv.quantity * COALESCE(
            (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
        ), 0) as total_value,
        (SELECT GROUP_CONCAT(DISTINCT c.name) 
         FROM supplier_items si 
         JOIN contacts c ON si.supplier_id = c.id 
         WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
    FROM ingredients i
    LEFT JOIN warehouses w ON ({"w.id = ?" if warehouse_id else "w.id = 1"})
    LEFT JOIN inventory inv ON inv.ingredient_id = i.id AND inv.warehouse_id = COALESCE(w.id, 1)
    WHERE {' AND '.join(where_i)}
    '''
    
    cur.execute(prod_sql, tuple(params_p))
    prod_rows = [dict(r) for r in cur.fetchall()]
    cur.execute(ing_sql, tuple(params_i))
    ing_rows = [dict(r) for r in cur.fetchall()]
    
    all_rows = prod_rows + ing_rows
    
    filtered = []
    for r in all_rows:
        if item_type and item_type != "all" and r["item_type"] != item_type:
            continue
        if search:
            s = search.strip().lower()
            if s not in (r["name"] or "").lower() and s not in (r["code"] or "").lower():
                continue
        if low_stock and r["quantity"] > 5:
            continue
        filtered.append(r)
        
    filtered.sort(key=lambda x: (x["warehouse_name"], x["name"]))
    
    total_qty = sum(r["quantity"] for r in filtered)
    total_val = sum(r["total_value"] for r in filtered)
    
    conn.close()
    return {
        "items": filtered,
        "total_count": len(filtered),
        "total_quantity": total_qty,
        "total_value": total_val
    }

@router.post("/api/inventory/transfer")
def create_warehouse_transfer(req: TransferCreate):
    if req.from_warehouse_id == req.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Kho xuất và kho nhận không được trùng nhau")
    if not req.items:
        raise HTTPException(status_code=400, detail="Danh sách chuyển hàng không được rỗng")
        
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT name FROM warehouses WHERE id = ?", (req.from_warehouse_id,))
        from_w = cur.fetchone()
        cur.execute("SELECT name FROM warehouses WHERE id = ?", (req.to_warehouse_id,))
        to_w = cur.fetchone()
        if not from_w or not to_w:
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")
            
        code = f"CK{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        cur.execute('''
        INSERT INTO warehouse_transfers (code, from_warehouse_id, to_warehouse_id, note)
        VALUES (?, ?, ?, ?)
        ''', (code, req.from_warehouse_id, req.to_warehouse_id, req.note))
        transfer_id = cur.lastrowid
        
        for it in req.items:
            if it.quantity <= 0:
                continue
            if it.item_type == 'product':
                cur.execute("SELECT name, unit FROM products WHERE id = ?", (it.product_id,))
                p_row = cur.fetchone()
                item_name = p_row["name"] if p_row else "Sản phẩm"
                unit = p_row["unit"] if p_row else "cái"
                
                # Trừ kho xuất
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.from_warehouse_id, it.product_id, -it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (req.from_warehouse_id, it.product_id))
                bal_from = cur.fetchone()["quantity"]
                
                # Cộng kho nhận
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.to_warehouse_id, it.product_id, it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (req.to_warehouse_id, it.product_id))
                bal_to = cur.fetchone()["quantity"]
                
                # Logs
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('product', ?, ?, 'TRANSFER_OUT', ?, ?, ?)
                ''', (it.product_id, req.from_warehouse_id, -it.quantity, bal_from, f"Chuyển đến {to_w['name']} ({code})"))
                
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('product', ?, ?, 'TRANSFER_IN', ?, ?, ?)
                ''', (it.product_id, req.to_warehouse_id, it.quantity, bal_to, f"Nhận từ {from_w['name']} ({code})"))
                
                cur.execute('''
                INSERT INTO warehouse_transfer_items (transfer_id, item_type, product_id, item_name, unit, quantity)
                VALUES (?, 'product', ?, ?, ?, ?)
                ''', (transfer_id, it.product_id, item_name, unit, it.quantity))
                
            elif it.item_type == 'ingredient':
                cur.execute("SELECT name, unit, type FROM ingredients WHERE id = ?", (it.ingredient_id,))
                ing_row = cur.fetchone()
                if not ing_row or ing_row["type"] == 'SERVICE':
                    continue
                item_name = ing_row["name"]
                unit = ing_row["unit"]
                
                # Trừ kho xuất
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.from_warehouse_id, it.ingredient_id, -it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (req.from_warehouse_id, it.ingredient_id))
                bal_from = cur.fetchone()["quantity"]
                
                # Cộng kho nhận
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.to_warehouse_id, it.ingredient_id, it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (req.to_warehouse_id, it.ingredient_id))
                bal_to = cur.fetchone()["quantity"]
                
                # Logs
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('ingredient', ?, ?, 'TRANSFER_OUT', ?, ?, ?)
                ''', (it.ingredient_id, req.from_warehouse_id, -it.quantity, bal_from, f"Chuyển đến {to_w['name']} ({code})"))
                
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('ingredient', ?, ?, 'TRANSFER_IN', ?, ?, ?)
                ''', (it.ingredient_id, req.to_warehouse_id, it.quantity, bal_to, f"Nhận từ {from_w['name']} ({code})"))
                
                cur.execute('''
                INSERT INTO warehouse_transfer_items (transfer_id, item_type, ingredient_id, item_name, unit, quantity)
                VALUES (?, 'ingredient', ?, ?, ?, ?)
                ''', (transfer_id, it.ingredient_id, item_name, unit, it.quantity))
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code}

@router.get("/api/inventory/transfers")
def list_transfers():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT 
        t.*,
        w1.name as from_warehouse_name,
        w2.name as to_warehouse_name,
        (SELECT COUNT(*) FROM warehouse_transfer_items ti WHERE ti.transfer_id = t.id) as item_count
    FROM warehouse_transfers t
    JOIN warehouses w1 ON t.from_warehouse_id = w1.id
    JOIN warehouses w2 ON t.to_warehouse_id = w2.id
    ORDER BY t.created_at DESC, t.id DESC
    ''')
    transfers = [dict(r) for r in cur.fetchall()]
    for t in transfers:
        cur.execute("SELECT * FROM warehouse_transfer_items WHERE transfer_id = ?", (t["id"],))
        t["items"] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return transfers

@router.post("/api/inventory/audit")
def create_stock_audit(req: AuditCreate):
    if not req.items:
        raise HTTPException(status_code=400, detail="Danh sách kiểm kê không được rỗng")
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT name FROM warehouses WHERE id = ?", (req.warehouse_id,))
        w_row = cur.fetchone()
        if not w_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")
        code = f"KK{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        
        cur.execute('''
        INSERT INTO stock_audits (code, warehouse_id, note)
        VALUES (?, ?, ?)
        ''', (code, req.warehouse_id, req.note))
        audit_id = cur.lastrowid
        
        for it in req.items:
            diff = it.actual_qty - it.system_qty
            if it.item_type == 'product':
                cur.execute("SELECT name, unit FROM products WHERE id = ?", (it.product_id,))
                p_row = cur.fetchone()
                item_name = p_row["name"] if p_row else "Sản phẩm"
                unit = p_row["unit"] if p_row else "cái"
                
                # Cập nhật số lượng mới trong product_inventory
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.warehouse_id, it.product_id, it.actual_qty, it.actual_qty))
                
                # Cập nhật tổng stock trong products
                cur.execute('''
                UPDATE products SET stock = (
                    SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = ?
                ) WHERE id = ?
                ''', (it.product_id, it.product_id))
                
                # Ghi log
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('product', ?, ?, 'ADJUST', ?, ?, ?)
                ''', (it.product_id, req.warehouse_id, diff, it.actual_qty, f"Kiểm kê {code}: {it.note or 'Cân bằng kho'}"))
                
                cur.execute('''
                INSERT INTO stock_audit_items (audit_id, item_type, product_id, item_name, unit, system_qty, actual_qty, diff_qty)
                VALUES (?, 'product', ?, ?, ?, ?, ?, ?)
                ''', (audit_id, it.product_id, item_name, unit, it.system_qty, it.actual_qty, diff))
                
            elif it.item_type == 'ingredient':
                cur.execute("SELECT name, unit, type FROM ingredients WHERE id = ?", (it.ingredient_id,))
                ing_row = cur.fetchone()
                if not ing_row or ing_row["type"] == 'SERVICE':
                    continue
                item_name = ing_row["name"]
                unit = ing_row["unit"]
                
                # Cập nhật số lượng mới trong inventory
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.warehouse_id, it.ingredient_id, it.actual_qty, it.actual_qty))
                
                # Ghi log
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('ingredient', ?, ?, 'ADJUST', ?, ?, ?)
                ''', (it.ingredient_id, req.warehouse_id, diff, it.actual_qty, f"Kiểm kê {code}: {it.note or 'Cân bằng kho'}"))
                
                cur.execute('''
                INSERT INTO stock_audit_items (audit_id, item_type, ingredient_id, item_name, unit, system_qty, actual_qty, diff_qty)
                VALUES (?, 'ingredient', ?, ?, ?, ?, ?, ?)
                ''', (audit_id, it.ingredient_id, item_name, unit, it.system_qty, it.actual_qty, diff))
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code}

@router.get("/api/inventory/audits")
def list_stock_audits():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT 
        a.*,
        w.name as warehouse_name,
        (SELECT COUNT(*) FROM stock_audit_items ai WHERE ai.audit_id = a.id) as item_count,
        (SELECT COALESCE(SUM(diff_qty), 0) FROM stock_audit_items ai WHERE ai.audit_id = a.id) as total_diff
    FROM stock_audits a
    JOIN warehouses w ON a.warehouse_id = w.id
    ORDER BY a.created_at DESC, a.id DESC
    ''')
    audits = [dict(r) for r in cur.fetchall()]
    for a in audits:
        cur.execute("SELECT * FROM stock_audit_items WHERE audit_id = ?", (a["id"],))
        a["items"] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return audits

@router.get("/api/inventory/item-logs")
def get_item_inventory_logs(item_type: str, item_id: int, warehouse_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    query = '''
    SELECT 
        l.*,
        w.name as warehouse_name,
        c.name as supplier_name
    FROM inventory_logs l
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN contacts c ON l.supplier_id = c.id
    WHERE 1=1
    '''
    params = []
    if item_type == 'product':
        query += " AND l.product_id = ?"
        params.append(item_id)
    else:
        query += " AND l.ingredient_id = ?"
        params.append(item_id)
        
    if warehouse_id:
        query += " AND l.warehouse_id = ?"
        params.append(warehouse_id)
        
    query += " ORDER BY l.created_at DESC, l.id DESC LIMIT 100"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# --- 5. Xuất hủy hàng hóa (Hư hỏng / Hết hạn / Mất mát) ---
@router.post("/api/inventory/write-off")
def write_off_items(data: WriteOffCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name FROM warehouses WHERE id = ?", (data.warehouse_id,))
        wh = cur.fetchone()
        if not wh:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")

        processed = []
        for item in data.items:
            qty = float(item.quantity)
            if qty <= 0:
                continue
            
            note = f"Xuất hủy: {item.reason}" if item.reason else "Xuất hủy hàng hóa"
            if data.note:
                note += f" ({data.note})"

            if item.item_type == 'product':
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (data.warehouse_id, item.item_id))
                row = cur.fetchone()
                current_qty = row["quantity"] if row else 0.0
                new_qty = max(0.0, current_qty - qty)
                
                cur.execute('''
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = excluded.quantity,
                        updated_at = CURRENT_TIMESTAMP
                ''', (data.warehouse_id, item.item_id, new_qty))

                cur.execute('''
                    INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES ('product', ?, ?, 'WRITEOFF', ?, ?, ?)
                ''', (item.item_id, data.warehouse_id, -qty, new_qty, note))
                processed.append({"item_type": "product", "id": item.item_id, "written_off": qty, "balance": new_qty})

            else:
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (data.warehouse_id, item.item_id))
                row = cur.fetchone()
                current_qty = row["quantity"] if row else 0.0
                new_qty = max(0.0, current_qty - qty)

                cur.execute('''
                    INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                        quantity = excluded.quantity,
                        updated_at = CURRENT_TIMESTAMP
                ''', (data.warehouse_id, item.item_id, new_qty))

                cur.execute('''
                    INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES ('ingredient', ?, ?, 'WRITEOFF', ?, ?, ?)
                ''', (item.item_id, data.warehouse_id, -qty, new_qty, note))
                processed.append({"item_type": "ingredient", "id": item.item_id, "written_off": qty, "balance": new_qty})

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "processed": processed}

# ========================================================
# LOGIC BOM & TÍNH TOÁN GIÁ COST THÀNH PHẨM TỰ ĐỘNG
# ========================================================

