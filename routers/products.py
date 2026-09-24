from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from typing import Optional
from database import get_db
from schemas import ProductCreate, ProductUpdate
from logger_config import get_module_logger
import io
import time
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

logger = get_module_logger("products")

router = APIRouter(prefix="/api/products", tags=["Products"])

def clean_num(val):
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace("đ", "").replace("₫", "").replace(" ", "").strip()
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "." in s and len(s.split(".")[-1]) == 3:
        s = s.replace(".", "")
    elif "," in s and len(s.split(",")[-1]) == 3:
        s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0

@router.get("")
def list_products(category: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = '''
    SELECT p.*,
           GROUP_CONCAT(DISTINCT c.name) as supplier_names
    FROM products p
    LEFT JOIN supplier_items si ON si.item_type = 'product' AND si.product_id = p.id
    LEFT JOIN contacts c ON si.supplier_id = c.id
    WHERE COALESCE(p.is_active, 1) = 1 AND p.type != 'material'
    '''
    params = []
    if category:
        query += ' AND COALESCE(p.category, "Khác") = ?'
        params.append(category)
    query += '''
    GROUP BY p.id
    ORDER BY p.id DESC
    '''
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/categories")
def list_product_categories():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        SELECT DISTINCT COALESCE(category, 'Khác') as category
        FROM products
        WHERE COALESCE(is_active, 1) = 1 AND type != 'material'
        ORDER BY category ASC
    ''')
    rows = [r["category"] for r in cur.fetchall() if r["category"]]
    conn.close()
    return rows

@router.get("/export-excel")
@router.get("/export")
def export_products(warehouse_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    
    if warehouse_id:
        cur.execute('''
        SELECT 
            p.id, p.code, p.name, p.unit, p.type, p.cost_price, p.sell_price,
            COALESCE(p.category, 'Khác') as category,
            COALESCE(pi.quantity, 0) as stock,
            w.name as warehouse_name,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'product' AND si.product_id = p.id) as supplier_names
        FROM product_inventory pi
        JOIN products p ON p.id = pi.product_id
        JOIN warehouses w ON w.id = pi.warehouse_id
        WHERE pi.warehouse_id = ? AND COALESCE(p.is_active, 1) = 1
        ORDER BY p.id DESC
        ''', (warehouse_id,))
    else:
        cur.execute('''
        SELECT 
            p.id, p.code, p.name, p.unit, p.type, p.cost_price, p.sell_price,
            COALESCE(p.category, 'Khác') as category,
            COALESCE((SELECT SUM(quantity) FROM product_inventory pi WHERE pi.product_id = p.id), 0) as stock,
            'Tất cả kho' as warehouse_name,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'product' AND si.product_id = p.id) as supplier_names
        FROM products p
        WHERE COALESCE(p.is_active, 1) = 1 AND p.type != 'material'
        ORDER BY p.id DESC
        ''')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Danh_Sach_Hang_Hoa"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    headers = [
        "STT", "Mã hàng", "Tên hàng hóa", "Nhóm hàng", "Phân loại", 
        "ĐVT", "Giá vốn", "Giá bán", "Tồn kho", "Kho lưu trữ", "Nhà cung cấp"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for idx, r in enumerate(rows, 1):
        type_str = "Dịch vụ" if r["type"] == "service" else "Hàng hóa"
        row_data = [
            idx,
            r["code"] or "",
            r["name"] or "",
            r["category"] or "Khác",
            type_str,
            r["unit"] or "cái",
            r["cost_price"] or 0,
            r["sell_price"] or 0,
            r["stock"] or 0,
            r["warehouse_name"] or "Tất cả kho",
            r["supplier_names"] or ""
        ]
        ws.append(row_data)

    for row_idx in range(2, len(rows) + 2):
        ws.cell(row=row_idx, column=1).alignment = align_center
        ws.cell(row=row_idx, column=2).alignment = align_left
        ws.cell(row=row_idx, column=4).alignment = align_left
        ws.cell(row=row_idx, column=5).alignment = align_center
        ws.cell(row=row_idx, column=6).alignment = align_center
        ws.cell(row=row_idx, column=7).number_format = "#,##0"
        ws.cell(row=row_idx, column=8).number_format = "#,##0"
        ws.cell(row=row_idx, column=9).number_format = "#,##0"
        ws.cell(row=row_idx, column=10).alignment = align_left

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    
    filename = f"Danh_Sach_Hang_Hoa_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/template-excel")
def get_template_excel():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mau_Import_Hang_Hoa"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    headers = [
        "Mã hàng (để trống tự sinh)", "Tên hàng hóa (*bắt buộc)", "Nhóm hàng", "Phân loại (Hàng hóa/Dịch vụ)",
        "Đơn vị tính", "Giá vốn (đ)", "Giá bán (đ)", "Tồn kho ban đầu", "Nhà cung cấp"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    sample_rows = [
        ["SP001", "Thức ăn hạt cho chó 500g", "Thức ăn", "Hàng hóa", "gói", 45000, 70000, 50, "Công ty ABC"],
        ["SP002", "Dung dịch sữa tắm dưỡng lông 250ml", "Sữa tắm", "Hàng hóa", "chai", 80000, 120000, 20, "Công ty Hevico"],
        ["DV001", "Cắt tỉa lông và tắm vệ sinh", "Dịch vụ Spa", "Dịch vụ", "lần", 0, 150000, 0, ""]
    ]
    for r in sample_rows:
        ws.append(r)

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Mau_Import_Hang_Hoa.xlsx"'}
    )

@router.post("/import-excel")
@router.post("/import")
async def import_products_excel(file: UploadFile = File(...), warehouse_id: int = 1):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File rỗng!")
    
    rows = []
    filename = file.filename.lower() if file.filename else ""
    if filename.endswith(".csv"):
        import csv
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            sheet = wb.active
            rows = list(sheet.iter_rows(values_only=True))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Không thể đọc file Excel: {str(e)}")

    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="File không có dữ liệu hàng hóa (yêu cầu tối thiểu 1 dòng tiêu đề và 1 dòng dữ liệu)")

    header_row = [str(c or "").strip().lower() for c in rows[0]]
    
    def find_col(aliases):
        for idx, h in enumerate(header_row):
            for a in aliases:
                if a in h:
                    return idx
        return -1

    idx_code = find_col(["mã", "code", "sku"])
    idx_name = find_col(["tên", "name", "sản phẩm"])
    idx_cat = find_col(["nhóm", "group", "category", "danh mục"])
    idx_type = find_col(["loại", "type", "phân loại"])
    idx_unit = find_col(["đvt", "đơn vị", "unit"])
    idx_cost = find_col(["giá vốn", "vốn", "giá nhập", "cost"])
    idx_sell = find_col(["giá bán", "bán", "price", "đơn giá"])
    idx_stock = find_col(["tồn", "số lượng", "stock", "sl"])
    idx_supp = find_col(["nhà cung cấp", "ncc", "supplier"])

    if idx_name == -1:
        if len(header_row) >= 2:
            idx_code = 0
            idx_name = 1
        else:
            raise HTTPException(status_code=400, detail="Không tìm thấy cột 'Tên hàng hóa' trong file!")

    created_count = 0
    updated_count = 0
    errors = []

    conn = get_db()
    cur = conn.cursor()

    for row_idx, r in enumerate(rows[1:], start=2):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        
        name = str(r[idx_name] or "").strip() if idx_name < len(r) and r[idx_name] is not None else ""
        if not name:
            continue

        code = str(r[idx_code] or "").strip() if idx_code != -1 and idx_code < len(r) and r[idx_code] is not None else ""
        category_val = str(r[idx_cat] or "").strip() if idx_cat != -1 and idx_cat < len(r) and r[idx_cat] is not None else ""
        raw_type = str(r[idx_type] or "").strip().lower() if idx_type != -1 and idx_type < len(r) and r[idx_type] is not None else ""
        item_type = "service" if ("dịch vụ" in raw_type or "service" in raw_type) else "product"
        unit = str(r[idx_unit] or "cái").strip() if idx_unit != -1 and idx_unit < len(r) and r[idx_unit] is not None else "cái"
        cost_price = clean_num(r[idx_cost]) if idx_cost != -1 and idx_cost < len(r) else 0.0
        sell_price = clean_num(r[idx_sell]) if idx_sell != -1 and idx_sell < len(r) else 0.0
        stock_qty = clean_num(r[idx_stock]) if idx_stock != -1 and idx_stock < len(r) else 0.0
        supplier_name = str(r[idx_supp] or "").strip() if idx_supp != -1 and idx_supp < len(r) and r[idx_supp] is not None else ""

        try:
            existing = None
            if code:
                cur.execute("SELECT id, code, name FROM products WHERE code = ?", (code,))
                existing = cur.fetchone()
            if not existing and name:
                cur.execute("SELECT id, code, name FROM products WHERE name = ?", (name,))
                existing = cur.fetchone()

            if existing:
                pid = existing["id"]
                if category_val:
                    cur.execute("""
                        UPDATE products 
                        SET name = ?, unit = ?, type = ?, cost_price = ?, sell_price = ?, category = ?, is_active = 1
                        WHERE id = ?
                    """, (name, unit, item_type, cost_price, sell_price, category_val, pid))
                else:
                    cur.execute("""
                        UPDATE products 
                        SET name = ?, unit = ?, type = ?, cost_price = ?, sell_price = ?, is_active = 1
                        WHERE id = ?
                    """, (name, unit, item_type, cost_price, sell_price, pid))

                if item_type != "service" and stock_qty != 0:
                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, pid, stock_qty, stock_qty))
                    
                    cur.execute("""
                        UPDATE products SET stock = (
                            SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = ?
                        ) WHERE id = ?
                    """, (pid, pid))

                    cur.execute("""
                        INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                        VALUES ('product', ?, ?, 'ADJUST', ?, (SELECT quantity FROM product_inventory WHERE warehouse_id=? AND product_id=?), 'Nhập từ file Excel')
                    """, (pid, warehouse_id, stock_qty, warehouse_id, pid))

                updated_count += 1
            else:
                if not code:
                    code = f"SP-{int(time.time() * 1000) % 1000000:06d}"
                cat = category_val or "Khác"
                cur.execute("""
                    INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock, category, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (code, name, item_type, unit, cost_price, sell_price, stock_qty if item_type != "service" else 0, cat))
                pid = cur.lastrowid

                if item_type != "service":
                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    """, (warehouse_id, pid, stock_qty))
                    if stock_qty != 0:
                        cur.execute("""
                            INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                            VALUES ('product', ?, ?, 'ADJUST', ?, ?, 'Khởi tạo từ file Excel')
                        """, (pid, warehouse_id, stock_qty, stock_qty))

                created_count += 1

            if supplier_name:
                cur.execute("SELECT id FROM contacts WHERE type = 'supplier' AND name = ?", (supplier_name,))
                supp_row = cur.fetchone()
                if supp_row:
                    supp_id = supp_row["id"]
                else:
                    cur.execute("INSERT INTO contacts (type, name, debt) VALUES ('supplier', ?, 0)", (supplier_name,))
                    supp_id = cur.lastrowid
                
                cur.execute("""
                    INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost)
                    VALUES (?, 'product', ?, ?)
                """, (supp_id, pid, cost_price))

        except Exception as err:
            errors.append(f"Dòng {row_idx} ({name}): {str(err)}")

    conn.commit()
    conn.close()

    return {
        "success": True,
        "created": created_count,
        "updated": updated_count,
        "total_processed": created_count + updated_count,
        "errors": errors
    }

@router.post("")
def create_product(p: ProductCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cat = p.category or "Khác"
        cur.execute(
            "INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (p.code, p.name, p.type, p.cost_price, p.sell_price, p.stock, p.unit, cat)
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
        
        if p.supplier_ids:
            for s_id in p.supplier_ids:
                cur.execute(
                    "INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, ?)",
                    (s_id, pid, p.cost_price)
                )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": pid}

@router.put("/{product_id}")
def update_product(product_id: int, p: ProductUpdate):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, code, category FROM products WHERE id = ?", (product_id,))
        existing = cur.fetchone()
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")
        
        code = p.code if p.code else existing["code"]
        category = p.category if p.category is not None else (existing["category"] if "category" in existing.keys() else "Khác")
        cur.execute('''
            UPDATE products 
            SET code = ?, name = ?, type = ?, cost_price = ?, sell_price = ?, unit = ?, category = ?
            WHERE id = ?
        ''', (code, p.name, p.type, p.cost_price, p.sell_price, p.unit, category, product_id))

        if p.supplier_ids is not None:
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (product_id,))
            for s_id in p.supplier_ids:
                cur.execute(
                    "INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, ?)",
                    (s_id, product_id, p.cost_price)
                )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.delete("/{product_id}")
def delete_product(product_id: int):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM products WHERE id = ?", (product_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")
        
        # Soft delete (ẩn sản phẩm để bảo toàn lịch sử hóa đơn, sản xuất)
        cur.execute("UPDATE products SET is_active = 0 WHERE id = ?", (product_id,))
        cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (product_id,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.post("/{product_id}/restore")
def restore_product(product_id: int):
    """Bỏ ẩn / Khôi phục sản phẩm"""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE products SET is_active = 1 WHERE id = ?", (product_id,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.post("/{product_id}/convert-to-ingredient")
def convert_product_to_ingredient(product_id: int):
    """
    Chuyển đổi một Hàng Hóa (thành phẩm) sang Nguyên Vật Liệu:
    - Tạo bản ghi trong bảng ingredients (hoặc lấy nếu đã có mã/tên)
    - Chuyển tồn kho từ product_inventory sang inventory
    - Cập nhật định mức BOM liên quan
    - Chuyển nhà cung cấp (supplier_items) sang item_type = 'ingredient'
    - Đánh dấu sản phẩm cũ là type='material' hoặc ẩn đi
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy hàng hóa")

        # Kiểm tra ingredient theo code hoặc name
        cur.execute("SELECT id FROM ingredients WHERE (code = ? AND code IS NOT NULL) OR name = ?", (p["code"], p["name"]))
        ing = cur.fetchone()

        if ing:
            ing_id = ing["id"]
        else:
            ing_code = p["code"] if p["code"] else f"NL_{p['id']}"
            cur.execute('''
            INSERT INTO ingredients (code, name, unit, type)
            VALUES (?, ?, ?, 'IS_PHYSICAL')
            ''', (ing_code, p["name"], p["unit"] or 'cái'))
            ing_id = cur.lastrowid

        # Chuyển tồn kho
        cur.execute("SELECT warehouse_id, quantity FROM product_inventory WHERE product_id = ?", (product_id,))
        p_invs = cur.fetchall()
        for pi in p_invs:
            wh_id = pi["warehouse_id"]
            qty = pi["quantity"]
            if qty != 0:
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                ''', (wh_id, ing_id, qty, qty))

        # Lưu giá vốn vào price_history nếu có
        if p["cost_price"] and p["cost_price"] > 0:
            cur.execute('''
            INSERT INTO price_history (ingredient_id, purchase_price, effective_date, note)
            VALUES (?, ?, CURRENT_TIMESTAMP, 'Chuyển đổi từ hàng hóa')
            ''', (ing_id, p["cost_price"]))

        # Chuyển supplier_items
        cur.execute('''
        UPDATE supplier_items 
        SET item_type = 'ingredient', ingredient_id = ?, product_id = NULL
        WHERE item_type = 'product' AND product_id = ?
        ''', (ing_id, product_id))

        # Ẩn hàng hóa cũ đi để không còn hiện ở danh mục hàng hóa bán
        cur.execute("UPDATE products SET is_active = 0, type = 'material' WHERE id = ?", (product_id,))
        cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (product_id,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "ingredient_id": ing_id, "message": f"Đã chuyển '{p['name']}' thành nguyên liệu thành công!"}

# ========================================================
# CRUD CHO NGUYÊN LIỆU (INGREDIENTS) & KHO (WAREHOUSES)
# ========================================================

# --- 1. Warehouses (Kho hàng) ---
