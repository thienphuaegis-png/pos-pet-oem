from fastapi import APIRouter, HTTPException
from database import get_db
from schemas import ProductCreate

router = APIRouter(prefix="/api/products", tags=["Products"])

@router.get("")
def list_products():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT p.*,
           GROUP_CONCAT(DISTINCT c.name) as supplier_names
    FROM products p
    LEFT JOIN supplier_items si ON si.item_type = 'product' AND si.product_id = p.id
    LEFT JOIN contacts c ON si.supplier_id = c.id
    GROUP BY p.id
    ORDER BY p.id DESC
    ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("")
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
