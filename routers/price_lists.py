import io
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from fastapi import APIRouter, HTTPException, Depends, Response, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from database import get_db
from schemas import PriceListCreate, PriceListUpdate, ProductPriceCreate, ProductPriceUpdate, CustomerSegmentCreate, CustomerSegmentUpdate
from logger_config import get_module_logger
from dependencies import require_permission

logger = get_module_logger("price_lists")

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

router = APIRouter(prefix="/api/price-lists", tags=["Price Lists"])

def _is_base_retail_pl(cur, price_list_id: int) -> bool:
    cur.execute("SELECT code FROM price_lists WHERE id = ?", (price_list_id,))
    r = cur.fetchone()
    return bool(r and str(r["code"] or "").strip().upper() == "PL-BANLE")

# ========== PRICE LISTS ==========
@router.get("")
def list_price_lists():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT pl.*,
               CASE
                   WHEN UPPER(TRIM(pl.code)) = 'PL-BANLE' THEN (
                       SELECT COUNT(*) FROM products p WHERE COALESCE(p.is_active, 1) = 1 AND COALESCE(p.type, 'product') != 'material'
                   )
                   ELSE (
                       SELECT COUNT(*) FROM product_price_list ppl WHERE ppl.price_list_id = pl.id
                   )
               END as product_count,
               CASE WHEN UPPER(TRIM(pl.code)) = 'PL-BANLE' THEN 1 ELSE 0 END as is_base_retail
        FROM price_lists pl
        ORDER BY CASE WHEN UPPER(TRIM(pl.code)) = 'PL-BANLE' THEN 0 ELSE 1 END ASC, pl.id ASC
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

@router.get("/compare-matrix")
def get_compare_price_matrix(ids: str = "", search: Optional[str] = None, category: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    pl_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not pl_ids:
        cur.execute("SELECT id FROM price_lists WHERE COALESCE(is_active, 1) = 1 ORDER BY CASE WHEN UPPER(TRIM(code)) = 'PL-BANLE' THEN 0 ELSE 1 END ASC, id ASC")
        pl_ids = [r["id"] for r in cur.fetchall()]

    placeholders = ",".join(["?"] * len(pl_ids)) if pl_ids else "0"
    cur.execute(f"SELECT id, code, name, CASE WHEN UPPER(TRIM(code)) = 'PL-BANLE' THEN 1 ELSE 0 END as is_base_retail FROM price_lists WHERE id IN ({placeholders})", tuple(pl_ids))
    pl_map = {r["id"]: dict(r) for r in cur.fetchall()}
    ordered_pls = [pl_map[i] for i in pl_ids if i in pl_map]

    query = """
        SELECT p.id as product_id, p.code as product_code, p.name as product_name, p.unit,
               COALESCE(p.category, 'Khác') as category,
               COALESCE(p.cost_price, 0) as cost_price,
               COALESCE(p.sell_price, 0) as default_retail_price,
               COALESCE(p.image_url, '') as image_url
        FROM products p
        WHERE COALESCE(p.type, 'product') != 'material' AND COALESCE(p.is_active, 1) = 1
    """
    params = []
    if search:
        query += " AND (p.name LIKE ? OR p.code LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s])
    if category:
        query += " AND COALESCE(p.category, 'Khác') = ?"
        params.append(category)
    query += " ORDER BY p.name ASC"
    cur.execute(query, tuple(params))
    prods = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT product_id, price_list_id, price FROM product_price_list WHERE price_list_id IN ({placeholders})", tuple(pl_ids))
    price_lookup = {}
    for r in cur.fetchall():
        price_lookup.setdefault(r["product_id"], {})[r["price_list_id"]] = r["price"]

    for p in prods:
        p["prices"] = price_lookup.get(p["product_id"], {})

    conn.close()
    return {"price_lists": ordered_pls, "items": prods}

@router.get("/{price_list_id}/matrix")
def get_price_list_matrix(price_list_id: int, search: Optional[str] = None, category: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    is_base = _is_base_retail_pl(cur, price_list_id)
    query = """
        SELECT 
            p.id as product_id, p.code as product_code, p.name as product_name, p.unit,
            COALESCE(p.category, 'Khác') as category,
            COALESCE(p.sell_price, 0) as default_retail_price,
            CASE WHEN ? = 1 THEN COALESCE(p.sell_price, 0) ELSE ppl.price END as custom_price,
            CASE 
                WHEN ? = 1 THEN COALESCE(p.sell_price, 0)
                WHEN ppl.price IS NOT NULL AND ppl.price > 0 THEN ppl.price 
                ELSE COALESCE(p.sell_price, 0) 
            END as effective_price,
            CASE WHEN ? = 1 THEN 1 WHEN (ppl.price IS NOT NULL AND ppl.price > 0) THEN 1 ELSE 0 END as is_custom,
            ? as is_base_retail
        FROM products p
        LEFT JOIN product_price_list ppl ON ppl.product_id = p.id AND ppl.price_list_id = ?
        WHERE COALESCE(p.type, 'product') != 'material' AND COALESCE(p.is_active, 1) = 1
    """
    b_flag = 1 if is_base else 0
    params = [b_flag, b_flag, b_flag, b_flag, price_list_id]
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
    is_base = _is_base_retail_pl(cur, price_list_id)
    query = "SELECT id, sell_price FROM products WHERE COALESCE(type, 'product') != 'material' AND sell_price > 0 AND COALESCE(is_active, 1) = 1"
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
        if is_base:
            cur.execute("UPDATE products SET sell_price = ? WHERE id = ?", (new_price, p['id']))
        else:
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
    if _is_base_retail_pl(cur, price_list_id):
        new_p = float(req.custom_price) if (req.custom_price is not None and req.custom_price >= 0) else 0.0
        cur.execute("UPDATE products SET sell_price = ? WHERE id = ?", (new_p, req.product_id))
        conn.commit()
        conn.close()
        return {"status": "ok"}
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

# ========== EXCEL IMPORT & EXPORT BẢNG GIÁ ==========
@router.get("/{price_list_id}/export-excel")
def export_price_list_excel(price_list_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, code, name FROM price_lists WHERE id = ?", (price_list_id,))
    pl = cur.fetchone()
    if not pl:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")

    cur.execute("""
        SELECT 
            p.id as product_id, p.code as product_code, p.name as product_name, p.unit,
            COALESCE(p.category, 'Khác') as category,
            COALESCE(p.sell_price, 0) as default_retail_price,
            ppl.price as custom_price,
            ppl.min_qty,
            ppl.discount_percent
        FROM products p
        LEFT JOIN product_price_list ppl ON ppl.product_id = p.id AND ppl.price_list_id = ?
        WHERE (p.type = 'product' OR p.type IS NULL) AND COALESCE(p.is_active, 1) = 1
        ORDER BY p.name ASC
    """, (price_list_id,))
    rows = cur.fetchall()
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bang_Gia_SP"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    headers = [
        "Mã sản phẩm", 
        "Tên sản phẩm", 
        "Nhóm hàng", 
        "ĐVT", 
        "Giá bán lẻ mặc định (đ)", 
        "Giá riêng / Giá đại lý (đ)", 
        "Số lượng tối thiểu", 
        "Chiết khấu (%)"
    ]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for r in rows:
        custom_val = r["custom_price"] if r["custom_price"] is not None and r["custom_price"] > 0 else ""
        min_qty_val = r["min_qty"] if r["min_qty"] is not None else 1
        disc_val = r["discount_percent"] if r["discount_percent"] is not None else 0
        ws.append([
            r["product_code"] or "",
            r["product_name"] or "",
            r["category"] or "",
            r["unit"] or "",
            r["default_retail_price"] or 0,
            custom_val,
            min_qty_val,
            disc_val
        ])

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    
    code_clean = (pl["code"] or "PL").replace(" ", "_")
    filename = f"Bang_Gia_{code_clean}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

def _slug_code(text: str, prefix: str = "PL") -> str:
    import unicodedata, re
    raw = str(text or "").replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", raw).encode("ascii", "ignore").decode("ascii").upper()
    for drop in ("BANG GIA", "GIA KHACH", "GIA SI CHO", "GIA SI", "GIA"):
        if s.startswith(drop):
            s = s[len(drop):].strip()
    s = re.sub(r"[^A-Z0-9]+", "-", s).strip("-") or "CUSTOM"
    return f"{prefix}-{s}" if prefix else s

@router.post("/import-excel")
@router.post("/{price_list_id}/import-excel")
async def import_price_list_excel(price_list_id: int = 0, file: UploadFile = File(...), user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()

    content = await file.read()
    if not content:
        conn.close()
        raise HTTPException(status_code=400, detail="File rỗng!")

    rows = []
    filename = file.filename.lower() if file.filename else ""
    if filename.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            sheet = wb.active
            rows = list(sheet.iter_rows(values_only=True))
        except Exception as e:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Không thể đọc file Excel: {str(e)}")

    if len(rows) < 2:
        conn.close()
        raise HTTPException(status_code=400, detail="File không có dữ liệu (yêu cầu tối thiểu 1 dòng tiêu đề và 1 dòng dữ liệu)")

    orig_headers = [str(c or "").strip() for c in rows[0]]
    header_row = [h.lower() for h in orig_headers]

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

    idx_code = find_col(["mã sản phẩm", "mã sp", "mã hàng", "mã", "code", "sku"], ["mã hàng", "mã sản phẩm", "mã sp", "code", "sku"])
    idx_name = find_col(["tên sản phẩm", "tên sp", "tên hàng", "tên hàng hóa", "tên", "name"], ["tên hàng", "tên sản phẩm", "tên", "name"])
    if idx_name == idx_code and idx_name != -1:
        idx_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_code and any(pm in h for pm in ["tên", "name"]):
                idx_name = idx
                break

    if idx_code == -1 and idx_name == -1:
        conn.close()
        raise HTTPException(status_code=400, detail="Không tìm thấy cột 'Mã sản phẩm' hoặc 'Tên sản phẩm' trong file!")

    idx_base_retail = find_col(["bảng giá chung", "giá bán lẻ mặc định (đ)", "giá bán lẻ mặc định", "giá lẻ mặc định"])

    # Nhận diện file Ma trận nhiều bảng giá KiotViet (BangGia_KV): có cột 'bảng giá chung' hoặc >=2 cột bảng giá riêng
    meta_exact = {
        "stt", "mã sản phẩm", "mã sp", "mã hàng", "mã", "code", "sku",
        "tên sản phẩm", "tên sp", "tên hàng", "tên hàng hóa", "tên", "name",
        "đơn vị tính", "đvt", "đơn vị", "unit",
        "nhóm hàng", "nhóm hàng(3 cấp)", "nhóm", "category", "danh mục",
        "tồn kho", "tồn", "số lượng", "stock",
        "giá vốn", "vốn", "cost", "giá nhập cuối", "giá nhập",
        "bảng giá chung", "giá bán lẻ mặc định (đ)", "giá bán lẻ mặc định", "giá lẻ mặc định",
        "số lượng tối thiểu", "số lượng tối thiểu (min)", "min_qty", "sl tối thiểu",
        "chiết khấu", "chiết khấu (%)", "chiết khấu %", "discount", "discount_percent", "% ck",
        "giá riêng / giá đại lý (đ)"
    }
    kv_price_cols = []
    for idx, h_low in enumerate(header_row):
        if idx in (idx_code, idx_name, idx_base_retail) or not h_low or h_low in meta_exact:
            continue
        if any(k in h_low for k in ("bảng giá", "giá khách", "giá sỉ", "giá đại lý", "vip", "diamond", "gold", "titan", "nội bộ")):
            kv_price_cols.append((idx, orig_headers[idx]))

    cur.execute("SELECT id, code, name, sell_price FROM products WHERE COALESCE(is_active, 1) = 1")
    all_prods = cur.fetchall()
    prod_by_code = {str(p["code"]).strip().lower(): p for p in all_prods if p["code"]}
    prod_by_name = {str(p["name"]).strip().lower(): p for p in all_prods if p["name"]}

    # Nhánh 1: File KiotViet đa cột bảng giá (tự tạo Bảng giá + Hạng khách hàng + đồng bộ tất cả cột)
    if kv_price_cols and (idx_base_retail != -1 or len(kv_price_cols) >= 2):
        col_to_pl = {}
        synced_list_names = []
        for idx_col, col_title in kv_price_cols:
            cur.execute("SELECT id, code, name FROM price_lists WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", (col_title,))
            pl_row = cur.fetchone()
            if not pl_row:
                pl_code = _slug_code(col_title, "PL")
                cur.execute("INSERT OR IGNORE INTO price_lists (code, name, description, is_active) VALUES (?, ?, ?, 1)",
                            (pl_code, col_title, f"Đồng bộ từ KiotViet ({col_title})"))
                cur.execute("SELECT id, code, name FROM price_lists WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR code = ?", (col_title, pl_code))
                pl_row = cur.fetchone()
            pl_id = pl_row["id"]
            col_to_pl[idx_col] = pl_id
            synced_list_names.append(col_title)

            # Tự động tạo / liên kết Hạng khách hàng tương ứng
            seg_name = col_title
            for prefix_rm in ("Bảng giá ", "Giá Khách ", "Giá sỉ cho ", "Giá "):
                if seg_name.lower().startswith(prefix_rm.lower()):
                    seg_name = seg_name[len(prefix_rm):].strip()
                    break
            if seg_name:
                seg_name = seg_name[0].upper() + seg_name[1:]
            seg_code = _slug_code(col_title, "")
            cur.execute("SELECT id FROM customer_segments WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR code = ?", (seg_name, seg_code))
            seg_row = cur.fetchone()
            if seg_row:
                cur.execute("UPDATE customer_segments SET price_list_id = ? WHERE id = ?", (pl_id, seg_row["id"]))
            else:
                cur.execute(
                    "INSERT OR IGNORE INTO customer_segments (code, name, discount_percent, priority, price_list_id, min_points, allow_points, is_active) VALUES (?, ?, 0, 10, ?, 0, 1, 1)",
                    (seg_code, seg_name, pl_id)
                )

        # Đảm bảo có Bảng giá chung (PL-BANLE) và gắn với hạng Khách lẻ mặc định (LE)
        cur.execute("INSERT OR IGNORE INTO price_lists (code, name, description, is_active) VALUES ('PL-BANLE', 'Giá Bán Lẻ', 'Bảng giá chung (Giá bán lẻ mặc định)', 1)")
        cur.execute("SELECT id FROM price_lists WHERE code = 'PL-BANLE'")
        banle_pl = cur.fetchone()
        banle_pl_id = banle_pl["id"] if banle_pl else None
        cur.execute("INSERT OR IGNORE INTO customer_segments (code, name, discount_percent, priority, price_list_id, min_points, allow_points, is_active) VALUES ('LE', 'Bán lẻ', 0, 1, ?, 0, 1, 1)", (banle_pl_id,))
        if banle_pl_id:
            cur.execute("UPDATE customer_segments SET price_list_id = ? WHERE code = 'LE'", (banle_pl_id,))

        created_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []

        for row_idx, r in enumerate(rows[1:], start=2):
            if not r or all(c is None or str(c).strip() == "" for c in r):
                continue
            code_val = str(r[idx_code] or "").strip() if idx_code != -1 and idx_code < len(r) and r[idx_code] is not None else ""
            name_val = str(r[idx_name] or "").strip() if idx_name != -1 and idx_name < len(r) and r[idx_name] is not None else ""
            if not code_val and not name_val:
                continue

            # Nếu có Mã hàng thì khớp chính xác theo Mã hàng (không fallback theo tên để tránh dòng ĐVT quy đổi đè giá món gốc)
            p_obj = prod_by_code.get(code_val.lower()) if code_val else prod_by_name.get(name_val.lower())
            if not p_obj:
                skipped_count += 1
                continue

            pid = p_obj["id"]
            base_retail = clean_num(r[idx_base_retail]) if idx_base_retail != -1 and idx_base_retail < len(r) and r[idx_base_retail] is not None else float(p_obj["sell_price"] or 0.0)
            if idx_base_retail != -1 and base_retail > 0 and base_retail != float(p_obj["sell_price"] or 0.0):
                cur.execute("UPDATE products SET sell_price = ? WHERE id = ?", (base_retail, pid))

            for idx_col, pl_id in col_to_pl.items():
                raw_p = r[idx_col] if idx_col < len(r) else None
                if raw_p is None or str(raw_p).strip() == "":
                    continue
                p_val = clean_num(raw_p)
                cur.execute("SELECT id FROM product_price_list WHERE product_id = ? AND price_list_id = ?", (pid, pl_id))
                ex = cur.fetchone()
                # Chỉ lưu vào bảng giá riêng khi p_val > 0 và khác Bảng giá chung
                if p_val <= 0 or (base_retail > 0 and abs(p_val - base_retail) < 0.01):
                    if ex:
                        cur.execute("DELETE FROM product_price_list WHERE id = ?", (ex["id"],))
                        updated_count += 1
                    continue
                if ex:
                    cur.execute("UPDATE product_price_list SET price = ?, min_qty = 1, discount_percent = 0 WHERE id = ?", (p_val, ex["id"]))
                    updated_count += 1
                else:
                    cur.execute("INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent) VALUES (?, ?, ?, 1, 0)", (pid, pl_id, p_val))
                    created_count += 1

        conn.commit()
        conn.close()
        return {
            "success": True,
            "multi_sync": True,
            "synced_lists": synced_list_names,
            "price_list_id": list(col_to_pl.values())[0] if col_to_pl else price_list_id,
            "price_list_name": ", ".join(synced_list_names),
            "created": created_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "errors": errors,
            "total": len(rows) - 1
        }

    # Nhánh 2: File 1 bảng giá đơn lẻ chuẩn của POS
    cur.execute("SELECT id, name FROM price_lists WHERE id = ?", (price_list_id,))
    pl = cur.fetchone()
    if not pl:
        conn.close()
        raise HTTPException(status_code=404, detail="Vui lòng chọn 1 bảng giá hoặc tải lên file Bảng giá tổng hợp KiotViet!")

    idx_price = find_col(
        ["giá riêng / giá đại lý (đ)", "giá riêng", "giá đại lý", "giá sỉ", "giá mới", "giá bảng giá", "giá riêng theo bảng", "giá đại lý (đ)", "giá riêng (đ)"],
        ["đại lý", "giá riêng", "giá sỉ"]
    )
    if idx_price == -1:
        idx_price = find_col(["giá", "giá bán", "đơn giá", "price"], ["giá", "price", "đơn giá"])

    idx_min_qty = find_col(["số lượng tối thiểu", "số lượng tối thiểu (min)", "min_qty", "sl tối thiểu"], ["tối thiểu", "min_qty"])
    idx_discount = find_col(["chiết khấu", "chiết khấu (%)", "chiết khấu %", "discount", "discount_percent", "% ck"], ["chiết khấu", "discount"])

    if idx_price == -1:
        conn.close()
        raise HTTPException(status_code=400, detail="Không tìm thấy cột 'Giá riêng / Giá đại lý' trong file!")

    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []

    for row_idx, r in enumerate(rows[1:], start=2):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue

        code_val = str(r[idx_code] or "").strip() if idx_code != -1 and idx_code < len(r) and r[idx_code] is not None else ""
        name_val = str(r[idx_name] or "").strip() if idx_name != -1 and idx_name < len(r) and r[idx_name] is not None else ""
        raw_price = r[idx_price] if idx_price < len(r) and r[idx_price] is not None else None

        if not code_val and not name_val:
            continue

        if raw_price is None or str(raw_price).strip() == "":
            skipped_count += 1
            continue

        price_val = clean_num(raw_price)
        if price_val < 0:
            errors.append(f"Dòng {row_idx}: Giá không hợp lệ ({raw_price})")
            continue

        pid = None
        if code_val and code_val.lower() in prod_by_code:
            pid = prod_by_code[code_val.lower()]["id"]
        elif not code_val and name_val and name_val.lower() in prod_by_name:
            pid = prod_by_name[name_val.lower()]["id"]

        if not pid:
            err_label = f"mã '{code_val}'" if code_val else f"tên '{name_val}'"
            errors.append(f"Dòng {row_idx}: Không tìm thấy sản phẩm ({err_label}) trong hệ thống")
            continue

        min_qty = 1.0
        if idx_min_qty != -1 and idx_min_qty < len(r) and r[idx_min_qty] is not None:
            mq = clean_num(r[idx_min_qty])
            if mq > 0:
                min_qty = mq

        discount_pct = 0.0
        if idx_discount != -1 and idx_discount < len(r) and r[idx_discount] is not None:
            dp = clean_num(r[idx_discount])
            if dp >= 0:
                discount_pct = dp

        cur.execute("SELECT id FROM product_price_list WHERE product_id = ? AND price_list_id = ?", (pid, price_list_id))
        existing_price = cur.fetchone()

        if price_val == 0:
            if existing_price:
                cur.execute("DELETE FROM product_price_list WHERE id = ?", (existing_price["id"],))
                updated_count += 1
            else:
                skipped_count += 1
            continue

        if existing_price:
            cur.execute("""
                UPDATE product_price_list
                SET price = ?, min_qty = ?, discount_percent = ?
                WHERE id = ?
            """, (price_val, min_qty, discount_pct, existing_price["id"]))
            updated_count += 1
        else:
            cur.execute("""
                INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
                VALUES (?, ?, ?, ?, ?)
            """, (pid, price_list_id, price_val, min_qty, discount_pct))
            created_count += 1

    conn.commit()
    conn.close()

    return {
        "success": True,
        "price_list_id": price_list_id,
        "price_list_name": pl["name"],
        "created": created_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "errors": errors,
        "total": len(rows) - 1
    }

# ========== PRICE LIST SPA ITEMS ==========
from schemas import PriceListSpaItemCreate

@router.get("/{price_list_id}/spa-items")
def list_price_list_spa_items(price_list_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM price_list_spa_items WHERE price_list_id = ? ORDER BY id ASC", (price_list_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/{price_list_id}/spa-items")
def add_price_list_spa_item(price_list_id: int, req: PriceListSpaItemCreate, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM price_lists WHERE id = ?", (price_list_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")

    if req.target_type == "service":
        if not req.service_name:
            conn.close()
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp service_name")
        cur.execute("DELETE FROM price_list_spa_items WHERE price_list_id = ? AND target_type = 'service' AND service_name = ?", (price_list_id, req.service_name))
        cur.execute("""
            INSERT INTO price_list_spa_items (price_list_id, target_type, service_name, discount_percent)
            VALUES (?, 'service', ?, ?)
        """, (price_list_id, req.service_name, req.discount_percent))
    elif req.target_type == "category":
        if not req.spa_category:
            conn.close()
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp spa_category")
        cur.execute("DELETE FROM price_list_spa_items WHERE price_list_id = ? AND target_type = 'category' AND spa_category = ?", (price_list_id, req.spa_category))
        cur.execute("""
            INSERT INTO price_list_spa_items (price_list_id, target_type, spa_category, discount_percent)
            VALUES (?, 'category', ?, ?)
        """, (price_list_id, req.spa_category, req.discount_percent))
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="target_type không hợp lệ")

    item_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": item_id}

@router.delete("/{price_list_id}/spa-items/{item_id}")
def delete_price_list_spa_item(price_list_id: int, item_id: int, user=Depends(require_permission("price_lists.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM price_list_spa_items WHERE id = ? AND price_list_id = ?", (item_id, price_list_id))
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
