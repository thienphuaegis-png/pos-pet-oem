from fastapi import APIRouter, HTTPException
from database import get_db
from schemas import BOMSetRequest

router = APIRouter(tags=["BOM & Costing"])

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

@router.get("/api/bom")
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

@router.get("/api/products/{product_id}/bom")
def get_product_bom(product_id: int):
    conn = get_db()
    result = calculate_product_cost_internal(product_id, conn)
    conn.close()
    return result

@router.post("/api/products/{product_id}/bom")
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

@router.post("/api/products/{product_id}/recalculate-cost")
def recalculate_cost(product_id: int):
    conn = get_db()
    result = calculate_product_cost_internal(product_id, conn)
    conn.close()
    return result

