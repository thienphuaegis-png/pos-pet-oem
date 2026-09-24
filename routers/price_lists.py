from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from schemas import PriceListCreate, PriceListUpdate, ProductPriceCreate, ProductPriceUpdate, CustomerSegmentCreate, CustomerSegmentUpdate
from logger_config import get_module_logger
from fastapi import Depends
from dependencies import require_permission

logger = get_module_logger("price_lists")

router = APIRouter(prefix="/api/price-lists", tags=["Price Lists"])

# ========== PRICE LISTS ==========
@router.get("")
def list_price_lists():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT pl.*, 
               (SELECT COUNT(*) FROM product_price_list ppl WHERE ppl.price_list_id = pl.id) as product_count
        FROM price_lists pl
        ORDER BY pl.id DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("")
def create_price_list(p: PriceListCreate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO price_lists (code, name, description) VALUES (?, ?, ?)",
            (p.code, p.name, p.description)
        )
        pid = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": pid}

@router.put("/{price_list_id}")
def update_price_list(price_list_id: int, p: PriceListUpdate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM price_lists WHERE id = ?", (price_list_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")
    fields = []
    vals = []
    if p.code is not None:
        fields.append("code = ?"); vals.append(p.code)
    if p.name is not None:
        fields.append("name = ?"); vals.append(p.name)
    if p.description is not None:
        fields.append("description = ?"); vals.append(p.description)
    if p.is_active is not None:
        fields.append("is_active = ?"); vals.append(p.is_active)
    if fields:
        vals.append(price_list_id)
        cur.execute(f"UPDATE price_lists SET {', '.join(fields)} WHERE id = ?", vals)
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.delete("/{price_list_id}")
def delete_price_list(price_list_id: int, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM product_price_list WHERE price_list_id = ?", (price_list_id,))
    if cur.fetchone()[0] > 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Bảng giá còn sản phẩm, xóa sản phẩm trước")
    cur.execute("DELETE FROM price_lists WHERE id = ?", (price_list_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# ========== PRODUCT PRICES ==========
@router.get("/{price_list_id}/products")
def list_product_prices(price_list_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT ppl.*, p.code as product_code, p.name as product_name, p.type as product_type, p.unit
        FROM product_price_list ppl
        JOIN products p ON ppl.product_id = p.id
        WHERE ppl.price_list_id = ?
        ORDER BY p.name
    """, (price_list_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/{price_list_id}/matrix")
def get_price_list_matrix(price_list_id: int, search: Optional[str] = None, category: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT 
            p.id as product_id, p.code as product_code, p.name as product_name, p.unit,
            COALESCE(p.category, 'Khác') as category,
            COALESCE(p.sell_price, 0) as default_retail_price,
            ppl.price as custom_price,
            CASE 
                WHEN ppl.price IS NOT NULL AND ppl.price > 0 THEN ppl.price 
                ELSE COALESCE(p.sell_price, 0) 
            END as effective_price,
            CASE WHEN (ppl.price IS NOT NULL AND ppl.price > 0) THEN 1 ELSE 0 END as is_custom
        FROM products p
        LEFT JOIN product_price_list ppl ON ppl.product_id = p.id AND ppl.price_list_id = ?
        WHERE (p.type = 'product' OR p.type IS NULL) AND COALESCE(p.is_active, 1) = 1
    """
    params = [price_list_id]
    if search:
        query += " AND (p.name LIKE ? OR p.code LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s])
    if category:
        query += " AND COALESCE(p.category, 'Khác') = ?"
        params.append(category)
    query += " ORDER BY p.name ASC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

class SetProductPriceReq(BaseModel):
    product_id: int
    custom_price: Optional[float] = None # None hoặc 0 để fallback về giá lẻ mặc định

class BulkDiscountReq(BaseModel):
    discount_percent: float
    category: Optional[str] = None

@router.post("/{price_list_id}/bulk-discount")
def apply_bulk_discount(price_list_id: int, req: BulkDiscountReq, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT id, sell_price FROM products WHERE (type = 'product' OR type IS NULL) AND sell_price > 0 AND COALESCE(is_active, 1) = 1"
    params = []
    if req.category:
        query += " AND COALESCE(category, 'Khác') = ?"
        params.append(req.category)
    cur.execute(query, tuple(params))
    prods = cur.fetchall()
    pct = max(0.0, min(100.0, req.discount_percent))
    factor = (100.0 - pct) / 100.0
    for p in prods:
        new_price = round((p['sell_price'] or 0) * factor, -2)
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(product_id, price_list_id) DO UPDATE SET price = excluded.price, discount_percent = excluded.discount_percent
        """, (p['id'], price_list_id, new_price, pct))
    conn.commit()
    conn.close()
    return {"status": "ok", "updated_count": len(prods)}

@router.post("/{price_list_id}/set-price")
def set_single_product_price(price_list_id: int, req: SetProductPriceReq, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    if req.custom_price is None or req.custom_price <= 0:
        cur.execute("DELETE FROM product_price_list WHERE price_list_id = ? AND product_id = ?", (price_list_id, req.product_id))
    else:
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 1, 0)
            ON CONFLICT(product_id, price_list_id) DO UPDATE SET price = excluded.price
        """, (req.product_id, price_list_id, req.custom_price))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.post("/{price_list_id}/products")
def add_product_price(price_list_id: int, p: ProductPriceCreate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM price_lists WHERE id = ?", (price_list_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")
    try:
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, ?, ?)
        """, (p.product_id, price_list_id, p.price, p.min_qty, p.discount_percent))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.put("/{price_list_id}/products/{product_id}")
def update_product_price(price_list_id: int, product_id: int, p: ProductPriceUpdate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    fields = []
    vals = []
    if p.price is not None:
        fields.append("price = ?"); vals.append(p.price)
    if p.min_qty is not None:
        fields.append("min_qty = ?"); vals.append(p.min_qty)
    if p.discount_percent is not None:
        fields.append("discount_percent = ?"); vals.append(p.discount_percent)
    if fields:
        vals.extend([price_list_id, product_id])
        cur.execute(f"UPDATE product_price_list SET {', '.join(fields)} WHERE price_list_id = ? AND product_id = ?", vals)
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.delete("/{price_list_id}/products/{product_id}")
def remove_product_price(price_list_id: int, product_id: int, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM product_price_list WHERE price_list_id = ? AND product_id = ?", (price_list_id, product_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# ========== CUSTOMER SEGMENTS ==========
router_segments = APIRouter(prefix="/api/customer-segments", tags=["Customer Segments"])

@router_segments.get("")
def list_segments():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT cs.*, pl.name as price_list_name,
               (SELECT COUNT(*) FROM contacts c WHERE c.segment_id = cs.id) as customer_count
        FROM customer_segments cs
        LEFT JOIN price_lists pl ON pl.id = cs.price_list_id
        ORDER BY cs.priority ASC, cs.name ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router_segments.post("")
def create_segment(s: CustomerSegmentCreate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO customer_segments (code, name, discount_percent, priority, price_list_id, min_points, allow_points) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (s.code, s.name, s.discount_percent, s.priority, s.price_list_id, s.min_points or 0, 1 if s.allow_points is None or s.allow_points else 0)
        )
        pid = cur.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": pid}

@router_segments.put("/{segment_id}")
def update_segment(segment_id: int, s: CustomerSegmentUpdate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM customer_segments WHERE id = ?", (segment_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phân loại")
    fields = []
    vals = []
    if s.code is not None:
        fields.append("code = ?"); vals.append(s.code)
    if s.name is not None:
        fields.append("name = ?"); vals.append(s.name)
    if s.discount_percent is not None:
        fields.append("discount_percent = ?"); vals.append(s.discount_percent)
    if s.priority is not None:
        fields.append("priority = ?"); vals.append(s.priority)
    if s.is_active is not None:
        fields.append("is_active = ?"); vals.append(s.is_active)
    if s.price_list_id is not None:
        fields.append("price_list_id = ?"); vals.append(s.price_list_id if s.price_list_id > 0 else None)
    if s.min_points is not None:
        fields.append("min_points = ?"); vals.append(s.min_points)
    if s.allow_points is not None:
        fields.append("allow_points = ?"); vals.append(1 if s.allow_points else 0)
    if fields:
        vals.append(segment_id)
        cur.execute(f"UPDATE customer_segments SET {', '.join(fields)} WHERE id = ?", vals)
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router_segments.delete("/{segment_id}")
def delete_segment(segment_id: int, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET segment_id = NULL WHERE segment_id = ?", (segment_id,))
    cur.execute("DELETE FROM customer_segments WHERE id = ?", (segment_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}
