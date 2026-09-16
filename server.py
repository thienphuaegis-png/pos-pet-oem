from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import datetime
import time
import os
import sys
from database import get_db, init_db

app = FastAPI(title="POS KiotViet Offline")

init_db()

def get_template_path():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, "templates", "index.html")

@app.get("/", response_class=HTMLResponse)
def index():
    path = get_template_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>UI template not found</h1>"


# --- Pydantic Models ---
class OrderItemIn(BaseModel):
    product_id: int
    quantity: float
    price: float

class OrderCreate(BaseModel):
    customer_id: int
    staff_id: int
    discount: float = 0
    paid_amount: float
    note: Optional[str] = ""
    warehouse_id: Optional[int] = 1 # Kho xuất nguyên liệu
    items: List[OrderItemIn]

class ProductCreate(BaseModel):
    code: str
    name: str
    type: str # product, service, material
    cost_price: float = 0
    sell_price: float = 0
    stock: float = 0
    unit: str = "cái"

# --- Schema cho Ingredients, Warehouses, Inventory ---
class IngredientCreate(BaseModel):
    code: Optional[str] = None
    name: str
    unit: str = "cái"
    type: str = "IS_PHYSICAL" # IS_PHYSICAL | SERVICE
    initial_stock: float = 0
    initial_cost: float = 0
    warehouse_id: Optional[int] = 1

class IngredientUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    unit: str = "cái"
    type: str = "IS_PHYSICAL"

class WarehouseCreate(BaseModel):
    code: Optional[str] = None
    name: str
    address: Optional[str] = ""

class WarehouseUpdate(BaseModel):
    code: Optional[str] = None
    name: str
    address: Optional[str] = ""
    is_active: int = 1

class InventoryAdjust(BaseModel):
    warehouse_id: int
    ingredient_id: int
    quantity: float # Số lượng mới hoặc delta
    mode: str = "set" # 'set' (đặt số lượng tuyệt đối) hoặc 'add' (cộng dồn)
    purchase_price: Optional[float] = None
    supplier_id: Optional[int] = None
    note: Optional[str] = ""

class BOMItemIn(BaseModel):
    ingredient_id: int
    quantity: float # Số lượng tiêu hao cho 1 thành phẩm

class BOMSetRequest(BaseModel):
    items: List[BOMItemIn]

class PurchaseItemIn(BaseModel):
    item_type: str = "product" # "product" | "ingredient"
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    item_name: Optional[str] = ""
    unit: Optional[str] = "cái"
    quantity: float
    cost_price: float

class PurchaseCreate(BaseModel):
    supplier_id: int
    warehouse_id: Optional[int] = 1
    discount: float = 0
    shipping_fee: float = 0
    other_fee: float = 0
    vat_rate: float = 0
    paid_amount: float = 0
    expected_date: Optional[str] = None
    note: Optional[str] = ""
    items: List[PurchaseItemIn]

class ProductionItemIn(BaseModel):
    product_id: int
    quantity: float

class ProductionCreate(BaseModel):
    warehouse_id: Optional[int] = 1
    note: Optional[str] = ""
    items: List[ProductionItemIn]

class CashbookCreate(BaseModel):
    type: str # in, out
    category: str
    amount: float
    contact_id: Optional[int] = None
    note: Optional[str] = ""

class CompanySettingsUpdate(BaseModel):
    shop_name: str
    shop_address: str
    shop_phone: str
    shop_footer: str
    shop_bank_code: str
    shop_bank_account: str
    shop_bank_owner: str
    shop_qr_mode: str
    shop_qr_image: Optional[str] = ""

class TransferItemIn(BaseModel):
    item_type: str = "product" # "product" | "ingredient"
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    quantity: float

class TransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    note: Optional[str] = ""
    items: List[TransferItemIn]

class AuditItemIn(BaseModel):
    item_type: str = "product" # "product" | "ingredient"
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    actual_qty: float
    system_qty: float
    note: Optional[str] = ""

class AuditCreate(BaseModel):
    warehouse_id: int
    note: Optional[str] = ""
    items: List[AuditItemIn]
    shop_logo: Optional[str] = ""

class TemplateSettingsUpdate(BaseModel):
    print_blocks_config: str

# --- APIs Settings ---


@app.get("/api/settings")
def get_settings():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    settings = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return settings

@app.post("/api/settings/company")
def update_company_settings(req: CompanySettingsUpdate):
    conn = get_db()
    cur = conn.cursor()
    updates = [
        ('shop_name', req.shop_name),
        ('shop_address', req.shop_address),
        ('shop_phone', req.shop_phone),
        ('shop_footer', req.shop_footer),
        ('shop_bank_code', req.shop_bank_code),
        ('shop_bank_account', req.shop_bank_account),
        ('shop_bank_owner', req.shop_bank_owner),
        ('shop_qr_mode', req.shop_qr_mode),
        ('shop_qr_image', req.shop_qr_image or ""),
        ('shop_logo', req.shop_logo or "")
    ]
    for key, val in updates:
        cur.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", (key, val, val))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/settings/template")
def update_template_settings(req: TemplateSettingsUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO settings (key, value) VALUES ('print_blocks_config', ?) ON CONFLICT(key) DO UPDATE SET value = ?", (req.print_blocks_config, req.print_blocks_config))
    conn.commit()
    conn.close()
    return {"status": "ok"}



@app.get("/api/orders")
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

@app.get("/api/orders/{code}")
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

@app.get("/api/products")
def list_products():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM products ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.post("/api/products")
def create_product(p: ProductCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (p.code, p.name, p.type, p.cost_price, p.sell_price, p.stock, p.unit)
        )
        pid = cur.lastrowid
        if p.type != 'service' and p.stock > 0:
            cur.execute(
                "INSERT INTO product_inventory (warehouse_id, product_id, quantity) VALUES (1, ?, ?)",
                (pid, p.stock)
            )
            cur.execute('''
            INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
            VALUES ('product', ?, 1, 'ADJUST', ?, ?, 'Khởi tạo ban đầu')
            ''', (pid, p.stock, p.stock))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

# ========================================================
# CRUD CHO NGUYÊN LIỆU (INGREDIENTS) & KHO (WAREHOUSES)
# ========================================================

# --- 1. Warehouses (Kho hàng) ---
@app.get("/api/warehouses")
def list_warehouses():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM warehouses ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.post("/api/warehouses")
def create_warehouse(w: WarehouseCreate):
    conn = get_db()
    cur = conn.cursor()
    code = w.code or f"WH-{int(time.time() * 1000)}"
    try:
        cur.execute("INSERT INTO warehouses (code, name, address) VALUES (?, ?, ?)", (code, w.name, w.address))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code}

@app.put("/api/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, w: WarehouseUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE warehouses SET name = ?, address = ?, is_active = ? WHERE id = ?",
        (w.name, w.address, w.is_active, warehouse_id)
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM warehouses WHERE id = ?", (warehouse_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# --- 2. Ingredients (Nguyên liệu / Dịch vụ thành phần) ---
@app.get("/api/ingredients")
def list_ingredients():
    conn = get_db()
    cur = conn.cursor()
    # Lấy thông tin kèm tổng tồn kho và giá nhập gần nhất
    query = '''
    SELECT 
        i.*,
        COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) AS total_stock,
        COALESCE(
            (SELECT purchase_price FROM price_history ph 
             WHERE ph.ingredient_id = i.id 
             ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
            0
        ) AS latest_cost
    FROM ingredients i
    ORDER BY i.id DESC
    '''
    cur.execute(query)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.post("/api/ingredients")
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

@app.put("/api/ingredients/{ingredient_id}")
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

@app.delete("/api/ingredients/{ingredient_id}")
def delete_ingredient(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# --- 3. Inventory & Price History (Tồn kho & Lịch sử giá) ---
@app.get("/api/inventory")
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

@app.post("/api/inventory/adjust")
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

@app.get("/api/ingredients/{ingredient_id}/price-history")
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

@app.get("/api/ingredients/{ingredient_id}/logs")
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

@app.get("/api/ingredients/{ingredient_id}/detail")
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

@app.get("/api/warehouses/overview")
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

@app.get("/api/inventory/unified")
def get_unified_inventory(warehouse_id: Optional[int] = None, item_type: Optional[str] = None, search: Optional[str] = None, low_stock: Optional[bool] = False):
    conn = get_db()
    cur = conn.cursor()
    
    params_p = []
    where_p = ["p.type != 'service'"]
    if warehouse_id:
        where_p.append("w.id = ?")
        params_p.append(warehouse_id)
    else:
        where_p.append("COALESCE(pi.quantity, 0) != 0")
        
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
        w.id as warehouse_id,
        w.name as warehouse_name,
        COALESCE(pi.quantity, 0) as quantity,
        COALESCE(pi.quantity * p.cost_price, 0) as total_value
    FROM products p
    JOIN warehouses w ON 1=1
    LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.warehouse_id = w.id
    WHERE {' AND '.join(where_p)}
    '''
    
    params_i = []
    where_i = ["i.type = 'IS_PHYSICAL'"]
    if warehouse_id:
        where_i.append("w.id = ?")
        params_i.append(warehouse_id)
    else:
        where_i.append("COALESCE(inv.quantity, 0) != 0")
        
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
        w.id as warehouse_id,
        w.name as warehouse_name,
        COALESCE(inv.quantity, 0) as quantity,
        COALESCE(inv.quantity * COALESCE(
            (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
        ), 0) as total_value
    FROM ingredients i
    JOIN warehouses w ON 1=1
    LEFT JOIN inventory inv ON inv.ingredient_id = i.id AND inv.warehouse_id = w.id
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

@app.post("/api/inventory/transfer")
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

@app.get("/api/inventory/transfers")
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

@app.post("/api/inventory/audit")
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

@app.get("/api/inventory/audits")
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

@app.get("/api/inventory/item-logs")
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

# ========================================================
# LOGIC BOM & TÍNH TOÁN GIÁ COST THÀNH PHẨM TỰ ĐỘNG
# ========================================================

def calculate_product_cost_internal(product_id: int, conn) -> dict:
    """
    Tính tổng giá vốn sản phẩm dựa trên định lượng BOM và đơn giá nhập gần nhất.
    Trả về dict gồm: total_cost, chi tiết các thành phần, và tự động UPDATE products.cost_price.
    """
    cur = conn.cursor()
    # Kiểm tra sản phẩm tồn tại
    cur.execute("SELECT id, code, name, sell_price, cost_price FROM products WHERE id = ?", (product_id,))
    prod = cur.fetchone()
    if not prod:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    # Lấy các thành phần trong BOM kèm đơn giá nhập mới nhất
    query = '''
    SELECT 
        b.id as bom_id,
        b.ingredient_id,
        b.quantity,
        i.code as ingredient_code,
        i.name as ingredient_name,
        i.unit,
        i.type as ingredient_type,
        COALESCE(
            (SELECT purchase_price FROM price_history ph 
             WHERE ph.ingredient_id = b.ingredient_id 
             ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
            0
        ) AS latest_cost
    FROM product_bom b
    JOIN ingredients i ON b.ingredient_id = i.id
    WHERE b.product_id = ?
    ORDER BY b.id ASC
    '''
    cur.execute(query, (product_id,))
    bom_items = [dict(r) for r in cur.fetchall()]

    total_cost = 0.0
    for item in bom_items:
        line_cost = round(item["quantity"] * item["latest_cost"], 2)
        item["line_cost"] = line_cost
        total_cost += line_cost

    total_cost = round(total_cost, 2)

    # Cập nhật ngược lại bảng products
    cur.execute("UPDATE products SET cost_price = ? WHERE id = ?", (total_cost, product_id))
    conn.commit()

    return {
        "product_id": product_id,
        "product_name": prod["name"],
        "sell_price": prod["sell_price"],
        "cost_price": total_cost,
        "profit_margin": round(prod["sell_price"] - total_cost, 2),
        "bom_items": bom_items
    }

@app.get("/api/bom")
def get_all_bom():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT pb.id, pb.product_id, pb.ingredient_id, pb.quantity,
           p.name as product_name, i.name as ingredient_name, i.unit,
           COALESCE(
               (SELECT purchase_price FROM price_history ph 
                WHERE ph.ingredient_id = i.id 
                ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
               0
           ) as latest_cost
    FROM product_bom pb
    JOIN products p ON pb.product_id = p.id
    JOIN ingredients i ON pb.ingredient_id = i.id
    ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.get("/api/products/{product_id}/bom")
def get_product_bom(product_id: int):
    conn = get_db()
    result = calculate_product_cost_internal(product_id, conn)
    conn.close()
    return result

@app.post("/api/products/{product_id}/bom")
def set_product_bom(product_id: int, req: BOMSetRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Xóa BOM cũ
        cur.execute("DELETE FROM product_bom WHERE product_id = ?", (product_id,))
        # Thêm mới các thành phần định lượng
        for item in req.items:
            if item.quantity <= 0:
                continue
            cur.execute(
                "INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, ?)",
                (product_id, item.ingredient_id, item.quantity)
            )
        conn.commit()
        # Tính toán lại giá cost sau khi cập nhật BOM
        result = calculate_product_cost_internal(product_id, conn)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return result

@app.post("/api/products/{product_id}/recalculate-cost")
def recalculate_cost(product_id: int):
    conn = get_db()
    result = calculate_product_cost_internal(product_id, conn)
    conn.close()
    return result

@app.get("/api/contacts")
def list_contacts(type: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    if type:
        cur.execute("SELECT * FROM contacts WHERE type = ? ORDER BY id DESC", (type,))
    else:
        cur.execute("SELECT * FROM contacts ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.post("/api/contacts")
def create_contact(name: str, type: str = "customer", phone: str = "", address: str = ""):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (type, name, phone, address) VALUES (?, ?, ?, ?)", (type, name, phone, address))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.get("/api/staff")
def list_staff():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM staff ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# Ban hang (POS)
@app.post("/api/orders")
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
@app.get("/api/purchases")
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

@app.get("/api/purchases/{code}")
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

@app.post("/api/purchases")
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

@app.post("/api/purchases/{code}/receive")
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

@app.delete("/api/purchases/{code}")
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
@app.get("/api/productions")
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

@app.get("/api/productions/{code}")
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

@app.post("/api/productions")
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
@app.get("/api/cashbook")
def list_cashbook():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook ORDER BY id DESC LIMIT 100")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@app.post("/api/cashbook")
def create_cashbook(req: CashbookCreate):
    conn = get_db()
    cur = conn.cursor()
    code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    cur.execute('''
    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, note)
    VALUES (?, ?, ?, ?, ?, 'manual', ?)
    ''', (code, req.type, req.category, req.amount, req.contact_id, req.note))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# Bao cao tong hop
@app.get("/api/reports/summary")
def report_summary():
    conn = get_db()
    cur = conn.cursor()
    # Doanh thu
    cur.execute("SELECT COALESCE(SUM(final_amount), 0) as revenue, COALESCE(SUM(debt_amount), 0) as customer_debt FROM orders")
    order_stat = cur.fetchone()
    # Tong chi & Thu so quy
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type = 'in'")
    total_in = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type = 'out'")
    total_out = cur.fetchone()[0]
    # No NCC
    cur.execute("SELECT COALESCE(SUM(debt), 0) FROM contacts WHERE type = 'supplier'")
    supplier_debt = cur.fetchone()[0]
    # Tong hoa hong nhan vien
    cur.execute("SELECT COALESCE(SUM(commission_amount), 0) FROM orders")
    total_comm = cur.fetchone()[0]

    conn.close()
    return {
        "revenue": order_stat["revenue"],
        "customer_debt": order_stat["customer_debt"],
        "cash_balance": total_in - total_out,
        "supplier_debt": supplier_debt,
        "commission_paid": total_comm
    }
