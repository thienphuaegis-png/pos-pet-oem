from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from typing import Optional
from database import get_db
from schemas import ProductCreate, ProductUpdate, ProductBulkStatusIn, ProductBulkDeleteIn
from logger_config import get_module_logger
from dependencies import get_optional_user, can_view_cost, require_role, require_permission
import os
import shutil
import io
import time
import datetime
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
def list_products(category: Optional[str] = None, for_bom: Optional[bool] = False, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    query = '''
    SELECT p.*,
           GROUP_CONCAT(DISTINCT c.name) as supplier_names,
           (SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = p.id) as bom_count,
           COALESCE(p.requires_bom, CASE WHEN (SELECT COUNT(*) FROM product_bom pb WHERE pb.product_id = p.id) > 0 OR (SELECT COUNT(*) FROM oem_order_items oi WHERE oi.product_id = p.id) > 0 THEN 1 ELSE 0 END) as computed_requires_bom
    FROM products p
    LEFT JOIN supplier_items si ON si.item_type = 'product' AND si.product_id = p.id
    LEFT JOIN contacts c ON si.supplier_id = c.id
    WHERE COALESCE(p.is_active, 1) = 1 AND p.type != 'material'
    '''
    params = []
    if category:
        query += ' AND COALESCE(p.category, "Khác") = ?'
        params.append(category)
    if for_bom:
        # Lọc sạch nguyên liệu (Yêu cầu 2a):
        # 1. Mã không bắt đầu bằng NL- hoặc NL_
        # 2. Không thuộc danh mục "Nguyên liệu"
        # 3. Không trùng mã hoặc tên với nguyên liệu trong bảng ingredients
        query += """
            AND (p.code IS NULL OR (p.code NOT LIKE 'NL-%' AND p.code NOT LIKE 'NL_%'))
            AND LOWER(COALESCE(p.category, '')) NOT LIKE '%nguyên liệu%'
            AND NOT EXISTS (
                SELECT 1 FROM ingredients i 
                WHERE (i.code IS NOT NULL AND i.code != '' AND i.code = p.code)
                   OR (i.name IS NOT NULL AND i.name != '' AND i.name = p.name)
            )
        """
    query += '''
    GROUP BY p.id
    ORDER BY p.id DESC
    '''
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        computed = r.pop("computed_requires_bom", None)
        if r.get("requires_bom") is None:
            r["requires_bom"] = computed if computed is not None else (1 if (r.get("bom_count") or 0) > 0 else 0)

    # Gắn đơn vị quy đổi để POS cho chọn Thùng/Chai
    cur.execute("SELECT item_id, unit_name, ratio, sell_price, is_default_sale FROM item_units WHERE item_type = 'product' ORDER BY ratio")
    units_map = {}
    for u in cur.fetchall():
        units_map.setdefault(u["item_id"], []).append(dict(u))
    for r in rows:
        r["units"] = units_map.get(r["id"], [])

    # Gắn danh sách tóm tắt các món con cho combo (type = 'combo')
    try:
        cur.execute('''
            SELECT c.code, ci.quantity, p.name as product_name
            FROM combo_items ci
            JOIN combos c ON ci.combo_id = c.id
            JOIN products p ON ci.product_id = p.id
            WHERE COALESCE(c.is_active, 1) = 1
            ORDER BY ci.id ASC
        ''')
        combo_map = {}
        for ci in cur.fetchall():
            c_code = (ci["code"] or "").strip().upper()
            qty_fmt = int(ci["quantity"]) if ci["quantity"] == int(ci["quantity"]) else ci["quantity"]
            combo_map.setdefault(c_code, []).append(f"{qty_fmt}x {ci['product_name']}")
        
        for r in rows:
            if r.get("type") == "combo":
                c_code = (r.get("code") or "").strip().upper()
                r["combo_summary"] = ", ".join(combo_map.get(c_code, []))
    except Exception:
        pass

    if not can_view_cost(user):
        for r in rows:
            r.pop("cost_price", None)

    conn.close()
    return rows

@router.get("/categories")
def list_product_categories():
    conn = get_db()
    cur = conn.cursor()
    # Dong bo giua bang master product_categories va category thuc te cua san pham
    cur.execute('''
        SELECT name as category FROM product_categories ORDER BY sort_order ASC, name ASC
    ''')
    master_cats = [r["category"].strip() for r in cur.fetchall() if r["category"] and r["category"].strip()]

    cur.execute('''
        SELECT DISTINCT COALESCE(category, 'Khác') as category
        FROM products
        WHERE COALESCE(is_active, 1) = 1 AND type != 'material'
        ORDER BY category ASC
    ''')
    prod_cats = [r["category"].strip() for r in cur.fetchall() if r["category"] and r["category"].strip()]

    # Hop nhat khong trung lap, giu thu tu uu tien cua master
    seen = set()
    rows = []
    for c in master_cats + prod_cats:
        c_clean = c.strip()
        c_lower = c_clean.lower()
        if c_lower not in seen:
            seen.add(c_lower)
            rows.append(c_clean)

    conn.close()
    return rows

@router.get("/export-excel")
@router.get("/export")
def export_products(warehouse_id: Optional[int] = None, user=Depends(get_optional_user)):
    show_cost = can_view_cost(user)
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

    # Không có quyền xem giá vốn -> bỏ hẳn cột "Giá vốn" khỏi file xuất
    if not show_cost:
        ws.delete_cols(7)

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
    
    def find_col(exact_matches, partial_matches=None):
        for idx, h in enumerate(header_row):
            for em in exact_matches:
                if h == em.strip().lower():
                    return idx
        if partial_matches:
            for idx, h in enumerate(header_row):
                for pm in partial_matches:
                    if pm.strip().lower() in h:
                        return idx
        return -1

    idx_code = find_col(["mã hàng", "mã sản phẩm", "mã sp", "mã", "code", "sku"], ["mã hàng", "mã sản phẩm", "mã sp", "code", "sku"])
    idx_name = find_col(["tên hàng", "tên hàng hóa", "tên sản phẩm", "tên sp", "tên", "name"], ["tên hàng", "tên sản phẩm", "tên", "name"])
    if idx_name == idx_code and idx_name != -1:
        idx_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_code and any(pm in h for pm in ["tên", "name"]):
                idx_name = idx
                break

    idx_cat = find_col(["nhóm hàng", "nhóm hàng(3 cấp)", "nhóm", "group", "category", "danh mục"], ["nhóm hàng", "nhóm", "group", "category", "danh mục"])
    idx_type = find_col(["loại hàng", "loại", "type", "phân loại"], ["loại hàng", "phân loại", "loại", "type"])
    idx_unit = find_col(["đvt", "đơn vị", "đơn vị tính", "unit"], ["đơn vị tính", "đvt", "unit"])
    idx_base_code = find_col(["mã đvt cơ bản", "mã cơ bản", "base_code"], ["mã đvt cơ bản", "mã cơ bản"])
    idx_ratio = find_col(["quy đổi", "hệ số quy đổi", "ratio"], ["quy đổi", "ratio"])
    idx_cost = find_col(["giá vốn", "vốn", "giá nhập", "cost"], ["giá vốn", "vốn", "giá nhập", "cost"])
    idx_sell = find_col(["giá bán", "bán", "price", "đơn giá"], ["giá bán", "bán", "price", "đơn giá"])
    idx_stock = find_col(["tồn kho", "tồn kho ban đầu", "tồn", "số lượng", "stock", "sl"], ["tồn kho", "số lượng", "stock"])
    idx_min_stock = find_col(["tồn nhỏ nhất", "tồn tối thiểu", "min_stock"], ["tồn nhỏ nhất", "tồn tối thiểu", "min_stock"])
    idx_img = find_col(["hình ảnh", "hình ảnh (url1,url2...)", "ảnh", "image", "image_url"], ["hình ảnh", "image"])
    idx_active = find_col(["đang kinh doanh", "is_active", "trạng thái"], ["đang kinh doanh", "is_active"])
    idx_supp = find_col(["nhà cung cấp", "ncc", "supplier"], ["nhà cung cấp", "ncc", "supplier"])

    if idx_name == -1:
        if len(header_row) >= 2:
            idx_code = 0
            idx_name = 1
        else:
            raise HTTPException(status_code=400, detail="Không tìm thấy cột 'Tên hàng hóa' trong file!")

    created_count = 0
    updated_count = 0
    units_synced = 0
    errors = []

    conn = get_db()
    cur = conn.cursor()

    def cell_str(row, col_i):
        if col_i == -1 or col_i >= len(row) or row[col_i] is None:
            return ""
        return str(row[col_i]).strip()

    base_rows = []
    conv_rows = []
    for row_idx, r in enumerate(rows[1:], start=2):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        name = cell_str(r, idx_name)
        if not name:
            continue
        base_code = cell_str(r, idx_base_code)
        ratio_val = clean_num(r[idx_ratio]) if idx_ratio != -1 and idx_ratio < len(r) and r[idx_ratio] is not None else 1.0
        if ratio_val <= 0:
            ratio_val = 1.0
        code = cell_str(r, idx_code)
        if base_code and base_code.upper() != code.upper() and ratio_val != 1.0:
            conv_rows.append((row_idx, r, base_code, ratio_val))
        else:
            base_rows.append((row_idx, r))

    # PASS 1: Dòng sản phẩm gốc (đơn vị cơ bản)
    for row_idx, r in base_rows:
        name = cell_str(r, idx_name)
        code = cell_str(r, idx_code)
        raw_cat = cell_str(r, idx_cat)
        category_val = raw_cat.split(">>")[-1].strip() if ">>" in raw_cat else raw_cat
        raw_type = cell_str(r, idx_type).lower()
        item_type = "service" if ("dịch vụ" in raw_type or "service" in raw_type) else "product"
        unit = cell_str(r, idx_unit) or "cái"
        cost_price = clean_num(r[idx_cost]) if idx_cost != -1 and idx_cost < len(r) else 0.0
        sell_price = clean_num(r[idx_sell]) if idx_sell != -1 and idx_sell < len(r) else 0.0
        has_stock_col = idx_stock != -1 and idx_stock < len(r) and r[idx_stock] is not None and str(r[idx_stock]).strip() != ""
        stock_qty = clean_num(r[idx_stock]) if has_stock_col else 0.0
        has_min_col = idx_min_stock != -1 and idx_min_stock < len(r) and r[idx_min_stock] is not None and str(r[idx_min_stock]).strip() != ""
        min_stock_val = clean_num(r[idx_min_stock]) if has_min_col else None
        raw_img = cell_str(r, idx_img)
        first_img = raw_img.split(",")[0].strip() if raw_img else ""
        has_active_col = idx_active != -1 and idx_active < len(r) and r[idx_active] is not None and str(r[idx_active]).strip() != ""
        is_active_val = (0 if str(r[idx_active]).strip() in ("0", "false", "False", "Ngừng kinh doanh") else 1) if has_active_col else 1
        supplier_name = cell_str(r, idx_supp)

        try:
            if category_val:
                cur.execute("INSERT OR IGNORE INTO product_categories (name) VALUES (?)", (category_val,))

            existing = None
            if code:
                cur.execute("SELECT id, code, name, category, min_stock, image_url FROM products WHERE code = ?", (code,))
                existing = cur.fetchone()
            else:
                cur.execute("SELECT id, code, name, category, min_stock, image_url FROM products WHERE name = ?", (name,))
                existing = cur.fetchone()

            if existing:
                pid = existing["id"]
                final_cat = category_val or existing["category"] or "Khác"
                final_min = min_stock_val if min_stock_val is not None else (existing["min_stock"] if existing["min_stock"] is not None else 5.0)
                final_img = first_img if first_img else (existing["image_url"] or "")
                cur.execute("""
                    UPDATE products 
                    SET name = ?, unit = ?, type = ?, cost_price = ?, sell_price = ?, category = ?, min_stock = ?, image_url = ?, is_active = ?
                    WHERE id = ?
                """, (name, unit, item_type, cost_price, sell_price, final_cat, final_min, final_img, is_active_val, pid))

                if item_type != "service" and has_stock_col:
                    cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?", (warehouse_id, pid))
                    old_inv = cur.fetchone()
                    old_qty = float(old_inv["quantity"]) if old_inv else 0.0
                    diff_qty = stock_qty - old_qty

                    cur.execute("""
                        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                            quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, pid, stock_qty))
                    
                    cur.execute("""
                        UPDATE products SET stock = (
                            SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = ?
                        ) WHERE id = ?
                    """, (pid, pid))

                    if diff_qty != 0:
                        cur.execute("""
                            INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                            VALUES ('product', ?, ?, 'ADJUST', ?, ?, 'Đồng bộ từ file Excel')
                        """, (pid, warehouse_id, diff_qty, stock_qty))

                updated_count += 1
            else:
                if not code:
                    code = f"SP-{int(time.time() * 1000) % 1000000:06d}"
                cat = category_val or "Khác"
                final_min = min_stock_val if min_stock_val is not None else 5.0
                cur.execute("""
                    INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock, category, min_stock, image_url, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (code, name, item_type, unit, cost_price, sell_price, stock_qty if item_type != "service" else 0, cat, final_min, first_img, is_active_val))
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

    # PASS 2: Dòng đơn vị quy đổi KiotViet -> gộp vào bảng item_units của sản phẩm gốc
    for row_idx, r, base_code, ratio_val in conv_rows:
        name = cell_str(r, idx_name)
        conv_code = cell_str(r, idx_code)
        unit_name = cell_str(r, idx_unit)
        sell_price = clean_num(r[idx_sell]) if idx_sell != -1 and idx_sell < len(r) else 0.0
        if not unit_name:
            continue
        try:
            cur.execute("SELECT id FROM products WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))", (base_code,))
            base_prod = cur.fetchone()
            if not base_prod:
                errors.append(f"Dòng {row_idx} ({name}): Không tìm thấy mã ĐVT cơ bản '{base_code}'")
                continue
            base_pid = base_prod["id"]
            cur.execute("""
                INSERT INTO item_units (item_type, item_id, unit_name, ratio, sell_price, is_default_sale)
                VALUES ('product', ?, ?, ?, ?, 0)
                ON CONFLICT(item_type, item_id, unit_name) DO UPDATE SET
                    ratio = excluded.ratio,
                    sell_price = excluded.sell_price
            """, (base_pid, unit_name, ratio_val, sell_price))
            # Nếu trước đây lỡ import nhầm mã quy đổi thành 1 sản phẩm độc lập chưa có giao dịch thì dọn đi
            if conv_code and conv_code.upper() != base_code.upper():
                cur.execute("SELECT id FROM products WHERE UPPER(TRIM(code)) = UPPER(TRIM(?))", (conv_code,))
                dup_prod = cur.fetchone()
                if dup_prod:
                    dup_id = dup_prod["id"]
                    cur.execute("SELECT COUNT(*) FROM order_items WHERE product_id = ?", (dup_id,))
                    has_orders = cur.fetchone()[0] > 0
                    if not has_orders:
                        cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (dup_id,))
                        cur.execute("DELETE FROM products WHERE id = ?", (dup_id,))
            units_synced += 1
        except Exception as err:
            errors.append(f"Dòng {row_idx} ({name} - {unit_name}): {str(err)}")

    conn.commit()
    conn.close()

    return {
        "success": True,
        "created": created_count,
        "updated": updated_count,
        "units_synced": units_synced,
        "total_processed": created_count + updated_count + units_synced,
        "errors": errors
    }

@router.post("")
def create_product(p: ProductCreate, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        code = (p.code or "").strip() or f"SP-{int(time.time() * 1000)}"
        cost_price = float(p.cost_price) if p.cost_price is not None else 0.0
        cat = p.category or "Khác"
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        min_stock = float(p.min_stock) if p.min_stock is not None else 5.0
        img_url = (p.image_url or "").strip()
        req_bom = p.requires_bom if p.requires_bom is not None else 0
        cur.execute(
            "INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit, category, created_by, min_stock, image_url, requires_bom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (code, p.name, p.type, cost_price, p.sell_price, p.stock, p.unit, cat, user_name, min_stock, img_url, req_bom)
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
                    (s_id, pid, cost_price)
                )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": pid}

@router.put("/{product_id}")
def update_product(product_id: int, p: ProductUpdate, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM products WHERE id = ?", (product_id,))
        existing = cur.fetchone()
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

        code = p.code if p.code else existing["code"]
        name = p.name if p.name is not None else existing["name"]
        prod_type = p.type if p.type is not None else (existing["type"] or "product")
        unit = p.unit if p.unit is not None else (existing["unit"] or "cái")
        sell_price = p.sell_price if p.sell_price is not None else (existing["sell_price"] or 0)
        category = p.category if p.category is not None else (existing["category"] if "category" in existing.keys() else "Khác")
        # Không có quyền xem giá vốn (hoặc không gửi lên) -> giữ nguyên giá vốn cũ, không bị về 0
        cost_price = existing["cost_price"] or 0
        if p.cost_price is not None and can_view_cost(user):
            cost_price = p.cost_price

        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        min_stock = float(p.min_stock) if p.min_stock is not None else (float(existing["min_stock"]) if "min_stock" in existing.keys() and existing["min_stock"] is not None else 5.0)
        image_url = p.image_url if p.image_url is not None else (existing["image_url"] if "image_url" in existing.keys() else "")
        requires_bom = p.requires_bom if p.requires_bom is not None else (existing["requires_bom"] if "requires_bom" in existing.keys() else None)
        cur.execute('''
            UPDATE products 
            SET code = ?, name = ?, type = ?, cost_price = ?, sell_price = ?, unit = ?, category = ?,
                updated_by = ?, updated_at = ?, min_stock = ?, image_url = ?, requires_bom = ?
            WHERE id = ?
        ''', (code, name, prod_type, cost_price, sell_price, unit, category, user_name, now_vn, min_stock, image_url, requires_bom, product_id))

        if p.supplier_ids is not None:
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (product_id,))
            for s_id in p.supplier_ids:
                cur.execute(
                    "INSERT INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (?, 'product', ?, ?)",
                    (s_id, product_id, cost_price)
                )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.post("/{product_id}/toggle-bom-requirement")
def toggle_bom_requirement(product_id: int, requires_bom: int = 1, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM products WHERE id = ?", (product_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")
        cur.execute("UPDATE products SET requires_bom = ? WHERE id = ?", (requires_bom, product_id))
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "product_id": product_id, "requires_bom": requires_bom}

@router.post("/bulk-status")
def bulk_update_product_status(req: ProductBulkStatusIn):
    if not req.product_ids:
        return {"status": "ok", "updated_count": 0}
    conn = get_db()
    cur = conn.cursor()
    try:
        placeholders = ",".join(["?"] * len(req.product_ids))
        cur.execute(f"UPDATE products SET is_active = ? WHERE id IN ({placeholders})", [req.is_active] + req.product_ids)
        affected = cur.rowcount
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    action_text = "tiếp tục kinh doanh" if req.is_active == 1 else "ngừng kinh doanh"
    return {
        "status": "ok",
        "updated_count": affected,
        "message": f"Đã chuyển {affected} sản phẩm sang trạng thái {action_text}."
    }

@router.post("/bulk-delete")
def bulk_delete_products(req: ProductBulkDeleteIn, user=Depends(require_role("owner"))):
    if not req.product_ids:
        return {"status": "ok", "deleted_count": 0, "inactivated_count": 0, "skipped_has_stock": 0}
    conn = get_db()
    cur = conn.cursor()
    deleted_count = 0
    inactivated_count = 0
    skipped_has_stock = 0
    skipped_names = []

    try:
        for pid in req.product_ids:
            cur.execute("SELECT id, name, code, stock FROM products WHERE id = ?", (pid,))
            p = cur.fetchone()
            if not p:
                continue

            # 1. Kiểm tra tồn kho thực tế
            cur.execute("SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = ?", (pid,))
            inv_stock = cur.fetchone()[0]
            total_stock = float(p["stock"] or 0) + float(inv_stock)

            # Nếu còn tồn kho > 0 và không bắt buộc force: Không xóa, cảnh báo người dùng
            if total_stock > 0 and not req.force:
                skipped_has_stock += 1
                skipped_names.append(f"{p['name']} (tồn: {total_stock})")
                continue

            # 2. Kiểm tra xem có giao dịch bán hoặc nhập chưa
            cur.execute("SELECT COUNT(*) FROM order_items WHERE product_id = ?", (pid,))
            order_count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM purchase_items WHERE product_id = ?", (pid,))
            purchase_count = cur.fetchone()[0]

            has_transactions = (order_count > 0 or purchase_count > 0)

            if has_transactions and not req.force:
                # Đã có giao dịch: chỉ chuyển sang ngừng kinh doanh để giữ toàn vẹn kế toán
                cur.execute("UPDATE products SET is_active = 0 WHERE id = ?", (pid,))
                cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (pid,))
                inactivated_count += 1
            else:
                # Chưa từng có giao dịch (hoặc force): xóa vĩnh viễn
                cur.execute("DELETE FROM item_units WHERE item_type = 'product' AND item_id = ?", (pid,))
                cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (pid,))
                cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (pid,))
                cur.execute("DELETE FROM product_bom WHERE product_id = ?", (pid,))
                cur.execute("DELETE FROM inventory_logs WHERE product_id = ?", (pid,))
                cur.execute("DELETE FROM products WHERE id = ?", (pid,))
                deleted_count += 1

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()

    msg_parts = []
    if deleted_count > 0:
        msg_parts.append(f"Đã xóa vĩnh viễn {deleted_count} sản phẩm chưa phát sinh đơn")
    if inactivated_count > 0:
        msg_parts.append(f"Đã chuyển {inactivated_count} sản phẩm có hóa đơn cũ sang Ngừng kinh doanh")
    if skipped_has_stock > 0:
        msg_parts.append(f"Bỏ qua {skipped_has_stock} sản phẩm còn tồn kho")

    return {
        "status": "ok",
        "deleted_count": deleted_count,
        "inactivated_count": inactivated_count,
        "skipped_has_stock": skipped_has_stock,
        "skipped_names": skipped_names,
        "message": "; ".join(msg_parts) if msg_parts else "Không có thay đổi nào."
    }

@router.delete("/{product_id}")
def delete_product(product_id: int, force: bool = False, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name, code FROM products WHERE id = ?", (product_id,))
        p = cur.fetchone()
        if not p:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

        # Kiểm tra xem sản phẩm đã từng phát sinh giao dịch thật chưa
        cur.execute("SELECT COUNT(*) FROM order_items WHERE product_id = ?", (product_id,))
        order_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM purchase_items WHERE product_id = ?", (product_id,))
        purchase_count = cur.fetchone()[0]

        has_transactions = (order_count > 0 or purchase_count > 0)

        # Nếu không có giao dịch (hoặc người dùng yêu cầu force xóa hẳn khi chưa có gd): XÓA VĨNH VIỄN
        if not has_transactions or force:
            # Dọn dẹp các bảng phụ thuộc trước khi xóa sản phẩm
            cur.execute("DELETE FROM item_units WHERE item_type = 'product' AND item_id = ?", (product_id,))
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (product_id,))
            cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (product_id,))
            cur.execute("DELETE FROM product_bom WHERE product_id = ?", (product_id,))
            cur.execute("DELETE FROM inventory_logs WHERE product_id = ?", (product_id,))
            cur.execute("DELETE FROM products WHERE id = ?", (product_id,))
            conn.commit()
            conn.close()
            return {
                "status": "deleted_permanent",
                "message": f"Đã xóa vĩnh viễn sản phẩm '{p['name']}'."
            }

        # Nếu ĐÃ có giao dịch bán/nhập: Soft delete (ẩn sản phẩm để bảo vệ sổ sách kế toán)
        cur.execute("UPDATE products SET is_active = 0 WHERE id = ?", (product_id,))
        cur.execute("DELETE FROM supplier_items WHERE item_type = 'product' AND product_id = ?", (product_id,))
        conn.commit()
        conn.close()
        return {
            "status": "hidden",
            "message": f"Sản phẩm '{p['name']}' đã có lịch sử hóa đơn nên đã được chuyển sang trạng thái ẨN để bảo toàn sổ sách."
        }
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/clear/all-products")
def clear_all_products_api(user=Depends(require_role("owner"))):
    """API xóa sạch toàn bộ hàng hóa để chuẩn bị import lại từ đầu (tự động sao lưu trước khi xóa)"""
    from database import get_db_path
    from backup_service import safe_sqlite_copy
    db_path = get_db_path()
    try:
        backup_dir = os.path.join(os.path.dirname(db_path), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"pos_backup_pre_clear_products_{timestamp}.db"
        backup_filepath = os.path.join(backup_dir, backup_filename)
        if os.path.exists(db_path):
            safe_sqlite_copy(db_path, backup_filepath)
            logger.info(f"Đã tạo bản sao lưu an toàn tại: {backup_filename}")
        else:
            logger.warning(f"DB file không tồn tại tại {db_path}, bỏ qua sao lưu file")
    except Exception as e:
        logger.error(f"Lỗi khi sao lưu trước khi xóa hàng hóa: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể tạo bản sao lưu an toàn trước khi xóa: {e}")

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM order_items")
        order_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM purchase_items")
        purchase_count = cur.fetchone()[0]

        if order_count > 0 or purchase_count > 0:
            # Nếu đã có hóa đơn/phiếu nhập: Ẩn toàn bộ để tránh lỗi Foreign Key và bảo toàn dữ liệu sổ sách
            cur.execute("UPDATE products SET is_active = 0")
            cur.execute("DELETE FROM item_units WHERE item_type = 'product'")
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'product'")
            cur.execute("DELETE FROM product_bom")
            cur.execute("DELETE FROM combo_items")
            cur.execute("DELETE FROM product_price_list")
            cur.execute("DELETE FROM promotion_items")
            cur.execute("DELETE FROM marketplace_sku_mappings")
            conn.commit()
            conn.close()
            return {
                "status": "ok",
                "message": "Đã chuyển toàn bộ hàng hóa sang trạng thái ẨN để bảo vệ dữ liệu hóa đơn/phiếu nhập đã có. Bạn có thể import danh mục mới."
            }

        # Nếu chưa từng có hóa đơn/phiếu nhập: Xóa sạch vĩnh viễn
        cur.execute("DELETE FROM item_units WHERE item_type = 'product'")
        cur.execute("DELETE FROM supplier_items WHERE item_type = 'product'")
        cur.execute("DELETE FROM product_inventory")
        cur.execute("DELETE FROM product_bom")
        cur.execute("DELETE FROM combo_items")
        cur.execute("DELETE FROM product_price_list")
        cur.execute("DELETE FROM promotion_items")
        cur.execute("DELETE FROM marketplace_sku_mappings")
        cur.execute("DELETE FROM inventory_logs WHERE product_id IS NOT NULL")
        cur.execute("DELETE FROM products")
        try:
            cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('products', 'product_inventory', 'item_units')")
        except Exception:
            pass
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": "Đã xóa sạch toàn bộ hàng hóa. Bạn có thể import file mới ngay bây giờ."}

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

@router.post("/{ingredient_id}/convert-to-product")
def convert_ingredient_to_product(ingredient_id: int):
    """
    Chuyển đổi một Nguyên Vật Liệu sang Hàng Hóa (thành phẩm bán):
    - Tạo hoặc kích hoạt bản ghi trong bảng products (type='product', is_active=1)
    - Chuyển tồn kho từ inventory sang product_inventory và products.stock
    - Lấy đơn giá nhập gần nhất làm cost_price và gợi ý sell_price
    - Chuyển liên kết nhà cung cấp (supplier_items) sang item_type='product'
    - Cập nhật định mức BOM: chuyển các BOM cũ đang dùng nguyên liệu này sang dùng product_id nếu cần, hoặc xóa nguyên liệu
    - Đánh dấu nguyên liệu cũ type='SERVICE' hoặc xóa khỏi inventory
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM ingredients WHERE id = ?", (ingredient_id,))
        ing = cur.fetchone()
        if not ing:
            raise HTTPException(status_code=404, detail="Không tìm thấy nguyên liệu")

        cur.execute("SELECT purchase_price FROM price_history WHERE ingredient_id = ? ORDER BY effective_date DESC, id DESC LIMIT 1", (ingredient_id,))
        ph = cur.fetchone()
        cost_price = float(ph["purchase_price"]) if ph and ph["purchase_price"] else 0.0

        # Kiểm tra sản phẩm đã có theo code hoặc name
        cur.execute("SELECT id, type, is_active FROM products WHERE (code = ? AND code IS NOT NULL) OR name = ?", (ing["code"], ing["name"]))
        existing_p = cur.fetchone()

        if existing_p:
            prod_id = existing_p["id"]
            cur.execute("""
                UPDATE products 
                SET type = 'product', is_active = 1, unit = ?, cost_price = COALESCE(NULLIF(cost_price, 0), ?)
                WHERE id = ?
            """, (ing["unit"] or "cái", cost_price, prod_id))
        else:
            p_code = ing["code"] if ing["code"] else f"SP_{ing['id']}"
            cur.execute("""
                INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock, category, is_active)
                VALUES (?, ?, 'product', ?, ?, 0, 0, 'Khác', 1)
            """, (p_code, ing["name"], ing["unit"] or "cái", cost_price))
            prod_id = cur.lastrowid

        # Chuyển tồn kho từ inventory sang product_inventory
        cur.execute("SELECT warehouse_id, quantity FROM inventory WHERE ingredient_id = ?", (ingredient_id,))
        inv_rows = cur.fetchall()
        total_transferred_stock = 0
        for r in inv_rows:
            wh_id = r["warehouse_id"]
            qty = float(r["quantity"] or 0)
            if qty != 0:
                cur.execute("""
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                """, (wh_id, prod_id, qty, qty))
                total_transferred_stock += qty

        # Cập nhật tổng stock vào bảng products
        cur.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (total_transferred_stock, prod_id))

        # Chuyển supplier_items
        cur.execute("""
            UPDATE supplier_items 
            SET item_type = 'product', product_id = ?, ingredient_id = NULL
            WHERE item_type = 'ingredient' AND ingredient_id = ?
        """, (prod_id, ingredient_id))

        # Xóa tồn kho nguyên liệu cũ
        cur.execute("DELETE FROM inventory WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("UPDATE ingredients SET type = 'SERVICE' WHERE id = ?", (ingredient_id,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "message": f"Đã chuyển đổi thành công '{ing['name']}' thành Hàng Hóa!"}

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
# QUY ĐỔI ĐƠN VỊ TÍNH (1 Thùng = 16 Chai) - mỗi mặt hàng một tỉ lệ riêng
# Đơn vị cơ bản không nằm trong item_units: nó là products.unit với ratio = 1
# ========================================================

def _base_unit_info(cur, item_type: str, item_id: int):
    if item_type == "ingredient":
        cur.execute("SELECT unit, 0 as sell_price FROM ingredients WHERE id = ?", (item_id,))
    else:
        cur.execute("SELECT unit, sell_price FROM products WHERE id = ?", (item_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy mặt hàng")
    return row["unit"] or "cái", row["sell_price"] or 0


@router.get("/{item_id}/units")
def list_item_units(item_id: int, item_type: str = "product"):
    """Trả về base unit (ratio=1) + các đơn vị quy đổi đã thiết lập."""
    conn = get_db()
    cur = conn.cursor()
    try:
        base_unit, base_price = _base_unit_info(cur, item_type, item_id)
        cur.execute("""SELECT id, unit_name, ratio, sell_price, is_default_sale FROM item_units
                       WHERE item_type = ? AND item_id = ? ORDER BY ratio""", (item_type, item_id))
        units = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
    return {
        "base": {"unit_name": base_unit, "ratio": 1, "sell_price": base_price, "is_base": True},
        "units": units,
    }


@router.put("/{item_id}/units")
def save_item_units(item_id: int, payload: dict, item_type: str = "product"):
    """Ghi đè toàn bộ danh sách đơn vị quy đổi của 1 mặt hàng.
    payload = {"units": [{"unit_name": "Thùng", "ratio": 16, "sell_price": 0, "is_default_sale": 0}]}"""
    units = payload.get("units") or []
    conn = get_db()
    cur = conn.cursor()
    try:
        base_unit, _ = _base_unit_info(cur, item_type, item_id)
        seen = set()
        cleaned = []
        for u in units:
            name = (u.get("unit_name") or "").strip()
            ratio = clean_num(u.get("ratio"))
            if not name:
                continue
            if ratio <= 0:
                raise HTTPException(status_code=400, detail=f"Hệ số quy đổi của '{name}' phải lớn hơn 0")
            if name.lower() == base_unit.strip().lower():
                raise HTTPException(status_code=400, detail=f"'{name}' đang là đơn vị cơ bản, không cần khai lại")
            if name.lower() in seen:
                raise HTTPException(status_code=400, detail=f"Đơn vị '{name}' bị khai trùng")
            seen.add(name.lower())
            cleaned.append((name, ratio, clean_num(u.get("sell_price")), 1 if u.get("is_default_sale") else 0))

        if sum(c[3] for c in cleaned) > 1:
            raise HTTPException(status_code=400, detail="Chỉ được chọn 1 đơn vị bán mặc định")

        cur.execute("DELETE FROM item_units WHERE item_type = ? AND item_id = ?", (item_type, item_id))
        cur.executemany("""INSERT INTO item_units (item_type, item_id, unit_name, ratio, sell_price, is_default_sale)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        [(item_type, item_id, *c) for c in cleaned])
        conn.commit()
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "count": len(cleaned), "message": f"Đã lưu {len(cleaned)} đơn vị quy đổi"}


# ========================================================
# CRUD CHO NGUYÊN LIỆU (INGREDIENTS) & KHO (WAREHOUSES)
# ========================================================

# --- 1. Warehouses (Kho hàng) ---
