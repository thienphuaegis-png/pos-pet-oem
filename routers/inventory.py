from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from typing import Optional
import datetime
import time
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from database import get_db
from schemas import (
    WarehouseCreate, WarehouseUpdate, IngredientCreate, IngredientUpdate,
    InventoryAdjust, TransferCreate, AuditCreate, WriteOffCreate
)
from logger_config import get_module_logger
from dependencies import require_permission, get_optional_user, can_view_cost

logger = get_module_logger("inventory")

router = APIRouter(tags=["Warehouses & Inventory"])

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

@router.get("/api/warehouses")
def list_warehouses():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM warehouses ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/warehouses")
def create_warehouse(w: WarehouseCreate, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    code = w.code or f"WH-{int(time.time() * 1000)}"
    try:
        cur.execute("INSERT INTO warehouses (code, name, address, is_active) VALUES (?, ?, ?, ?)", 
                    (code, w.name, w.address, w.is_active if w.is_active is not None else 1))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code}

@router.put("/api/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, w: WarehouseUpdate, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, code FROM warehouses WHERE id = ?", (warehouse_id,))
        existing = cur.fetchone()
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")

        code = w.code if w.code else existing["code"]
        is_active = w.is_active if w.is_active is not None else 1
        cur.execute(
            "UPDATE warehouses SET code = ?, name = ?, address = ?, is_active = ? WHERE id = ?",
            (code, w.name, w.address, is_active, warehouse_id)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

@router.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: int, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM warehouses WHERE id = ?", (warehouse_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# --- 2. Ingredients (Nguyên liệu / Dịch vụ thành phần) ---
@router.get("/api/ingredients")
def list_ingredients(warehouse_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    
    # Lấy thông tin kèm tồn kho: nếu chọn kho thì chỉ lấy nguyên liệu có trong kho đó; nếu tất cả kho thì lấy số liệu tổng
    if warehouse_id:
        query = '''
        SELECT 
            i.*,
            COALESCE(inv.quantity, 0) AS total_stock,
            COALESCE(
                (SELECT purchase_price FROM price_history ph 
                 WHERE ph.ingredient_id = i.id 
                 ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
                0
            ) AS latest_cost,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names,
            (SELECT GROUP_CONCAT(DISTINCT si.supplier_id) 
             FROM supplier_items si 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_ids
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        WHERE inv.warehouse_id = ?
        ORDER BY i.id DESC
        '''
        cur.execute(query, (warehouse_id,))
    else:
        query = '''
        SELECT 
            i.*,
            COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) AS total_stock,
            COALESCE(
                (SELECT purchase_price FROM price_history ph 
                 WHERE ph.ingredient_id = i.id 
                 ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
                0
            ) AS latest_cost,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names,
            (SELECT GROUP_CONCAT(DISTINCT si.supplier_id) 
             FROM supplier_items si 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_ids
        FROM ingredients i
        ORDER BY i.id DESC
        '''
        cur.execute(query)

    rows = [dict(r) for r in cur.fetchall()]

    # Gắn đơn vị quy đổi để Nhập hàng cho chọn Thùng/Chai
    cur.execute("SELECT item_id, unit_name, ratio, sell_price, is_default_sale FROM item_units WHERE item_type = 'ingredient' ORDER BY ratio")
    ing_units_map = {}
    for u in cur.fetchall():
        ing_units_map.setdefault(u["item_id"], []).append(dict(u))
    for r in rows:
        r["units"] = ing_units_map.get(r["id"], [])

    conn.close()
    return rows

@router.post("/api/ingredients")
def create_ingredient(ing: IngredientCreate, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    code = ing.code or f"NL-{int(time.time() * 1000)}"
    try:
        cur.execute(
            "INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, ?, ?)",
            (code, ing.name, ing.unit, ing.type)
        )
        ing_id = cur.lastrowid

        # Nếu là thành phần vật lý -> tạo tồn kho
        if ing.type == 'IS_PHYSICAL':
            wh_id = ing.warehouse_id or 1
            cur.execute(
                "INSERT OR IGNORE INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (?, ?, ?)",
                (wh_id, ing_id, ing.initial_stock or 0)
            )
            if ing.initial_stock and ing.initial_stock > 0:
                cur.execute(
                    "INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note) VALUES ('ingredient', ?, ?, 'ADJUST', ?, ?, 'Tồn kho ban đầu')",
                    (ing_id, wh_id, ing.initial_stock, ing.initial_stock)
                )

        # Lưu giá nhập ban đầu vào lịch sử nếu có
        if ing.initial_cost > 0:
            cur.execute(
                "INSERT INTO price_history (ingredient_id, purchase_price, note) VALUES (?, ?, ?)",
                (ing_id, ing.initial_cost, "Khởi tạo ban đầu")
            )

        # Gắn nhiều nhà cung cấp nếu có
        if ing.supplier_ids:
            for s_id in ing.supplier_ids:
                cur.execute(
                    "INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, ingredient_id, default_cost) VALUES (?, 'ingredient', ?, ?)",
                    (s_id, ing_id, ing.initial_cost or 0)
                )

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "id": ing_id, "code": code}

@router.get("/api/ingredients/export-excel")
@router.get("/api/ingredients/export")
def export_ingredients(warehouse_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    if warehouse_id:
        query = '''
        SELECT 
            i.id, i.code, i.name, i.unit, i.type,
            COALESCE(inv.quantity, 0) AS stock,
            w.name as warehouse_name,
            COALESCE(
                (SELECT purchase_price FROM price_history ph 
                 WHERE ph.ingredient_id = i.id 
                 ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
                0
            ) AS latest_cost,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        JOIN warehouses w ON w.id = inv.warehouse_id
        WHERE inv.warehouse_id = ?
        ORDER BY i.id DESC
        '''
        cur.execute(query, (warehouse_id,))
    else:
        query = '''
        SELECT 
            i.id, i.code, i.name, i.unit, i.type,
            COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) AS stock,
            'Tất cả kho' as warehouse_name,
            COALESCE(
                (SELECT purchase_price FROM price_history ph 
                 WHERE ph.ingredient_id = i.id 
                 ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1),
                0
            ) AS latest_cost,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
        FROM ingredients i
        ORDER BY i.id DESC
        '''
        cur.execute(query)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Nguyen_Lieu_Ton_Kho"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    headers = [
        "STT", "Mã nguyên liệu", "Tên nguyên liệu", "Phân loại",
        "Đơn vị tính", "Tồn kho", "Giá nhập gần nhất (đ)", "Kho lưu trữ", "Nhà cung cấp"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for idx, r in enumerate(rows, 1):
        type_str = "Dịch vụ" if r["type"] == "SERVICE" else "Vật lý"
        ws.append([
            idx,
            r["code"] or "",
            r["name"] or "",
            type_str,
            r["unit"] or "cái",
            r["stock"] if r["type"] != "SERVICE" else "-",
            r["latest_cost"] or 0,
            r["warehouse_name"] or "Tất cả kho",
            r["supplier_names"] or ""
        ])

    for row_idx in range(2, len(rows) + 2):
        ws.cell(row=row_idx, column=1).alignment = align_center
        ws.cell(row=row_idx, column=2).alignment = align_left
        ws.cell(row=row_idx, column=4).alignment = align_center
        ws.cell(row=row_idx, column=5).alignment = align_center
        if ws.cell(row=row_idx, column=6).value != "-":
            ws.cell(row=row_idx, column=6).number_format = "#,##0.##"
        ws.cell(row=row_idx, column=7).number_format = "#,##0"
        ws.cell(row=row_idx, column=8).alignment = align_left

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"Danh_Sach_Nguyen_Lieu_{time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/api/ingredients/template-excel")
def get_ingredient_template_excel():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mau_Import_Nguyen_Lieu"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    headers = [
        "Mã nguyên liệu (để trống tự sinh)", "Tên nguyên liệu (*bắt buộc)", "Phân loại (Vật lý/Dịch vụ)",
        "Đơn vị tính", "Tồn kho ban đầu", "Giá nhập ban đầu (đ)", "Nhà cung cấp"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    sample_rows = [
        ["NL001", "Hạt cà phê Robusta rang mộc", "Vật lý", "kg", 20, 140000, "NCC Nông sản Bến Tre"],
        ["NL002", "Sữa đặc có đường", "Vật lý", "lon", 50, 18000, "Đại lý Vinamilk"],
        ["DV001", "Công pha chế / sơ chế", "Dịch vụ", "giờ", 0, 30000, ""]
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
        headers={"Content-Disposition": 'attachment; filename="Mau_Import_Nguyen_Lieu.xlsx"'}
    )

@router.post("/api/ingredients/import-excel")
@router.post("/api/ingredients/import")
async def import_ingredients_excel(file: UploadFile = File(...), warehouse_id: int = 1):
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
        raise HTTPException(status_code=400, detail="File không có dữ liệu nguyên liệu (yêu cầu tối thiểu 1 dòng tiêu đề và 1 dòng dữ liệu)")

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

    idx_code = find_col(["mã nguyên liệu", "mã nvl", "mã vật tư", "mã", "code", "sku"], ["mã", "code", "sku"])
    idx_name = find_col(["tên nguyên liệu", "tên nvl", "tên vật tư", "tên hàng", "tên", "name"], ["tên", "name", "nguyên liệu", "vật tư"])
    if idx_name == idx_code and idx_name != -1:
        # Nếu cột trùng nhau do từ khóa bao hàm (ví dụ 'mã nguyên liệu' dính chữ 'nguyên liệu')
        # Tìm lại tên nguyên liệu loại trừ mã
        idx_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_code and any(pm in h for pm in ["tên", "name"]):
                idx_name = idx
                break

    idx_type = find_col(["loại", "type", "phân loại"], ["loại", "type", "phân loại"])
    idx_unit = find_col(["đvt", "đơn vị", "đơn vị tính", "unit"], ["đvt", "đơn vị", "unit"])
    idx_stock = find_col(["tồn kho", "tồn", "số lượng", "stock", "sl"], ["tồn", "số lượng", "stock", "sl"])
    idx_cost = find_col(["giá", "cost", "giá nhập", "vốn"], ["giá", "cost", "giá nhập", "vốn"])
    idx_supp = find_col(["nhà cung cấp", "ncc", "supplier"], ["nhà cung cấp", "ncc", "supplier"])

    if idx_name == -1:
        if len(header_row) >= 2:
            idx_code = 0
            idx_name = 1
        else:
            raise HTTPException(status_code=400, detail="Không tìm thấy cột 'Tên nguyên liệu' trong file!")

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
        raw_type = str(r[idx_type] or "").strip().lower() if idx_type != -1 and idx_type < len(r) and r[idx_type] is not None else ""
        item_type = "SERVICE" if ("dịch vụ" in raw_type or "service" in raw_type) else "IS_PHYSICAL"
        unit = str(r[idx_unit] or "cái").strip() if idx_unit != -1 and idx_unit < len(r) and r[idx_unit] is not None else "cái"
        stock_qty = clean_num(r[idx_stock]) if idx_stock != -1 and idx_stock < len(r) else 0.0
        cost_price = clean_num(r[idx_cost]) if idx_cost != -1 and idx_cost < len(r) else 0.0
        supplier_name = str(r[idx_supp] or "").strip() if idx_supp != -1 and idx_supp < len(r) and r[idx_supp] is not None else ""

        try:
            existing = None
            if code:
                cur.execute("SELECT id, code, name FROM ingredients WHERE code = ?", (code,))
                existing = cur.fetchone()
            if not existing and name:
                cur.execute("SELECT id, code, name FROM ingredients WHERE name = ?", (name,))
                existing = cur.fetchone()

            if existing:
                ing_id = existing["id"]
                cur.execute("""
                    UPDATE ingredients 
                    SET name = ?, unit = ?, type = ?
                    WHERE id = ?
                """, (name, unit, item_type, ing_id))

                if code and not existing["code"]:
                    cur.execute("UPDATE ingredients SET code = ? WHERE id = ?", (code, ing_id))

                if item_type == "IS_PHYSICAL" and stock_qty != 0:
                    cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                            quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                    """, (warehouse_id, ing_id, stock_qty, stock_qty))

                    cur.execute("""
                        INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                        VALUES ('ingredient', ?, ?, 'ADJUST', ?, (SELECT quantity FROM inventory WHERE warehouse_id=? AND ingredient_id=?), 'Nhập từ file Excel')
                    """, (ing_id, warehouse_id, stock_qty, warehouse_id, ing_id))

                if cost_price > 0:
                    cur.execute("INSERT INTO price_history (ingredient_id, purchase_price, note) VALUES (?, ?, 'Nhập từ file Excel')", (ing_id, cost_price))

                updated_count += 1
            else:
                if not code:
                    code = f"NL-{int(time.time() * 1000) % 1000000:06d}"
                cur.execute("""
                    INSERT INTO ingredients (code, name, unit, type)
                    VALUES (?, ?, ?, ?)
                """, (code, name, unit, item_type))
                ing_id = cur.lastrowid

                if item_type == "IS_PHYSICAL":
                    cur.execute("""
                        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    """, (warehouse_id, ing_id, stock_qty))

                    if stock_qty != 0:
                        cur.execute("""
                            INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                            VALUES ('ingredient', ?, ?, 'ADJUST', ?, ?, 'Khởi tạo từ file Excel')
                        """, (ing_id, warehouse_id, stock_qty, stock_qty))

                if cost_price > 0:
                    cur.execute("INSERT INTO price_history (ingredient_id, purchase_price, note) VALUES (?, ?, 'Khởi tạo từ file Excel')", (ing_id, cost_price))

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
                    INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, ingredient_id, default_cost)
                    VALUES (?, 'ingredient', ?, ?)
                """, (supp_id, ing_id, cost_price))

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

@router.put("/api/ingredients/{ingredient_id}")
def update_ingredient(ingredient_id: int, ing: IngredientUpdate, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE ingredients SET name = ?, unit = ?, type = ? WHERE id = ?",
            (ing.name, ing.unit, ing.type, ingredient_id)
        )
        if ing.code:
            cur.execute("UPDATE ingredients SET code = ? WHERE id = ?", (ing.code, ingredient_id))

        if ing.latest_cost is not None and ing.latest_cost > 0:
            cur.execute(
                "INSERT INTO price_history (ingredient_id, purchase_price, note) VALUES (?, ?, 'Cập nhật giá')",
                (ingredient_id, ing.latest_cost)
            )

        if ing.supplier_ids is not None:
            cur.execute("DELETE FROM supplier_items WHERE item_type = 'ingredient' AND ingredient_id = ?", (ingredient_id,))
            cost = ing.latest_cost or 0
            for s_id in ing.supplier_ids:
                cur.execute(
                    "INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, ingredient_id, default_cost) VALUES (?, 'ingredient', ?, ?)",
                    (s_id, ingredient_id, cost)
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

@router.delete("/api/ingredients/{ingredient_id}")
def delete_ingredient(ingredient_id: int, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM inventory WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM price_history WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM product_bom WHERE ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM supplier_items WHERE item_type = 'ingredient' AND ingredient_id = ?", (ingredient_id,))
        cur.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok"}

# --- 3. Inventory & Price History (Tồn kho & Lịch sử giá) ---
@router.get("/api/inventory")
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

@router.post("/api/inventory/adjust")
def adjust_inventory(req: InventoryAdjust, user=Depends(require_permission("inventory.manage"))):
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

@router.get("/api/ingredients/{ingredient_id}/price-history")
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

@router.get("/api/ingredients/{ingredient_id}/logs")
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

@router.get("/api/ingredients/{ingredient_id}/detail")
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

    # Danh sách NCC cung cấp
    cur.execute('''
    SELECT c.id, c.name, c.phone, si.default_cost
    FROM supplier_items si
    JOIN contacts c ON si.supplier_id = c.id
    WHERE si.item_type = 'ingredient' AND si.ingredient_id = ?
    ORDER BY c.name ASC
    ''', (ingredient_id,))
    suppliers = [dict(r) for r in cur.fetchall()]

    conn.close()
    return {
        "ingredient": dict(ing),
        "stocks": stocks,
        "price_history": prices,
        "logs": logs,
        "suppliers": suppliers
    }

# --- 4. Quản lý kho hàng mở rộng (Warehouses Overview, Unified Inventory, Transfers, Audits) ---

@router.get("/api/warehouses/overview")
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

@router.get("/api/inventory/unified")
def get_unified_inventory(warehouse_id: Optional[int] = None, item_type: Optional[str] = None, search: Optional[str] = None, low_stock: Optional[bool] = False, show_hidden: Optional[bool] = False, user=Depends(get_optional_user)):
    show_cost = can_view_cost(user)
    conn = get_db()
    cur = conn.cursor()
    
    params_p = []
    where_p = []
    if not show_hidden:
        where_p.append("COALESCE(p.is_active, 1) = 1")
    else:
        where_p.append("COALESCE(p.is_active, 1) = 0")

    params_i = []
    if show_hidden:
        where_i = ["1 = 0"]
    else:
        where_i = ["i.type = 'IS_PHYSICAL'"]

    if warehouse_id:
        # Chọn kho cụ thể: chỉ hiển thị sản phẩm và nguyên liệu có trong kho này
        params_p.append(warehouse_id)
        prod_sql = f'''
        SELECT 
            'product' as item_type,
            p.id,
            p.code,
            p.name,
            p.unit,
            p.type as sub_type,
            COALESCE(p.category, 'Khác') as category,
            p.cost_price,
            p.sell_price,
            COALESCE(p.is_active, 1) as is_active,
            p.created_by,
            p.updated_by,
            p.updated_at,
            w.id as warehouse_id,
            w.name as warehouse_name,
            pi.quantity as quantity,
            COALESCE(pi.quantity * p.cost_price, 0) as total_value,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'product' AND si.product_id = p.id) as supplier_names
        FROM product_inventory pi
        JOIN products p ON p.id = pi.product_id
        JOIN warehouses w ON w.id = pi.warehouse_id
        WHERE pi.warehouse_id = ? AND {' AND '.join(where_p)}
        '''

        params_i.append(warehouse_id)
        ing_sql = f'''
        SELECT 
            'ingredient' as item_type,
            i.id,
            i.code,
            i.name,
            i.unit,
            i.type as sub_type,
            'Nguyên liệu' as category,
            COALESCE(
                (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
            ) as cost_price,
            0 as sell_price,
            1 as is_active,
            w.id as warehouse_id,
            w.name as warehouse_name,
            inv.quantity as quantity,
            COALESCE(inv.quantity * COALESCE(
                (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
            ), 0) as total_value,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        JOIN warehouses w ON w.id = inv.warehouse_id
        WHERE inv.warehouse_id = ? AND {' AND '.join(where_i)}
        '''
    else:
        # Chọn tất cả kho: Hiển thị số liệu TỔNG hợp nhất của tất cả các kho
        prod_sql = f'''
        SELECT 
            'product' as item_type,
            p.id,
            p.code,
            p.name,
            p.unit,
            p.type as sub_type,
            COALESCE(p.category, 'Khác') as category,
            p.cost_price,
            p.sell_price,
            COALESCE(p.is_active, 1) as is_active,
            p.created_by,
            p.updated_by,
            p.updated_at,
            0 as warehouse_id,
            'Tất cả kho' as warehouse_name,
            COALESCE((SELECT SUM(quantity) FROM product_inventory pi WHERE pi.product_id = p.id), 0) as quantity,
            COALESCE((SELECT SUM(quantity) FROM product_inventory pi WHERE pi.product_id = p.id), 0) * p.cost_price as total_value,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'product' AND si.product_id = p.id) as supplier_names
        FROM products p
        WHERE {' AND '.join(where_p)}
        '''

        ing_sql = f'''
        SELECT 
            'ingredient' as item_type,
            i.id,
            i.code,
            i.name,
            i.unit,
            i.type as sub_type,
            'Nguyên liệu' as category,
            COALESCE(
                (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
            ) as cost_price,
            0 as sell_price,
            1 as is_active,
            0 as warehouse_id,
            'Tất cả kho' as warehouse_name,
            COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) as quantity,
            COALESCE((SELECT SUM(quantity) FROM inventory inv WHERE inv.ingredient_id = i.id), 0) * COALESCE(
                (SELECT purchase_price FROM price_history ph WHERE ph.ingredient_id = i.id ORDER BY ph.effective_date DESC, ph.id DESC LIMIT 1), 0
            ) as total_value,
            (SELECT GROUP_CONCAT(DISTINCT c.name) 
             FROM supplier_items si 
             JOIN contacts c ON si.supplier_id = c.id 
             WHERE si.item_type = 'ingredient' AND si.ingredient_id = i.id) as supplier_names
        FROM ingredients i
        WHERE {' AND '.join(where_i)}
        '''
    
    cur.execute(prod_sql, tuple(params_p))
    prod_rows = [dict(r) for r in cur.fetchall()]
    cur.execute(ing_sql, tuple(params_i))
    ing_rows = [dict(r) for r in cur.fetchall()]
    
    all_rows = prod_rows + ing_rows
    
    filtered = []
    for r in all_rows:
        if item_type and item_type != "all":
            if item_type == "product" and (r["item_type"] != "product" or r["sub_type"] == "service"):
                continue
            elif item_type == "service" and (r["item_type"] != "product" or r["sub_type"] != "service"):
                continue
            elif item_type == "ingredient" and r["item_type"] != "ingredient":
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

    # Gắn danh sách đơn vị quy đổi (ngoài đơn vị cơ bản) cho từng mặt hàng
    cur.execute("SELECT item_type, item_id, unit_name, ratio, sell_price, is_default_sale FROM item_units ORDER BY ratio")
    units_map = {}
    for u in cur.fetchall():
        units_map.setdefault((u["item_type"], u["item_id"]), []).append({
            "unit_name": u["unit_name"], "ratio": u["ratio"],
            "sell_price": u["sell_price"], "is_default_sale": u["is_default_sale"],
        })
    for r in filtered:
        r["units"] = units_map.get((r["item_type"], r["id"]), [])

    # Không có quyền xem giá vốn -> xóa hẳn khỏi payload, không chỉ ẩn ở UI
    if not show_cost:
        for r in filtered:
            r.pop("cost_price", None)
            r.pop("total_value", None)

    conn.close()
    return {
        "items": filtered,
        "total_count": len(filtered),
        "total_quantity": total_qty,
        "total_value": total_val if show_cost else None,
        "can_view_cost": show_cost
    }

@router.post("/api/inventory/transfer")
def create_warehouse_transfer(req: TransferCreate, user=Depends(require_permission("inventory.manage"))):
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
            
        base_code = f"CK{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
        code = base_code
        seq = 1
        while True:
            cur.execute("SELECT 1 FROM warehouse_transfers WHERE code = ?", (code,))
            if not cur.fetchone():
                break
            code = f"{base_code}_{seq}"
            seq += 1

        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        transfer_note = (req.note or "").strip()
        cur.execute('''
        INSERT INTO warehouse_transfers (code, from_warehouse_id, to_warehouse_id, note, created_at)
        VALUES (?, ?, ?, ?, ?)
        ''', (code, req.from_warehouse_id, req.to_warehouse_id, transfer_note, now_vn))
        transfer_id = cur.lastrowid
        
        for it in req.items:
            if it.quantity <= 0:
                continue
            if it.item_type == 'product':
                prod_id = it.product_id or it.item_id
                if not prod_id:
                    continue
                cur.execute("SELECT name, unit FROM products WHERE id = ?", (prod_id,))
                p_row = cur.fetchone()
                item_name = p_row["name"] if p_row else "Sản phẩm"
                unit = p_row["unit"] if p_row else "cái"
                
                # Trừ kho xuất
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.from_warehouse_id, prod_id, -it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (req.from_warehouse_id, prod_id))
                bal_from = cur.fetchone()["quantity"]
                
                # Cộng kho nhận
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.to_warehouse_id, prod_id, it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (req.to_warehouse_id, prod_id))
                bal_to = cur.fetchone()["quantity"]
                
                # Logs
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note, created_at)
                VALUES ('product', ?, ?, 'TRANSFER_OUT', ?, ?, ?, ?)
                ''', (prod_id, req.from_warehouse_id, -it.quantity, bal_from, f"Chuyển đến {to_w['name']} ({code})", now_vn))
                
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note, created_at)
                VALUES ('product', ?, ?, 'TRANSFER_IN', ?, ?, ?, ?)
                ''', (prod_id, req.to_warehouse_id, it.quantity, bal_to, f"Nhận từ {from_w['name']} ({code})", now_vn))
                
                cur.execute('''
                INSERT INTO warehouse_transfer_items (transfer_id, item_type, product_id, item_name, unit, quantity)
                VALUES (?, 'product', ?, ?, ?, ?)
                ''', (transfer_id, prod_id, item_name, unit, it.quantity))
                
            elif it.item_type == 'ingredient':
                ing_id = it.ingredient_id or it.item_id
                if not ing_id:
                    continue
                cur.execute("SELECT name, unit, type FROM ingredients WHERE id = ?", (ing_id,))
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
                ''', (req.from_warehouse_id, ing_id, -it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (req.from_warehouse_id, ing_id))
                bal_from = cur.fetchone()["quantity"]
                
                # Cộng kho nhận
                cur.execute('''
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.to_warehouse_id, ing_id, it.quantity, it.quantity))
                
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (req.to_warehouse_id, ing_id))
                bal_to = cur.fetchone()["quantity"]
                
                # Logs
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note, created_at)
                VALUES ('ingredient', ?, ?, 'TRANSFER_OUT', ?, ?, ?, ?)
                ''', (ing_id, req.from_warehouse_id, -it.quantity, bal_from, f"Chuyển đến {to_w['name']} ({code})", now_vn))
                
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note, created_at)
                VALUES ('ingredient', ?, ?, 'TRANSFER_IN', ?, ?, ?, ?)
                ''', (ing_id, req.to_warehouse_id, it.quantity, bal_to, f"Nhận từ {from_w['name']} ({code})", now_vn))
                
                cur.execute('''
                INSERT INTO warehouse_transfer_items (transfer_id, item_type, ingredient_id, item_name, unit, quantity)
                VALUES (?, 'ingredient', ?, ?, ?, ?)
                ''', (transfer_id, ing_id, item_name, unit, it.quantity))
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code, "transfer_code": code, "id": transfer_id}

@router.get("/api/inventory/transfers")
def list_transfers():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT 
        t.*,
        t.code as transfer_code,
        w1.name as from_warehouse_name,
        w1.address as from_warehouse_address,
        w2.name as to_warehouse_name,
        w2.address as to_warehouse_address,
        (SELECT COUNT(*) FROM warehouse_transfer_items ti WHERE ti.transfer_id = t.id) as item_count,
        (SELECT COUNT(*) FROM warehouse_transfer_items ti WHERE ti.transfer_id = t.id) as items_count
    FROM warehouse_transfers t
    JOIN warehouses w1 ON t.from_warehouse_id = w1.id
    JOIN warehouses w2 ON t.to_warehouse_id = w2.id
    ORDER BY t.created_at DESC, t.id DESC
    ''')
    transfers = [dict(r) for r in cur.fetchall()]
    for t in transfers:
        cur.execute('''
            SELECT ti.*, ti.item_name as name,
                   COALESCE(p.code, ing.code, '') as sku
            FROM warehouse_transfer_items ti
            LEFT JOIN products p ON ti.item_type = 'product' AND ti.product_id = p.id
            LEFT JOIN ingredients ing ON ti.item_type = 'ingredient' AND ti.ingredient_id = ing.id
            WHERE ti.transfer_id = ?
        ''', (t["id"],))
        t["items"] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return transfers

@router.get("/api/inventory/transfers/{transfer_id}")
def get_transfer_detail(transfer_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
    SELECT 
        t.*,
        t.code as transfer_code,
        w1.name as from_warehouse_name,
        w1.address as from_warehouse_address,
        w2.name as to_warehouse_name,
        w2.address as to_warehouse_address,
        (SELECT COUNT(*) FROM warehouse_transfer_items ti WHERE ti.transfer_id = t.id) as items_count
    FROM warehouse_transfers t
    JOIN warehouses w1 ON t.from_warehouse_id = w1.id
    JOIN warehouses w2 ON t.to_warehouse_id = w2.id
    WHERE t.id = ?
    ''', (transfer_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu chuyển kho")
    data = dict(row)
    cur.execute('''
        SELECT ti.*, ti.item_name as name,
               COALESCE(p.code, ing.code, '') as sku
        FROM warehouse_transfer_items ti
        LEFT JOIN products p ON ti.item_type = 'product' AND ti.product_id = p.id
        LEFT JOIN ingredients ing ON ti.item_type = 'ingredient' AND ti.ingredient_id = ing.id
        WHERE ti.transfer_id = ?
    ''', (transfer_id,))
    data["items"] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return data

@router.post("/api/inventory/audit")
def create_stock_audit(req: AuditCreate, user=Depends(require_permission("inventory.manage"))):
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
            actual = it.actual_qty if it.actual_qty is not None else (it.actual_quantity if it.actual_quantity is not None else 0.0)
            sys_qty = it.system_qty if it.system_qty is not None else 0.0
            diff = actual - sys_qty
            p_id = it.product_id or (it.item_id if it.item_type == 'product' else None)
            ing_id = it.ingredient_id or (it.item_id if it.item_type == 'ingredient' else None)

            if it.item_type == 'product' and p_id:
                cur.execute("SELECT name, unit FROM products WHERE id = ?", (p_id,))
                p_row = cur.fetchone()
                item_name = p_row["name"] if p_row else "Sản phẩm"
                unit = p_row["unit"] if p_row else "cái"
                
                # Cập nhật số lượng mới trong product_inventory
                cur.execute('''
                INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                    quantity = ?, updated_at = CURRENT_TIMESTAMP
                ''', (req.warehouse_id, p_id, actual, actual))
                
                # Cập nhật tổng stock trong products
                cur.execute('''
                UPDATE products SET stock = (
                    SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = ?
                ) WHERE id = ?
                ''', (p_id, p_id))
                
                # Ghi log
                cur.execute('''
                INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('product', ?, ?, 'ADJUST', ?, ?, ?)
                ''', (p_id, req.warehouse_id, diff, actual, f"Kiểm kê {code}: {it.note or 'Cân bằng kho'}"))
                
                cur.execute('''
                INSERT INTO stock_audit_items (audit_id, item_type, product_id, item_name, unit, system_qty, actual_qty, diff_qty)
                VALUES (?, 'product', ?, ?, ?, ?, ?, ?)
                ''', (audit_id, p_id, item_name, unit, sys_qty, actual, diff))
                
            elif it.item_type == 'ingredient' and ing_id:
                cur.execute("SELECT name, unit, type FROM ingredients WHERE id = ?", (ing_id,))
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
                ''', (req.warehouse_id, ing_id, actual, actual))
                
                # Ghi log
                cur.execute('''
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                VALUES ('ingredient', ?, ?, 'ADJUST', ?, ?, ?)
                ''', (ing_id, req.warehouse_id, diff, actual, f"Kiểm kê {code}: {it.note or 'Cân bằng kho'}"))
                
                cur.execute('''
                INSERT INTO stock_audit_items (audit_id, item_type, ingredient_id, item_name, unit, system_qty, actual_qty, diff_qty)
                VALUES (?, 'ingredient', ?, ?, ?, ?, ?, ?)
                ''', (audit_id, ing_id, item_name, unit, sys_qty, actual, diff))
                
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "code": code, "audit_code": code, "audit_id": audit_id}

@router.get("/api/inventory/audits")
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

@router.get("/api/inventory/item-logs")
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

# --- 5. Xuất hủy hàng hóa (Hư hỏng / Hết hạn / Mất mát) ---
@router.post("/api/inventory/write-off")
def write_off_items(data: WriteOffCreate, user=Depends(require_permission("inventory.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name FROM warehouses WHERE id = ?", (data.warehouse_id,))
        wh = cur.fetchone()
        if not wh:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy kho hàng")

        processed = []
        for item in data.items:
            qty = float(item.quantity)
            if qty <= 0:
                continue
            
            note = f"Xuất hủy: {item.reason}" if item.reason else "Xuất hủy hàng hóa"
            if data.note:
                note += f" ({data.note})"

            if item.item_type == 'product':
                cur.execute("SELECT quantity FROM product_inventory WHERE warehouse_id = ? AND product_id = ?",
                            (data.warehouse_id, item.item_id))
                row = cur.fetchone()
                current_qty = row["quantity"] if row else 0.0
                new_qty = max(0.0, current_qty - qty)
                
                cur.execute('''
                    INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                        quantity = excluded.quantity,
                        updated_at = CURRENT_TIMESTAMP
                ''', (data.warehouse_id, item.item_id, new_qty))

                cur.execute('''
                    INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES ('product', ?, ?, 'WRITEOFF', ?, ?, ?)
                ''', (item.item_id, data.warehouse_id, -qty, new_qty, note))
                processed.append({"item_type": "product", "id": item.item_id, "written_off": qty, "balance": new_qty})

            else:
                cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?",
                            (data.warehouse_id, item.item_id))
                row = cur.fetchone()
                current_qty = row["quantity"] if row else 0.0
                new_qty = max(0.0, current_qty - qty)

                cur.execute('''
                    INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                        quantity = excluded.quantity,
                        updated_at = CURRENT_TIMESTAMP
                ''', (data.warehouse_id, item.item_id, new_qty))

                cur.execute('''
                    INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, note)
                    VALUES ('ingredient', ?, ?, 'WRITEOFF', ?, ?, ?)
                ''', (item.item_id, data.warehouse_id, -qty, new_qty, note))
                processed.append({"item_type": "ingredient", "id": item.item_id, "written_off": qty, "balance": new_qty})

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return {"status": "ok", "processed": processed}

# ========================================================
# LOGIC BOM & TÍNH TOÁN GIÁ COST THÀNH PHẨM TỰ ĐỘNG
# ========================================================

