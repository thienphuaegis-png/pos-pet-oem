from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import datetime
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
    items: List[OrderItemIn]

class ProductCreate(BaseModel):
    code: str
    name: str
    type: str # product, service, material
    cost_price: float = 0
    sell_price: float = 0
    stock: float = 0
    unit: str = "cái"

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

        for item in req.items:
            subtotal = item.quantity * item.price
            cur.execute('''
            INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
            VALUES (?, ?, ?, ?, ?)
            ''', (order_id, item.product_id, item.quantity, item.price, subtotal))
            
            # Tru ton kho neu khong phai la dich vu
            cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (item.quantity, item.product_id))

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
