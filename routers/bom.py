from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from typing import Optional, List
import io
import time
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from pydantic import BaseModel
from database import get_db
from schemas import BOMSetRequest, IngredientBOMSetRequest
from logger_config import get_module_logger

logger = get_module_logger("bom")

router = APIRouter(tags=["BOM & Costing"])

class BOMSingleItemUpdate(BaseModel):
    quantity: float

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

    bom_material_cost = 0.0
    for item in bom_items:
        line_cost = round(item["quantity"] * item["latest_cost"], 2)
        item["line_cost"] = line_cost
        bom_material_cost += line_cost

    bom_material_cost = round(bom_material_cost, 2)

    # TỰ ĐỘNG BÓC PHÍ GIA CÔNG XƯỞNG OEM NẾU SẢN PHẨM THUỘC DIỆN OEM
    # 1. Tra cứu đơn đặt gia công OEM gần nhất có sản phẩm này
    cur.execute("""
        SELECT 
            oi.unit_price,
            COALESCE(o.discount_percent, 0) as discount_percent,
            COALESCE(o.vat_percent, 0) as vat_percent,
            c.name as factory_name,
            c.id as factory_id
        FROM oem_order_items oi
        JOIN oem_orders o ON oi.order_id = o.id
        JOIN contacts c ON o.partner_id = c.id
        WHERE oi.product_id = ?
        ORDER BY o.id DESC LIMIT 1
    """, (product_id,))
    oem_row = cur.fetchone()

    oem_processing_cost = 0.0
    oem_factory_name = None
    if oem_row:
        raw_price = oem_row["unit_price"] or 0.0
        disc = (1.0 - (oem_row["discount_percent"] or 0.0) / 100.0)
        vat = (1.0 + (oem_row["vat_percent"] or 0.0) / 100.0)
        oem_processing_cost = round(raw_price * disc * vat, 2)
        oem_factory_name = oem_row["factory_name"]
    else:
        # 2. Nếu chưa có đơn OEM đích danh, kiểm tra xem sản phẩm có gán xưởng trong supplier_items không
        cur.execute("""
            SELECT si.supplier_id, si.default_cost, c.name as factory_name
            FROM supplier_items si
            JOIN contacts c ON si.supplier_id = c.id
            WHERE si.product_id = ? AND si.item_type = 'product'
            ORDER BY si.id DESC LIMIT 1
        """, (product_id,))
        supp_row = cur.fetchone()
        if supp_row:
            oem_factory_name = supp_row["factory_name"]
            if (supp_row["default_cost"] or 0.0) > 0:
                oem_processing_cost = round(float(supp_row["default_cost"]), 2)
            else:
                # Tìm mức phí gia công tiêu chuẩn của xưởng này với cùng nhóm sản phẩm
                cur.execute("""
                    SELECT oi.unit_price, COALESCE(o.discount_percent, 0) as discount_percent, COALESCE(o.vat_percent, 0) as vat_percent
                    FROM oem_order_items oi
                    JOIN oem_orders o ON oi.order_id = o.id
                    JOIN products p ON oi.product_id = p.id
                    WHERE o.partner_id = ? AND p.type = (SELECT type FROM products WHERE id = ?)
                    ORDER BY o.id DESC LIMIT 1
                """, (supp_row["supplier_id"], product_id))
                similar_row = cur.fetchone()
                if similar_row:
                    raw_price = similar_row["unit_price"] or 0.0
                    disc = (1.0 - (similar_row["discount_percent"] or 0.0) / 100.0)
                    vat = (1.0 + (similar_row["vat_percent"] or 0.0) / 100.0)
                    oem_processing_cost = round(raw_price * disc * vat, 2)

    has_bom_or_oem = (len(bom_items) > 0) or (oem_processing_cost > 0)
    if has_bom_or_oem:
        total_cost = round(bom_material_cost + oem_processing_cost, 2)
        cur.execute("UPDATE products SET cost_price = ? WHERE id = ?", (total_cost, product_id))
        conn.commit()
    else:
        total_cost = float(prod["cost_price"] or 0.0)

    return {
        "product_id": product_id,
        "product_name": prod["name"],
        "sell_price": prod["sell_price"],
        "bom_material_cost": bom_material_cost,
        "oem_processing_cost": oem_processing_cost,
        "oem_factory_name": oem_factory_name,
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

@router.get("/api/ingredients/{ingredient_id}/bom")
def get_ingredient_bom(ingredient_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            ib.child_ingredient_id,
            ib.quantity,
            i.code as child_code,
            i.name as child_name,
            i.unit as child_unit,
            i.type as child_type,
            COALESCE((
                SELECT ph.purchase_price 
                FROM price_history ph 
                WHERE ph.ingredient_id = i.id 
                ORDER BY ph.effective_date DESC, ph.id DESC 
                LIMIT 1
            ), 0) as latest_cost
        FROM ingredient_bom ib
        JOIN ingredients i ON ib.child_ingredient_id = i.id
        WHERE ib.parent_ingredient_id = ?
        ORDER BY i.name ASC
    """, (ingredient_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"parent_ingredient_id": ingredient_id, "items": rows}

@router.post("/api/ingredients/{ingredient_id}/bom")
def set_ingredient_bom(ingredient_id: int, req: IngredientBOMSetRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM ingredient_bom WHERE parent_ingredient_id = ?", (ingredient_id,))
        for it in req.items:
            if it.quantity > 0:
                cur.execute(
                    "INSERT INTO ingredient_bom (parent_ingredient_id, child_ingredient_id, quantity) VALUES (?, ?, ?)",
                    (ingredient_id, it.child_ingredient_id, it.quantity)
                )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"success": True, "parent_ingredient_id": ingredient_id}

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

@router.put("/api/products/{product_id}/bom/{ingredient_id}")
def update_single_bom_item(product_id: int, ingredient_id: int, req: BOMSingleItemUpdate):
    conn = get_db()
    cur = conn.cursor()
    try:
        if req.quantity <= 0:
            cur.execute("DELETE FROM product_bom WHERE product_id = ? AND ingredient_id = ?", (product_id, ingredient_id))
        else:
            cur.execute("""
                INSERT INTO product_bom (product_id, ingredient_id, quantity)
                VALUES (?, ?, ?)
                ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity = ?
            """, (product_id, ingredient_id, req.quantity, req.quantity))
        conn.commit()
        result = calculate_product_cost_internal(product_id, conn)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return result

@router.post("/api/products/{product_id}/bom/clone-from/{source_product_id}")
def clone_product_bom(product_id: int, source_product_id: int):
    if product_id == source_product_id:
        raise HTTPException(status_code=400, detail="Không thể sao chép BOM từ chính sản phẩm này!")
    conn = get_db()
    cur = conn.cursor()
    try:
        # Lấy BOM của sản phẩm nguồn
        cur.execute("SELECT ingredient_id, quantity FROM product_bom WHERE product_id = ?", (source_product_id,))
        source_items = cur.fetchall()
        if not source_items:
            raise HTTPException(status_code=400, detail="Sản phẩm nguồn chưa có thành phần BOM nào để sao chép!")
        
        # Xóa BOM cũ của sản phẩm đích
        cur.execute("DELETE FROM product_bom WHERE product_id = ?", (product_id,))
        
        # Insert các thành phần từ nguồn sang đích
        for item in source_items:
            cur.execute(
                "INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, ?)",
                (product_id, item["ingredient_id"], item["quantity"])
            )
        conn.commit()
        result = calculate_product_cost_internal(product_id, conn)
    except HTTPException:
        conn.close()
        raise
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return result

@router.get("/api/bom/export-excel")
@router.get("/api/bom/export")
def export_bom(product_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    
    where_clause = ""
    params = []
    if product_id:
        where_clause = "WHERE pb.product_id = ?"
        params.append(product_id)

    query = f'''
    SELECT 
        p.code as product_code,
        p.name as product_name,
        p.sell_price as product_sell_price,
        p.cost_price as product_cost_price,
        i.code as ingredient_code,
        i.name as ingredient_name,
        i.unit as ingredient_unit,
        pb.quantity as bom_qty,
        COALESCE(
            (SELECT purchase_price FROM price_history ph 
             WHERE ph.ingredient_id = i.id 
             ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
            0
        ) as latest_cost
    FROM product_bom pb
    JOIN products p ON pb.product_id = p.id
    JOIN ingredients i ON pb.ingredient_id = i.id
    {where_clause}
    ORDER BY p.name ASC, i.name ASC
    '''
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dinh_Luong_BOM"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    headers = [
        "STT", "Mã sản phẩm", "Tên thành phẩm", "Giá bán (đ)",
        "Mã nguyên liệu", "Tên nguyên liệu / thành phần", "ĐVT",
        "Định lượng", "Đơn giá vốn NVL (đ)", "Thành tiền (đ)"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for idx, r in enumerate(rows, 1):
        line_cost = round((r["bom_qty"] or 0) * (r["latest_cost"] or 0), 2)
        ws.append([
            idx,
            r["product_code"] or "",
            r["product_name"] or "",
            r["product_sell_price"] or 0,
            r["ingredient_code"] or "",
            r["ingredient_name"] or "",
            r["ingredient_unit"] or "cái",
            r["bom_qty"] or 0,
            r["latest_cost"] or 0,
            line_cost
        ])

    for row_idx in range(2, len(rows) + 2):
        ws.cell(row=row_idx, column=1).alignment = align_center
        ws.cell(row=row_idx, column=2).alignment = align_left
        ws.cell(row=row_idx, column=4).number_format = "#,##0"
        ws.cell(row=row_idx, column=5).alignment = align_left
        ws.cell(row=row_idx, column=7).alignment = align_center
        ws.cell(row=row_idx, column=8).number_format = "#,##0.####"
        ws.cell(row=row_idx, column=9).number_format = "#,##0"
        ws.cell(row=row_idx, column=10).number_format = "#,##0"

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"Dinh_Luong_BOM_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/api/bom/template-excel")
def get_bom_template_excel():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mau_Import_BOM"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    headers = [
        "Mã sản phẩm", "Tên thành phẩm (*bắt buộc)", 
        "Mã nguyên liệu", "Tên nguyên liệu / thành phần (*bắt buộc)",
        "Định lượng tiêu hao (*bắt buộc)"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    sample_rows = [
        ["SP001", "Cà phê sữa đá Bến Tre", "NL001", "Hạt cà phê Robusta rang mộc", 0.025],
        ["SP001", "Cà phê sữa đá Bến Tre", "NL002", "Sữa đặc có đường", 0.04],
        ["SP002", "Trà sữa trân châu", "NL003", "Bột trà đen", 0.02],
        ["SP002", "Trà sữa trân châu", "NL004", "Trân châu đen", 0.05]
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
        headers={"Content-Disposition": 'attachment; filename="Mau_Import_BOM.xlsx"'}
    )

@router.post("/api/bom/import-excel")
@router.post("/api/bom/import")
async def import_bom_excel(file: UploadFile = File(...)):
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
        raise HTTPException(status_code=400, detail="File không có dữ liệu định lượng BOM")

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

    idx_p_code = find_col(["mã sản phẩm", "mã sp", "mã hàng", "product_code"], ["mã sp", "mã sản phẩm", "mã hàng", "product_code"])
    idx_p_name = find_col(["tên thành phẩm", "tên sản phẩm", "tên sp", "thành phẩm", "product_name"], ["tên sp", "tên sản phẩm", "tên thành phẩm", "thành phẩm", "product_name"])
    if idx_p_name == idx_p_code and idx_p_name != -1:
        idx_p_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_p_code and any(pm in h for pm in ["tên", "name"]):
                idx_p_name = idx
                break

    idx_i_code = find_col(["mã nguyên liệu", "mã nvl", "mã vật tư", "ingredient_code"], ["mã nvl", "mã nguyên liệu", "mã vật tư", "ingredient_code"])
    idx_i_name = find_col(["tên nguyên liệu", "tên nvl", "nguyên liệu", "thành phần", "ingredient_name"], ["tên nvl", "tên nguyên liệu", "thành phần", "ingredient_name"])
    if idx_i_name == idx_i_code and idx_i_name != -1:
        idx_i_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_i_code and any(pm in h for pm in ["tên", "name"]):
                idx_i_name = idx
                break

    idx_qty = find_col(["định lượng", "số lượng", "tiêu hao", "quantity", "qty"], ["định lượng", "số lượng", "tiêu hao", "quantity", "qty"])

    if idx_p_name == -1 and idx_p_code == -1:
        raise HTTPException(status_code=400, detail="Không tìm thấy cột Mã hoặc Tên sản phẩm!")
    if idx_i_name == -1 and idx_i_code == -1:
        raise HTTPException(status_code=400, detail="Không tìm thấy cột Mã hoặc Tên nguyên liệu!")
    if idx_qty == -1:
        raise HTTPException(status_code=400, detail="Không tìm thấy cột Định lượng tiêu hao!")

    conn = get_db()
    cur = conn.cursor()

    imported_count = 0
    affected_products = set()
    errors = []

    for row_idx, r in enumerate(rows[1:], start=2):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue

        p_code = str(r[idx_p_code] or "").strip() if idx_p_code != -1 and idx_p_code < len(r) and r[idx_p_code] is not None else ""
        p_name = str(r[idx_p_name] or "").strip() if idx_p_name != -1 and idx_p_name < len(r) and r[idx_p_name] is not None else ""
        i_code = str(r[idx_i_code] or "").strip() if idx_i_code != -1 and idx_i_code < len(r) and r[idx_i_code] is not None else ""
        i_name = str(r[idx_i_name] or "").strip() if idx_i_name != -1 and idx_i_name < len(r) and r[idx_i_name] is not None else ""
        qty = clean_num(r[idx_qty]) if idx_qty != -1 and idx_qty < len(r) else 0.0

        if qty <= 0:
            continue

        try:
            prod_row = None
            if p_code:
                cur.execute("SELECT id, name FROM products WHERE code = ?", (p_code,))
                prod_row = cur.fetchone()
            if not prod_row and p_name:
                cur.execute("SELECT id, name FROM products WHERE name = ?", (p_name,))
                prod_row = cur.fetchone()

            if not prod_row:
                errors.append(f"Dòng {row_idx}: Không tìm thấy sản phẩm '{p_code or p_name}'")
                continue

            prod_id = prod_row["id"]

            ing_row = None
            if i_code:
                cur.execute("SELECT id, name FROM ingredients WHERE code = ?", (i_code,))
                ing_row = cur.fetchone()
            if not ing_row and i_name:
                cur.execute("SELECT id, name FROM ingredients WHERE name = ?", (i_name,))
                ing_row = cur.fetchone()

            if not ing_row:
                errors.append(f"Dòng {row_idx}: Không tìm thấy nguyên liệu '{i_code or i_name}'")
                continue

            ing_id = ing_row["id"]

            cur.execute("""
                INSERT INTO product_bom (product_id, ingredient_id, quantity)
                VALUES (?, ?, ?)
                ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity = ?
            """, (prod_id, ing_id, qty, qty))

            imported_count += 1
            affected_products.add(prod_id)

        except Exception as e:
            errors.append(f"Dòng {row_idx}: {str(e)}")

    conn.commit()

    # Tính toán lại giá cost cho tất cả sản phẩm bị ảnh hưởng
    for pid in affected_products:
        try:
            calculate_product_cost_internal(pid, conn)
        except Exception:
            pass

    conn.close()

    return {
        "success": True,
        "imported": imported_count,
        "products_updated": len(affected_products),
        "errors": errors
    }

@router.post("/api/products/{product_id}/recalculate-cost")
def recalculate_cost(product_id: int):
    conn = get_db()
    result = calculate_product_cost_internal(product_id, conn)
    conn.close()
    return result

