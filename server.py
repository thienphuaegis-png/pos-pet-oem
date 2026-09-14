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
    product_id: int
    quantity: float
    cost_price: float

class PurchaseCreate(BaseModel):
    supplier_id: int
    paid_amount: float
    note: Optional[str] = ""
    items: List[PurchaseItemIn]

class ProductionCreate(BaseModel):
    product_id: int
    quantity: float
    note: Optional[str] = ""

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

# Nhap hang
@app.post("/api/purchases")
def create_purchase(req: PurchaseCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        total_amount = sum(item.quantity * item.cost_price for item in req.items)
        debt_amount = max(0.0, total_amount - req.paid_amount)
        code = f"PN{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"

        cur.execute('''
        INSERT INTO purchases (code, supplier_id, total_amount, paid_amount, debt_amount, note)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', (code, req.supplier_id, total_amount, req.paid_amount, debt_amount, req.note))
        purchase_id = cur.lastrowid

        for item in req.items:
            subtotal = item.quantity * item.cost_price
            cur.execute('''
            INSERT INTO purchase_items (purchase_id, product_id, quantity, cost_price, subtotal)
            VALUES (?, ?, ?, ?, ?)
            ''', (purchase_id, item.product_id, item.quantity, item.cost_price, subtotal))
            # Cong ton kho & cap nhat gia von
            cur.execute("UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?", (item.quantity, item.cost_price, item.product_id))

        if debt_amount > 0:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (debt_amount, req.supplier_id))

        if req.paid_amount > 0:
            cb_code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
            cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?)
            ''', (cb_code, req.paid_amount, req.supplier_id, purchase_id, f"Chi nhập hàng {code}"))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "purchase_code": code}

# San xuat (BOM Execution)
@app.post("/api/productions")
def create_production(req: ProductionCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Kiem tra BOM dinh luong
        cur.execute("SELECT material_id, quantity FROM bom WHERE product_id = ?", (req.product_id,))
        boms = cur.fetchall()
        if not boms:
            raise Exception("Sản phẩm này chưa được cài định lượng nguyên liệu (BOM)!")

        # Kiem tra xem du nguyen lieu khong & tinh gia von
        total_cost = 0
        for b in boms:
            mat_id = b["material_id"]
            need_qty = b["quantity"] * req.quantity
            cur.execute("SELECT stock, cost_price, name FROM products WHERE id = ?", (mat_id,))
            mat = cur.fetchone()
            if not mat or mat["stock"] < need_qty:
                raise Exception(f"Không đủ nguyên liệu: {mat['name'] if mat else mat_id} (Cần {need_qty}, tồn {mat['stock'] if mat else 0})")
            total_cost += need_qty * mat["cost_price"]

        # Tru nguyen lieu
        for b in boms:
            need_qty = b["quantity"] * req.quantity
            cur.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (need_qty, b["material_id"]))

        # Cong thanh pham
        unit_cost = total_cost / req.quantity if req.quantity > 0 else 0
        cur.execute("UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?", (req.quantity, unit_cost, req.product_id))

        code = f"SX{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        cur.execute("INSERT INTO productions (code, product_id, quantity, note) VALUES (?, ?, ?, ?)", (code, req.product_id, req.quantity, req.note))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "production_code": code}

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
