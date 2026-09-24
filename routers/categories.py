from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from database import get_db
from logger_config import get_module_logger

logger = get_module_logger("categories")

router = APIRouter(prefix="/api/categories", tags=["categories"])

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = ""
    sort_order: Optional[int] = 0

class CategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = ""
    sort_order: Optional[int] = 0

@router.get("")
def list_categories():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        SELECT c.id, c.name, c.description, c.sort_order, COUNT(p.id) as product_count
        FROM product_categories c
        LEFT JOIN products p ON p.category = c.name
        GROUP BY c.id, c.name
        ORDER BY c.sort_order ASC, c.name ASC
    ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("")
def create_category(payload: CategoryCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên nhóm hàng không được để trống")
    
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?)", (name,))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Tên nhóm hàng đã tồn tại")
    
    cur.execute(
        "INSERT INTO product_categories (name, description, sort_order) VALUES (?, ?, ?)",
        (name, payload.description or "", payload.sort_order or 0)
    )
    new_id = cur.lastrowid
    conn.commit()
    
    cur.execute("SELECT id, name, description, sort_order, created_at FROM product_categories WHERE id = ?", (new_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row

@router.put("/{cat_id}")
def update_category(cat_id: int, payload: CategoryUpdate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên nhóm hàng không được để trống")
        
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT id, name FROM product_categories WHERE id = ?", (cat_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Nhóm hàng không tồn tại")
    
    old_name = existing["name"]
    
    if old_name.lower() != name.lower():
        cur.execute("SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?) AND id != ?", (name, cat_id))
        if cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Tên nhóm hàng đã tồn tại")
            
    cur.execute(
        "UPDATE product_categories SET name = ?, description = ?, sort_order = ? WHERE id = ?",
        (name, payload.description or "", payload.sort_order or 0, cat_id)
    )
    
    if old_name != name:
        cur.execute("UPDATE products SET category = ? WHERE category = ?", (name, old_name))
        
    conn.commit()
    
    cur.execute("SELECT id, name, description, sort_order, created_at FROM product_categories WHERE id = ?", (cat_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row

@router.delete("/{cat_id}")
def delete_category(cat_id: int):
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("SELECT id, name FROM product_categories WHERE id = ?", (cat_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Nhóm hàng không tồn tại")
        
    old_name = existing["name"]
    if old_name.strip().lower() == "khác":
        conn.close()
        raise HTTPException(status_code=400, detail="Không thể xóa nhóm mặc định 'Khác'")
        
    cur.execute("UPDATE products SET category = 'Khác' WHERE category = ?", (old_name,))
    cur.execute("DELETE FROM product_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Đã xóa nhóm hàng và chuyển sản phẩm về nhóm 'Khác'"}
