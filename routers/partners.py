from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
import io
import re
import datetime
import random
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from database import get_db
from logger_config import get_module_logger
from routers.cashbook import generate_cashbook_code
from dependencies import require_role, require_permission, require_any_permission, resolve_payment_account

logger = get_module_logger("partners")

router = APIRouter(prefix="/api/contacts", tags=["Partners"])

class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    type: str = "customer" # customer | supplier
    segment_id: Optional[int] = None
    debt: Optional[float] = 0.0
    initial_debt_company: Optional[float] = 0.0
    initial_debt_personal: Optional[float] = 0.0

class ContactUpdate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    segment_id: Optional[int] = None
    debt: Optional[float] = None
    initial_debt_company: Optional[float] = None
    initial_debt_personal: Optional[float] = None

class ContactDebtAdjust(BaseModel):
    debt: Optional[float] = None
    initial_debt_company: Optional[float] = None
    initial_debt_personal: Optional[float] = None
    note: Optional[str] = ""

class CustomerWarningUpdate(BaseModel):
    is_flagged: bool = False
    warning_note: Optional[str] = ""

class ContactPayDebt(BaseModel):
    amount: float
    note: Optional[str] = ""
    account_id: Optional[int] = None
    fund_source: Optional[str] = "COMPANY"
    payment_date: Optional[str] = None
    order_id: Optional[int] = None

class PetCreate(BaseModel):
    name: str
    species: Optional[str] = "Chó"
    breed: Optional[str] = ""
    color: Optional[str] = ""
    weight: Optional[float] = 0.0
    note: Optional[str] = ""

class PetUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[str] = None
    breed: Optional[str] = None
    color: Optional[str] = None
    weight: Optional[float] = None
    note: Optional[str] = None

@router.get("")
def list_contacts(type: Optional[str] = None, search: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT c.*, cs.name as segment_name, cs.discount_percent as segment_discount, cs.price_list_id,
               pl.name as price_list_name,
               (SELECT COUNT(*) FROM pets p WHERE p.customer_id = c.id) as pets_count,
               -- Tính nợ công ty thực tế (Đơn PO có thuế + OEM có thuế + nợ cty đầu kỳ)
               (
                   COALESCE(c.initial_debt_company, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate > 0 OR p.vat_amount > 0)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent > 0 OR o.fund_source = 'COMPANY')
                   ), 0)
               ) as calc_debt_company,
               -- Tính nợ cá nhân thực tế (Đơn PO ko thuế + OEM ko thuế + nợ cá nhân đầu kỳ)
               (
                   COALESCE(c.initial_debt_personal, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate = 0 OR p.vat_rate IS NULL) AND (p.vat_amount = 0 OR p.vat_amount IS NULL)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent = 0 OR o.vat_percent IS NULL) AND (o.fund_source != 'COMPANY' OR o.fund_source IS NULL)
                   ), 0)
               ) as calc_debt_personal
        FROM contacts c
        LEFT JOIN customer_segments cs ON cs.id = c.segment_id
        LEFT JOIN price_lists pl ON pl.id = cs.price_list_id
        WHERE 1=1
    """
    params = []
    if type and type != "all":
        query += " AND c.type = ?"
        params.append(type)
    if search:
        query += " AND (c.name LIKE ? OR c.phone LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s])
    query += " ORDER BY c.id DESC"
    cur.execute(query, tuple(params))
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get("type") == "supplier":
            d["debt_company"] = d.get("calc_debt_company", 0.0)
            d["debt_personal"] = d.get("calc_debt_personal", 0.0)
            d["total_debt"] = round(d["debt_company"] + d["debt_personal"], 2)
            d["debt"] = d["total_debt"]
        rows.append(d)
    conn.close()
    return rows

@router.get("/export-excel")
def export_contacts_excel(type: str = "customer"):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT c.*, cs.name as segment_name,
               (SELECT COUNT(*) FROM pets p WHERE p.customer_id = c.id) as pets_count,
               -- Nợ Cty
               (
                   COALESCE(c.initial_debt_company, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate > 0 OR p.vat_amount > 0)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent > 0 OR o.fund_source = 'COMPANY')
                   ), 0)
               ) as calc_debt_company,
               -- Nợ Cá nhân
               (
                   COALESCE(c.initial_debt_personal, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = c.id AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate = 0 OR p.vat_rate IS NULL) AND (p.vat_amount = 0 OR p.vat_amount IS NULL)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = c.id AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent = 0 OR o.vat_percent IS NULL) AND (o.fund_source != 'COMPANY' OR o.fund_source IS NULL)
                   ), 0)
               ) as calc_debt_personal
        FROM contacts c
        LEFT JOIN customer_segments cs ON cs.id = c.segment_id
        WHERE c.type = ?
        ORDER BY c.id DESC
    """
    cur.execute(query, (type,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    label = "Khach_Hang" if type == "customer" else "Nha_Cung_Cap"
    ws.title = label

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    if type == "customer":
        headers = ["STT", "Tên Khách Hàng", "Số Điện Thoại", "Địa Chỉ", "Nhóm Khách Hàng", "Số Thú Cưng", "Công Nợ (đ)"]
    else:
        headers = ["STT", "Tên Nhà Cung Cấp", "Số Điện Thoại", "Địa Chỉ", "Nợ Quỹ Cty (VAT)", "Nợ Quỹ Cá Nhân", "Tổng Nợ Phải Trả (đ)"]

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for idx, r in enumerate(rows, 1):
        if type == "customer":
            ws.append([idx, r["name"] or "", r["phone"] or "", r["address"] or "", r["segment_name"] or "Khách lẻ", r["pets_count"] or 0, r["debt"] or 0])
        else:
            debt_c = r.get("calc_debt_company", 0.0)
            debt_p = r.get("calc_debt_personal", 0.0)
            total_d = round(debt_c + debt_p, 2)
            ws.append([idx, r["name"] or "", r["phone"] or "", r["address"] or "", debt_c, debt_p, total_d])

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"Danh_sach_{label}_{datetime.datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/template-excel")
def download_contacts_template(type: str = "customer"):
    type = (type or "customer").strip().lower()
    wb = openpyxl.Workbook()
    ws = wb.active
    label = "Mau_Khach_Hang" if type == "customer" else "Mau_Nha_Cung_Cap"
    ws.title = label

    header_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    if type == "customer":
        headers = ["Tên Khách Hàng (*)", "Số Điện Thoại", "Địa Chỉ", "Nhóm Khách Hàng", "Công Nợ Ban Đầu (đ)", "Điểm Tích Lũy"]
        samples = [
            ["Nguyễn Văn An", "0901234567", "123 Lê Lợi, Bến Tre", "Khách VIP", 0, 50],
            ["Trần Thị Mai", "0912345678", "456 Nguyễn Huệ, TP.HCM", "Khách lẻ", 150000, 0]
        ]
    else:
        headers = ["Tên Nhà Cung Cấp (*)", "Số Điện Thoại", "Địa Chỉ", "Công Nợ Ban Đầu (đ)", "Nợ Quỹ Công Ty (đ)", "Nợ Quỹ Cá Nhân (đ)"]
        samples = [
            ["Công ty TNHH Thức Ăn Chăn Nuôi", "02838123456", "KCN Tân Bình, TP.HCM", 5000000, 3000000, 2000000],
            ["Hộ Kinh Doanh Phụ Kiện Pet", "0987654321", "Chợ Lớn, Quận 5, TP.HCM", 0, 0, 0]
        ]

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for s in samples:
        ws.append(s)

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"{label}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.post("/import-excel")
async def import_contacts_excel(file: UploadFile = File(...), type: str = "customer"):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File tải lên rỗng!")
    
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = wb.active
        rows = list(sheet.iter_rows(values_only=True))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể đọc file Excel: {str(e)}")

    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="File không có dữ liệu (yêu cầu ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu)")

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

    idx_code = find_col(["mã khách hàng", "mã kh", "mã ncc", "mã đối tác", "mã", "code", "id", "customerid"], ["mã kh", "mã ncc", "mã"])
    idx_name = find_col(
        ["tên khách hàng", "tên khách", "tên ncc", "tên nhà cung cấp", "họ và tên", "họ tên", "tên", "name"],
        ["tên", "name", "khách hàng", "nhà cung cấp"]
    )
    if idx_name == idx_code and idx_name != -1:
        idx_name = -1
        for idx, h in enumerate(header_row):
            if idx != idx_code and any(pm in h for pm in ["tên", "name"]):
                idx_name = idx
                break

    idx_phone = find_col(["số điện thoại", "điện thoại", "sđt", "phone", "hotline", "tel"], ["thoại", "sđt", "phone", "điện thoại"])
    idx_addr = find_col(["địa chỉ", "địa chỉ giao hàng", "address"], ["địa chỉ", "address"])
    idx_group = find_col(["nhóm khách hàng", "nhóm đối tác", "nhóm", "phân loại", "segment", "group", "customergroup"], ["nhóm", "phân loại", "segment", "group"])
    idx_debt_comp = find_col(["nợ quỹ công ty", "nợ cty", "công nợ công ty", "công nợ cty", "nợ công ty ban đầu", "quỹ cty"], ["nợ cty", "nợ công ty", "quỹ cty", "quỹ công ty"])
    idx_debt_pers = find_col(["nợ quỹ cá nhân", "nợ cá nhân", "công nợ cá nhân", "nợ cá nhân ban đầu", "quỹ cá nhân"], ["nợ cá nhân", "quỹ cá nhân"])
    idx_debt = find_col(["công nợ ban đầu", "công nợ", "nợ", "debt", "nợ cũ"], ["công nợ ban đầu", "nợ cũ", "công nợ", "nợ", "debt"])
    if idx_debt != -1 and idx_debt in (idx_debt_comp, idx_debt_pers):
        idx_debt = -1

    idx_points = find_col(["điểm", "điểm tích lũy", "points"], ["điểm", "point"])
    idx_email = find_col(["email", "thư điện tử", "mail"], ["email", "mail"])
    idx_note = find_col(["ghi chú", "note", "notes", "lưu ý"], ["ghi chú", "note"])

    if idx_name == -1:
        idx_name = 0

    conn = get_db()
    cur = conn.cursor()

    # Load nhóm khách hàng để map
    cur.execute("SELECT id, name FROM customer_segments")
    segments_map = {r["name"].strip().lower(): r["id"] for r in cur.fetchall()}

    def clean_phone_number(val) -> str:
        if val is None:
            return ""
        s = str(val).strip()
        if s.endswith(".0"):
            s = s[:-2]
        s = re.sub(r"[\s\.\-\(\)]+", "", s)
        if s.startswith("+84"):
            s = "0" + s[3:]
        elif s.startswith("84") and len(s) >= 11:
            s = "0" + s[2:]
        elif len(s) == 9 and s[0] in "35789":
            s = "0" + s
        return s

    # Load danh sách contacts hiện có của type này để so khớp chính xác Unicode
    cur.execute("SELECT id, name, phone, email, address, debt, segment_id, points, initial_debt_company, initial_debt_personal, code, note FROM contacts WHERE type = ?", (type,))
    existing_list = [dict(r) for r in cur.fetchall()]
    contacts_by_code = {str(c["code"] or "").strip().upper(): c for c in existing_list if c.get("code")}
    contacts_by_phone = {clean_phone_number(c["phone"]): c for c in existing_list if c["phone"]}
    contacts_by_name = {str(c["name"] or "").strip().lower(): c for c in existing_list}

    created = 0
    updated = 0

    for r in rows[1:]:
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        
        name = str(r[idx_name] or "").strip()
        if not name:
            continue

        norm_name = name.lower()
        code = str(r[idx_code] or "").strip() if idx_code != -1 and idx_code < len(r) else ""
        norm_code = code.upper() if code else ""
        phone = clean_phone_number(r[idx_phone] if idx_phone != -1 and idx_phone < len(r) else "")
        address = str(r[idx_addr] or "").strip() if idx_addr != -1 and idx_addr < len(r) else ""
        note = str(r[idx_note] or "").strip() if idx_note != -1 and idx_note < len(r) else ""
        
        segment_id = None
        if type == "customer" and idx_group != -1 and idx_group < len(r):
            group_name = str(r[idx_group] or "").strip().lower()
            segment_id = segments_map.get(group_name)

        debt = 0.0
        if idx_debt != -1 and idx_debt < len(r) and r[idx_debt] is not None:
            try:
                debt = float(str(r[idx_debt]).replace(",", "").strip())
            except Exception:
                debt = 0.0

        debt_comp = 0.0
        if type == "supplier" and idx_debt_comp != -1 and idx_debt_comp < len(r) and r[idx_debt_comp] is not None:
            try:
                debt_comp = float(str(r[idx_debt_comp]).replace(",", "").strip())
            except Exception:
                debt_comp = 0.0

        debt_pers = 0.0
        if type == "supplier" and idx_debt_pers != -1 and idx_debt_pers < len(r) and r[idx_debt_pers] is not None:
            try:
                debt_pers = float(str(r[idx_debt_pers]).replace(",", "").strip())
            except Exception:
                debt_pers = 0.0

        if type == "supplier":
            if debt_comp != 0 or debt_pers != 0:
                debt = debt_comp + debt_pers
            elif debt != 0 and debt_comp == 0 and debt_pers == 0:
                debt_pers = debt

        points = 0
        if idx_points != -1 and idx_points < len(r) and r[idx_points] is not None:
            try:
                points = int(float(r[idx_points]))
            except Exception:
                points = 0

        email = str(r[idx_email] or "").strip() if idx_email != -1 and idx_email < len(r) else ""

        # Kiểm tra trùng khớp 3 tầng (bằng Python Unicode sạch 100%):
        # Tầng 1: So khớp Mã KH/NCC (nếu có mã)
        existing = None
        if norm_code and norm_code in contacts_by_code:
            existing = contacts_by_code[norm_code]
        # Tầng 2: So khớp SĐT chuẩn hóa (nếu có SĐT)
        elif phone and phone in contacts_by_phone:
            existing = contacts_by_phone[phone]
        # Tầng 3: Nếu không có SĐT hoặc chưa khớp SĐT, so khớp theo Tên chuẩn hóa
        elif norm_name in contacts_by_name:
            existing = contacts_by_name[norm_name]

        if existing:
            existing_id = existing["id"]
            new_code = code if code else (existing.get("code") or "")
            new_phone = phone if phone else (existing.get("phone") or "")
            new_email = email if email else (existing.get("email") or "")
            new_address = address if address else (existing.get("address") or "")
            new_note = note if note else (existing.get("note") or "")
            new_debt = float(existing.get("debt") or 0.0) + (debt if debt != 0.0 else 0.0)
            new_debt_comp = float(existing.get("initial_debt_company") or 0.0) + (debt_comp if debt_comp != 0.0 else 0.0)
            new_debt_pers = float(existing.get("initial_debt_personal") or 0.0) + (debt_pers if debt_pers != 0.0 else 0.0)
            new_points = int(existing.get("points") or 0) + (points if points > 0 else 0)

            cur.execute("""
                UPDATE contacts 
                SET name = ?, phone = ?, email = ?, address = ?, segment_id = COALESCE(?, segment_id), 
                    debt = ?, points = ?, initial_debt_company = ?, initial_debt_personal = ?,
                    code = COALESCE(?, code), note = COALESCE(?, note)
                WHERE id = ?
            """, (name, new_phone, new_email, new_address, segment_id, new_debt, new_points, new_debt_comp, new_debt_pers, new_code or None, new_note or None, existing_id))

            existing["name"] = name
            existing["code"] = new_code
            existing["phone"] = new_phone
            existing["email"] = new_email
            existing["address"] = new_address
            existing["note"] = new_note
            existing["debt"] = new_debt
            existing["initial_debt_company"] = new_debt_comp
            existing["initial_debt_personal"] = new_debt_pers
            existing["points"] = new_points
            if new_code:
                contacts_by_code[new_code.upper()] = existing
            if new_phone:
                contacts_by_phone[new_phone] = existing
            contacts_by_name[norm_name] = existing
            updated += 1
        else:
            cur.execute("""
                INSERT INTO contacts (type, name, phone, email, address, segment_id, debt, points, initial_debt_company, initial_debt_personal, code, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (type, name, phone, email, address, segment_id, debt, points, debt_comp, debt_pers, code or None, note or ""))
            new_id = cur.lastrowid
            new_c = {
                "id": new_id,
                "name": name,
                "code": code,
                "phone": phone,
                "email": email,
                "address": address,
                "note": note,
                "segment_id": segment_id,
                "debt": debt,
                "points": points,
                "initial_debt_company": debt_comp,
                "initial_debt_personal": debt_pers
            }
            if code:
                contacts_by_code[code.upper()] = new_c
            if phone:
                contacts_by_phone[phone] = new_c
            contacts_by_name[norm_name] = new_c
            created += 1

    conn.commit()
    conn.close()

    type_label = "khách hàng" if type == "customer" else "nhà cung cấp"
    return {
        "status": "ok",
        "message": f"Import thành công: Đã thêm mới {created} {type_label}, cập nhật {updated} {type_label}."
    }

@router.get("/{contact_id}")
def get_contact(contact_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT c.*, cs.name as segment_name, cs.discount_percent as segment_discount, cs.price_list_id,
               pl.name as price_list_name
        FROM contacts c
        LEFT JOIN customer_segments cs ON cs.id = c.segment_id
        LEFT JOIN price_lists pl ON pl.id = cs.price_list_id
        WHERE c.id = ?
    """, (contact_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    data = dict(row)
    
    if data.get("type") == "supplier":
        cur.execute("""
            SELECT 
               (
                   COALESCE(?, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = ? AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate > 0 OR p.vat_amount > 0)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = ? AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent > 0 OR o.fund_source = 'COMPANY')
                   ), 0)
               ) as calc_debt_company,
               (
                   COALESCE(?, 0) +
                   COALESCE((
                       SELECT SUM(p.debt_amount) FROM purchases p 
                       WHERE p.supplier_id = ? AND p.debt_amount > 0 AND p.status != 'cancelled'
                         AND (p.vat_rate = 0 OR p.vat_rate IS NULL) AND (p.vat_amount = 0 OR p.vat_amount IS NULL)
                   ), 0) +
                   COALESCE((
                       SELECT SUM(o.remaining_payment) FROM oem_orders o 
                       WHERE o.partner_id = ? AND o.remaining_payment > 0 AND o.status != 'CANCELLED'
                         AND (o.vat_percent = 0 OR o.vat_percent IS NULL) AND (o.fund_source != 'COMPANY' OR o.fund_source IS NULL)
                   ), 0)
               ) as calc_debt_personal
        """, (data.get("initial_debt_company") or 0, contact_id, contact_id, data.get("initial_debt_personal") or 0, contact_id, contact_id))
        d_calc = cur.fetchone()
        if d_calc:
            data["debt_company"] = float(d_calc["calc_debt_company"] or 0.0)
            data["debt_personal"] = float(d_calc["calc_debt_personal"] or 0.0)
            data["total_debt"] = round(data["debt_company"] + data["debt_personal"], 2)
            data["debt"] = data["total_debt"]
    
    # Lấy danh sách thú cưng nếu là khách hàng
    if data["type"] == "customer":
        cur.execute("SELECT * FROM pets WHERE customer_id = ? ORDER BY id ASC", (contact_id,))
        data["pets"] = [dict(r) for r in cur.fetchall()]
    else:
        data["pets"] = []
    
    # Lấy lịch sử giao dịch liên quan
    if data["type"] == "customer":
        cur.execute("SELECT code, created_at, total_amount, paid_amount, (total_amount - paid_amount) as debt, note FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    else:
        cur.execute("SELECT code, created_at, total_amount, paid_amount, debt_amount as debt, status, note FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    data["history"] = [dict(r) for r in cur.fetchall()]
    
    # Lấy lịch sử thu/chi quỹ liên quan
    cur.execute("SELECT code, type, category, amount, note, created_at FROM cashbook WHERE contact_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    data["cashbook_history"] = [dict(r) for r in cur.fetchall()]

    # Lấy thông tin ví spa & lịch sử biến động ví
    data["spa_wallet_balance"] = float(data.get("spa_wallet_balance") or 0)
    data["points"] = int(data.get("points") or 0)
    if data["type"] == "customer":
        cur.execute("""
            SELECT t.*, p.name as package_name, o.code as order_code
            FROM spa_wallet_transactions t
            LEFT JOIN topup_packages p ON t.package_id = p.id
            LEFT JOIN orders o ON t.order_id = o.id
            WHERE t.contact_id = ?
            ORDER BY t.created_at DESC, t.id DESC
        """, (contact_id,))
        data["spa_wallet_history"] = [dict(r) for r in cur.fetchall()]
    else:
        data["spa_wallet_history"] = []
    
    conn.close()
    return data

@router.post("")
def create_contact(req: ContactCreate, user=Depends(require_permission("partners.manage"))):
    conn = get_db()
    cur = conn.cursor()
    c_debt = float(req.initial_debt_company or 0.0)
    p_debt = float(req.initial_debt_personal or 0.0)
    init_debt = float(req.debt or 0.0)
    if (c_debt != 0 or p_debt != 0) and init_debt == 0:
        init_debt = c_debt + p_debt
    elif init_debt != 0 and c_debt == 0 and p_debt == 0:
        p_debt = init_debt

    cur.execute("""
        INSERT INTO contacts (type, name, phone, email, address, segment_id, debt, initial_debt_company, initial_debt_personal) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (req.type, req.name.strip(), (req.phone or "").strip(), (req.email or "").strip(), (req.address or "").strip(), req.segment_id, init_debt, c_debt, p_debt))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@router.put("/{contact_id}")
def update_contact(contact_id: int, req: ContactUpdate, user=Depends(require_permission("partners.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, debt, initial_debt_company, initial_debt_personal FROM contacts WHERE id = ?", (contact_id,))
    c_exist = cur.fetchone()
    if not c_exist:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")

    old_c_debt = float(c_exist["initial_debt_company"] or 0.0)
    old_p_debt = float(c_exist["initial_debt_personal"] or 0.0)

    new_c_debt = float(req.initial_debt_company) if req.initial_debt_company is not None else old_c_debt
    new_p_debt = float(req.initial_debt_personal) if req.initial_debt_personal is not None else old_p_debt

    if req.debt is not None:
        new_debt = float(req.debt)
    else:
        new_debt = new_c_debt + new_p_debt

    cur.execute("""
        UPDATE contacts 
        SET name = ?, phone = ?, email = ?, address = ?, segment_id = ?, 
            debt = ?, initial_debt_company = ?, initial_debt_personal = ? 
        WHERE id = ?
    """, (req.name.strip(), (req.phone or "").strip(), (req.email or "").strip(), (req.address or "").strip(), 
          req.segment_id, new_debt, new_c_debt, new_p_debt, contact_id))

    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.put("/{contact_id}/debt")
def adjust_contact_debt(contact_id: int, req: ContactDebtAdjust, user=Depends(require_any_permission("partners.manage", "cashbook.manage", "oem.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, type, debt, initial_debt_company, initial_debt_personal FROM contacts WHERE id = ?", (contact_id,))
    c = cur.fetchone()
    if not c:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    
    old_c_debt = float(c["initial_debt_company"] or 0.0)
    old_p_debt = float(c["initial_debt_personal"] or 0.0)

    new_c_debt = float(req.initial_debt_company) if req.initial_debt_company is not None else old_c_debt
    new_p_debt = float(req.initial_debt_personal) if req.initial_debt_personal is not None else old_p_debt

    if req.debt is not None and req.initial_debt_company is None and req.initial_debt_personal is None:
        new_debt = float(req.debt)
        new_p_debt = new_debt
        new_c_debt = 0.0
    else:
        new_debt = new_c_debt + new_p_debt

    cur.execute("""
        UPDATE contacts 
        SET debt = ?, initial_debt_company = ?, initial_debt_personal = ? 
        WHERE id = ?
    """, (new_debt, new_c_debt, new_p_debt, contact_id))

    conn.commit()
    conn.close()
    return {
        "status": "ok", 
        "new_debt": new_debt, 
        "initial_debt_company": new_c_debt, 
        "initial_debt_personal": new_p_debt
    }

@router.put("/{contact_id}/warning")
def update_contact_warning(contact_id: int, req: CustomerWarningUpdate, user=Depends(require_permission("partners.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM contacts WHERE id = ?", (contact_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
    cur.execute("UPDATE contacts SET is_flagged = ?, warning_note = ? WHERE id = ?",
                (1 if req.is_flagged else 0, (req.warning_note or "").strip(), contact_id))
    conn.commit()
    conn.close()
    return {"status": "ok", "is_flagged": req.is_flagged, "warning_note": req.warning_note}

@router.delete("/{contact_id}")
def delete_contact(contact_id: int, user=Depends(require_role("owner"))):
    if contact_id == 1:
        raise HTTPException(status_code=400, detail="Không được xóa đối tác mặc định")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT debt FROM contacts WHERE id = ?", (contact_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    if row["debt"] > 0:
        conn.close()
        raise HTTPException(status_code=400, detail="Đối tác đang có công nợ, không thể xóa!")
    cur.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.post("/{contact_id}/pay-debt")
def pay_contact_debt(contact_id: int, req: ContactPayDebt, user=Depends(require_permission("partners.manage"))):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền thanh toán phải lớn hơn 0")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, type, name, debt, initial_debt_company, initial_debt_personal FROM contacts WHERE id = ?", (contact_id,))
    c = cur.fetchone()
    if not c:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    
    current_debt = c["debt"]
    new_debt = max(0.0, current_debt - req.amount)
    
    fund_src = (req.fund_source or "COMPANY").upper()
    c_debt = float(c["initial_debt_company"] or 0.0)
    p_debt = float(c["initial_debt_personal"] or 0.0)
    
    acc_id = req.account_id
    if not acc_id:
        cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
        row_acc = cur.fetchone()
        acc_id = row_acc[0] if row_acc else None

    pay_method = "cash"
    if acc_id:
        cur.execute("SELECT account_type FROM payment_accounts WHERE id = ?", (acc_id,))
        acc_row = cur.fetchone()
        if acc_row and acc_row["account_type"] != "cash":
            pay_method = "transfer"

    if c["type"] == "supplier":
        # Cấn trừ giảm nợ trên các đơn nhập hàng chưa thanh toán
        if fund_src == "PERSONAL":
            cur.execute("""
                SELECT id, debt_amount FROM purchases 
                WHERE supplier_id = ? AND debt_amount > 0 AND status != 'cancelled'
                  AND (vat_rate = 0 OR vat_rate IS NULL) AND (vat_amount = 0 OR vat_amount IS NULL)
                ORDER BY id ASC
            """, (contact_id,))
        else:
            cur.execute("""
                SELECT id, debt_amount FROM purchases 
                WHERE supplier_id = ? AND debt_amount > 0 AND status != 'cancelled'
                  AND (vat_rate > 0 OR vat_amount > 0)
                ORDER BY id ASC
            """, (contact_id,))
        po_rows = [dict(r) for r in cur.fetchall()]
        rem_po = req.amount
        for po in po_rows:
            if rem_po <= 0:
                break
            alloc = min(rem_po, float(po["debt_amount"]))
            cur.execute("UPDATE purchases SET debt_amount = debt_amount - ?, paid_amount = paid_amount + ? WHERE id = ?", 
                        (alloc, alloc, po["id"]))
            rem_po -= alloc

        if fund_src == "PERSONAL":
            p_debt = max(0.0, p_debt - req.amount)
        else:
            c_debt = max(0.0, c_debt - req.amount)
        cur.execute("UPDATE contacts SET debt = ?, initial_debt_company = ?, initial_debt_personal = ? WHERE id = ?", 
                    (new_debt, c_debt, p_debt, contact_id))
    else:
        rem_pay = req.amount
        # 1. Cấn trừ đơn chỉ định trước nếu có
        if req.order_id:
            cur.execute("""
                SELECT id, debt_amount, paid_amount 
                FROM orders 
                WHERE id = ? AND customer_id = ? AND debt_amount > 0 AND status != 'cancelled'
            """, (req.order_id, contact_id))
            target_order = cur.fetchone()
            if target_order:
                alloc = min(rem_pay, float(target_order["debt_amount"]))
                cur.execute("""
                    UPDATE orders 
                    SET debt_amount = debt_amount - ?, paid_amount = paid_amount + ? 
                    WHERE id = ?
                """, (alloc, alloc, target_order["id"]))
                cur.execute("""
                    INSERT INTO order_payments (order_id, method, amount, account_id)
                    VALUES (?, ?, ?, ?)
                """, (target_order["id"], pay_method, alloc, acc_id))
                rem_pay -= alloc

        # 2. Nếu còn dư tiền (hoặc không chỉ định đơn), cấn trừ theo thứ tự FIFO
        if rem_pay > 0:
            cur.execute("""
                SELECT id, debt_amount, paid_amount 
                FROM orders 
                WHERE customer_id = ? AND debt_amount > 0 AND status != 'cancelled'
                ORDER BY id ASC
            """, (contact_id,))
            unpaid_orders = [dict(r) for r in cur.fetchall()]
            for ord_row in unpaid_orders:
                if rem_pay <= 0:
                    break
                alloc = min(rem_pay, float(ord_row["debt_amount"]))
                cur.execute("""
                    UPDATE orders 
                    SET debt_amount = debt_amount - ?, paid_amount = paid_amount + ? 
                    WHERE id = ?
                """, (alloc, alloc, ord_row["id"]))
                cur.execute("""
                    INSERT INTO order_payments (order_id, method, amount, account_id)
                    VALUES (?, ?, ?, ?)
                """, (ord_row["id"], pay_method, alloc, acc_id))
                rem_pay -= alloc

        cur.execute("UPDATE contacts SET debt = ? WHERE id = ?", (new_debt, contact_id))
    
    cb_type = "in" if c["type"] == "customer" else "out"
    cb_cat = "Thu nợ khách hàng" if c["type"] == "customer" else "Chi trả nợ NCC"
    ref_type = "order_debt" if (c["type"] == "customer" and req.order_id) else ("contact_debt" if c["type"] == "customer" else "supplier_debt")
    ref_id = req.order_id if (c["type"] == "customer" and req.order_id) else None
    prefix = "PT-CN" if c["type"] == "customer" else "PC-NH"
    cb_code = generate_cashbook_code(cur, prefix)

    user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    note = f"Thanh toán nợ cho {c['name']} (Nợ cũ: {current_debt:,.0f} đ, Thu/Chi: {req.amount:,.0f} đ). {req.note or ''}".strip()
    if req.payment_date:
        cb_created_at = req.payment_date if " " in req.payment_date else f"{req.payment_date} 12:00:00"
        cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, fund_source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (cb_code, cb_type, cb_cat, req.amount, contact_id, ref_type, ref_id, note, acc_id, fund_src, user_name, cb_created_at))
    else:
        cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, fund_source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (cb_code, cb_type, cb_cat, req.amount, contact_id, ref_type, ref_id, note, acc_id, fund_src, user_name))
    conn.commit()
    conn.close()
    return {"status": "ok", "new_debt": new_debt}

@router.get("/{contact_id}/purchase-history")
def get_contact_purchase_history(contact_id: int, date_from: str = None, date_to: str = None, type: str = "all"):
    conn = get_db()
    cur = conn.cursor()
    results = []
    if type in ("all", "orders"):
        q = "SELECT id, code, created_at as date, final_amount as total, status FROM orders WHERE customer_id = ?"
        params = [contact_id]
        if date_from:
            q += " AND date(created_at) >= ?"; params.append(date_from)
        if date_to:
            q += " AND date(created_at) <= ?"; params.append(date_to)
        cur.execute(q, params)
        results += [dict(r, type="order") for r in cur.fetchall()]
    if type in ("all", "services"):
        q = "SELECT id, code, ticket_date as date, price as total, status FROM pet_service_tickets WHERE customer_id = ?"
        params = [contact_id]
        if date_from:
            q += " AND ticket_date >= ?"; params.append(date_from)
        if date_to:
            q += " AND ticket_date <= ?"; params.append(date_to)
        cur.execute(q, params)
        results += [dict(r, type="service") for r in cur.fetchall()]
    conn.close()
    results.sort(key=lambda r: r["date"] or "", reverse=True)
    return results

# ==========================================
# QUẢN LÝ THÚ CƯNG (PETS)
# ==========================================
pets_router = APIRouter(prefix="/api/pets", tags=["Pets"])

@pets_router.get("")
@pets_router.get("/all")
def list_all_pets(q: str = ""):
    conn = get_db()
    cur = conn.cursor()
    sql = """
        SELECT p.*, c.name as customer_name, c.phone as customer_phone
        FROM pets p
        JOIN contacts c ON p.customer_id = c.id
        WHERE 1=1
    """
    params = []
    if q.strip():
        search = f"%{q.strip()}%"
        sql += " AND (p.name LIKE ? OR p.breed LIKE ? OR p.species LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)"
        params.extend([search, search, search, search, search])
    sql += " ORDER BY p.id DESC"
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@pets_router.get("/customer/{contact_id}")
@router.get("/{contact_id}/pets")
def list_customer_pets(contact_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pets WHERE customer_id = ? ORDER BY id ASC", (contact_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@pets_router.post("/customer/{contact_id}")
@router.post("/{contact_id}/pets")
def add_customer_pet(contact_id: int, p: PetCreate):
    if not p.name.strip():
        raise HTTPException(status_code=400, detail="Tên thú cưng không được để trống")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO pets (customer_id, name, species, breed, color, weight, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (contact_id, p.name.strip(), p.species or "Chó", p.breed or "", p.color or "", p.weight or 0, p.note or ""))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@pets_router.put("/{pet_id}")
@router.put("/pets/{pet_id}")
def update_pet(pet_id: int, p: PetUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM pets WHERE id = ?", (pet_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy thú cưng")
    fields = []
    vals = []
    if p.name is not None:
        fields.append("name = ?"); vals.append(p.name.strip())
    if p.species is not None:
        fields.append("species = ?"); vals.append(p.species)
    if p.breed is not None:
        fields.append("breed = ?"); vals.append(p.breed)
    if p.color is not None:
        fields.append("color = ?"); vals.append(p.color)
    if p.weight is not None:
        fields.append("weight = ?"); vals.append(p.weight)
    if p.note is not None:
        fields.append("note = ?"); vals.append(p.note)
    if fields:
        vals.append(pet_id)
        cur.execute(f"UPDATE pets SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()
    conn.close()
    return {"status": "ok"}

@pets_router.delete("/{pet_id}")
@router.delete("/pets/{pet_id}")
def delete_pet(pet_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM pets WHERE id = ?", (pet_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

def datetime_str():
    return datetime.datetime.now().strftime("%y%m%d%H%M%S")

# ==========================================
# QUẢN LÝ DỊCH VỤ & LỊCH HẸN THÚ CƯNG
# ==========================================
class PetServicePricingItem(BaseModel):
    service_name: str
    category: Optional[str] = "Gói Spa"
    min_weight: Optional[float] = 0.0
    max_weight: Optional[float] = 999.0
    price: float

class PetServiceCreate(BaseModel):
    customer_id: int
    pet_id: Optional[int] = None
    pet_name: Optional[str] = ""
    pet_breed: Optional[str] = ""
    pet_gender: Optional[str] = ""
    pet_color: Optional[str] = ""
    service_type: str
    dye_package: Optional[str] = ""
    appointment_time: Optional[str] = ""
    has_transport: Optional[int] = 0
    transport_address: Optional[str] = ""
    price: Optional[float] = 0.0
    status: Optional[str] = "pending"
    note: Optional[str] = ""
    # Các trường mở rộng mới
    weight_at_service: Optional[float] = None
    shaving_feet: Optional[str] = "Không cạo bàn"
    customer_request: Optional[str] = ""
    accessories: Optional[str] = ""
    payment_status: Optional[str] = "unpaid"
    payment_method: Optional[str] = ""
    services_json: Optional[str] = "[]"
    # Mở rộng chuyên sâu bảng Spa
    call_status: Optional[str] = "Chưa gọi"
    received_time: Optional[str] = ""
    arrival_method: Optional[str] = "Khách chở tới"
    checkout_time: Optional[str] = ""
    return_method: Optional[str] = "Khách đón"
    staff_receiver: Optional[str] = ""
    staff_worker_1: Optional[str] = ""
    staff_worker_2: Optional[str] = ""
    staff_cutter: Optional[str] = ""
    staff_dyer: Optional[str] = ""
    surcharge: Optional[float] = 0.0
    art_cutting_fee: Optional[float] = 0.0
    teeth_cleaning: Optional[float] = 0.0
    shipping_fee: Optional[float] = 0.0
    tip_amount: Optional[float] = 0.0
    deposit_amount: Optional[float] = 0.0
    spa_wallet_deduction: Optional[float] = 0.0
    send_to_hotel: Optional[int] = 0
    batch_code: Optional[str] = ""
    ticket_date: Optional[str] = None
    account_id: Optional[int] = None          # tài khoản nhận tiền (chuyển khoản / thẻ)
    deposit_account_id: Optional[int] = None  # tài khoản nhận tiền cọc
    deposit_method: Optional[str] = "cash"    # hình thức nhận cọc: cash|transfer|card
    # Khi trả bằng Ví Spa: hình thức thu phần còn lại (hàng hóa/tip/ví thiếu) — cash|transfer|card
    remainder_method: Optional[str] = "cash"

class PetServiceBatchCreate(BaseModel):
    customer_id: int
    batch_code: Optional[str] = ""
    account_id: Optional[int] = None
    remainder_method: Optional[str] = "cash"
    start_ticket_number: Optional[int] = None  # số phiếu đầu đợt mà màn hình đã hiển thị cho thu ngân
    tickets: List[PetServiceCreate]

class PetServiceStatusUpdate(BaseModel):
    status: str
    checkout_time: Optional[str] = None

class PetServiceCallStatusUpdate(BaseModel):
    call_status: str

class PetServiceProgressUpdate(BaseModel):
    staff_receiver: Optional[str] = ""
    staff_worker_1: Optional[str] = ""
    staff_worker_2: Optional[str] = ""
    staff_cutter: Optional[str] = ""
    staff_dyer: Optional[str] = ""
    teeth_cleaning: Optional[float] = 0
    art_cutting_fee: Optional[float] = 0
    surcharge: Optional[float] = 0
    shipping_fee: Optional[float] = 0
    tip_amount: Optional[float] = 0
    deposit_amount: Optional[float] = 0
    arrival_method: Optional[str] = ""
    return_method: Optional[str] = ""
    checkout_time: Optional[str] = ""
    note: Optional[str] = ""
    price: Optional[float] = None

class PetServiceTicketBulkItem(BaseModel):
    id: int
    account_id: Optional[int] = None
    remainder_method: Optional[str] = None
    status: Optional[str] = None
    staff_cutter: Optional[str] = None
    staff_worker_1: Optional[str] = None
    staff_worker_2: Optional[str] = None
    staff_dyer: Optional[str] = None
    staff_receiver: Optional[str] = None
    weight_at_service: Optional[float] = None
    service_type: Optional[str] = None
    dye_package: Optional[str] = None
    shaving_feet: Optional[str] = None
    accessories: Optional[str] = None
    send_to_hotel: Optional[int] = None
    surcharge: Optional[float] = None
    teeth_cleaning: Optional[float] = None
    art_cutting_fee: Optional[float] = None
    shipping_fee: Optional[float] = None
    tip_amount: Optional[float] = None
    deposit_amount: Optional[float] = None
    price: Optional[float] = None
    original_service_type: Optional[str] = None
    original_price: Optional[float] = None
    service_change_reason: Optional[str] = None
    service_changed_at: Optional[str] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    note: Optional[str] = None
    customer_request: Optional[str] = None
    received_time: Optional[str] = None
    checkout_time: Optional[str] = None

class PetServiceTicketBulkUpdate(BaseModel):
    tickets: List[PetServiceTicketBulkItem]

class PetServicePayRequest(BaseModel):
    payment_method: str = "cash"
    account_id: Optional[int] = None
    note: Optional[str] = None
    # Khi payment_method = 'wallet': hình thức thu phần còn lại (hàng hóa/tip/ví thiếu)
    remainder_method: Optional[str] = "cash"

class SpaStaffCreate(BaseModel):
    staff_code: Optional[str] = ""
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "Thợ Spa"
    is_active: Optional[int] = 1

class GroomingGalleryItem(BaseModel):
    title: str
    breed: Optional[str] = ""
    description: Optional[str] = ""
    image_data: Optional[str] = ""

service_router = APIRouter(prefix="/api/pet-services", tags=["PetServices"])

@service_router.get("/staff")
def list_spa_staff():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM spa_staff WHERE is_active = 1 ORDER BY staff_code, id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.post("/staff")
def create_spa_staff(s: SpaStaffCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO spa_staff (staff_code, name, phone, role, is_active) VALUES (?, ?, ?, ?, ?)",
                (s.staff_code or "", s.name.strip(), s.phone or "", s.role or "Thợ Spa", s.is_active if s.is_active is not None else 1))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@service_router.put("/staff/{staff_id}")
def update_spa_staff(staff_id: int, s: SpaStaffCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE spa_staff SET staff_code = ?, name = ?, phone = ?, role = ?, is_active = ? WHERE id = ?",
                (s.staff_code or "", s.name.strip(), s.phone or "", s.role or "Thợ Spa", s.is_active if s.is_active is not None else 1, staff_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.delete("/staff/{staff_id}")
def delete_spa_staff(staff_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE spa_staff SET is_active = 0 WHERE id = ?", (staff_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.get("/pricing")
def list_pet_service_pricing():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM pet_service_pricing ORDER BY category, service_name, min_weight")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.post("/pricing")
def create_pet_service_pricing(item: PetServicePricingItem):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
        VALUES (?, ?, ?, ?, ?)
    """, (item.service_name.strip(), item.category.strip(), item.min_weight or 0.0, item.max_weight or 999.0, item.price))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@service_router.put("/pricing/{pricing_id}")
def update_pet_service_pricing(pricing_id: int, item: PetServicePricingItem):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE pet_service_pricing
        SET service_name = ?, category = ?, min_weight = ?, max_weight = ?, price = ?
        WHERE id = ?
    """, (item.service_name.strip(), item.category.strip(), item.min_weight or 0.0, item.max_weight or 999.0, item.price, pricing_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.delete("/pricing/{pricing_id}")
def delete_pet_service_pricing(pricing_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM pet_service_pricing WHERE id = ?", (pricing_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.get("/gallery")
def list_grooming_gallery(breed: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS grooming_gallery (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            breed TEXT DEFAULT '',
            description TEXT DEFAULT '',
            image_data TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    if breed:
        cur.execute("SELECT * FROM grooming_gallery WHERE breed LIKE ? ORDER BY id DESC", (f"%{breed}%",))
    else:
        cur.execute("SELECT * FROM grooming_gallery ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.post("/gallery")
def create_grooming_gallery_item(item: GroomingGalleryItem):
    if not item.title.strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập tên mẫu cắt")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS grooming_gallery (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            breed TEXT DEFAULT '',
            description TEXT DEFAULT '',
            image_data TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        INSERT INTO grooming_gallery (title, breed, description, image_data)
        VALUES (?, ?, ?, ?)
    """, (item.title.strip(), item.breed or "", item.description or "", item.image_data or ""))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id, "title": item.title}

@service_router.delete("/gallery/{item_id}")
def delete_grooming_gallery_item(item_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM grooming_gallery WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.get("/kpi")
def get_pet_services_kpi():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM pets")
    total_pets = cur.fetchone()["cnt"]

    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    cur.execute("SELECT COUNT(*) as cnt FROM pet_service_tickets WHERE ticket_date = ? OR appointment_time LIKE ?", (today_str, f"{today_str}%"))
    app_today = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) as cnt FROM pet_service_tickets WHERE status = 'in_progress'")
    in_progress = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) as cnt FROM pet_service_tickets WHERE has_transport = 1 AND status != 'completed'")
    transport = cur.fetchone()["cnt"]

    cur.execute("""
        SELECT COUNT(*) as cnt FROM pet_service_tickets 
        WHERE status = 'completed' AND (call_status = 'Chưa gọi' OR call_status IS NULL OR call_status = '')
        AND (ticket_date = ? OR appointment_time LIKE ?)
    """, (today_str, f"{today_str}%"))
    uncalled = cur.fetchone()["cnt"]

    cur.execute("""
        SELECT COUNT(*) as cnt FROM pet_service_tickets 
        WHERE status != 'checked_out'
        AND (ticket_date = ? OR appointment_time LIKE ?)
    """, (today_str, f"{today_str}%"))
    not_checked_out = cur.fetchone()["cnt"]

    cur.execute("""
        SELECT COUNT(*) as cnt FROM pet_service_tickets 
        WHERE status = 'checked_out'
        AND (ticket_date = ? OR appointment_time LIKE ?)
    """, (today_str, f"{today_str}%"))
    checked_out = cur.fetchone()["cnt"]

    conn.close()
    return {
        "total_pets": total_pets,
        "appointments_today": app_today,
        "in_progress": in_progress,
        "transport": transport,
        "uncalled": uncalled,
        "not_checked_out": not_checked_out,
        "checked_out": checked_out
    }

@service_router.get("/pets/{pet_id}/history")
def get_pet_service_history(pet_id: int, limit: int = 10):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, code, ticket_date, service_type, price, status, dye_package
        FROM pet_service_tickets
        WHERE pet_id = ?
        ORDER BY ticket_date DESC, id DESC
        LIMIT ?
    """, (pet_id, limit))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.get("")
def list_pet_services(status: str = "all", q: str = ""):
    conn = get_db()
    cur = conn.cursor()
    sql = """
        SELECT s.*, c.name as customer_name, c.phone as customer_phone,
               p.name as pet_name, p.species as pet_species, p.breed as pet_breed
        FROM pet_service_tickets s
        JOIN contacts c ON s.customer_id = c.id
        LEFT JOIN pets p ON s.pet_id = p.id
        WHERE 1=1
    """
    params = []
    if status and status != "all":
        sql += " AND s.status = ?"
        params.append(status)
    if q.strip():
        search = f"%{q.strip()}%"
        sql += " AND (s.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.name LIKE ? OR s.service_type LIKE ?)"
        params.extend([search, search, search, search, search])
    sql += " ORDER BY s.id DESC"
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.get("/{id_or_code}")
def get_single_pet_service(id_or_code: str):
    conn = get_db()
    cur = conn.cursor()
    sql = """
        SELECT s.*, c.name as customer_name, c.phone as customer_phone,
               p.name as pet_name, p.species as pet_species, p.breed as pet_breed
        FROM pet_service_tickets s
        JOIN contacts c ON s.customer_id = c.id
        LEFT JOIN pets p ON s.pet_id = p.id
        WHERE s.id = ? OR s.code = ?
    """
    param_id = int(id_or_code) if id_or_code.isdigit() else -1
    cur.execute(sql, (param_id, id_or_code))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu dịch vụ")
    return dict(row)

def deduct_retail_products_stock(cur, items: list, ticket_code: str, warehouse_id: int = 1):
    if not items:
        return
    for it in items:
        if not it.get("is_retail"):
            continue
        prod_id = it.get("product_id")
        if not prod_id and it.get("name"):
            cur.execute("SELECT id FROM products WHERE name = ? LIMIT 1", (it.get("name"),))
            r = cur.fetchone()
            if r:
                prod_id = r["id"]
        if not prod_id:
            continue
        qty = float(it.get("quantity") or 1)
        cur.execute("SELECT id, type, stock FROM products WHERE id = ?", (prod_id,))
        p_row = cur.fetchone()
        if not p_row or p_row["type"] == "service":
            continue

        cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (qty, prod_id))
        cur.execute("""
            INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        """, (warehouse_id, prod_id, -qty, qty))

        cur.execute("SELECT stock FROM products WHERE id = ?", (prod_id,))
        p_bal = cur.fetchone()
        p_balance = p_bal["stock"] if p_bal else 0
        cur.execute("""
            INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity, balance_after, order_code, note)
            VALUES ('product', ?, ?, 'SALE', ?, ?, ?, ?)
        """, (prod_id, warehouse_id, -qty, p_balance, ticket_code, f"Bán kèm phiếu Spa {ticket_code}"))

        cur.execute("""
            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
            FROM product_bom b
            JOIN ingredients i ON b.ingredient_id = i.id
            WHERE b.product_id = ?
        """, (prod_id,))
        bom_rows = cur.fetchall()
        for bom in bom_rows:
            if bom["ingredient_type"] == "SERVICE":
                continue
            consumed = bom["quantity"] * qty
            cur.execute("""
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
            """, (warehouse_id, bom["ingredient_id"], -consumed, consumed))
            cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
            bal_row = cur.fetchone()
            balance_after = bal_row["quantity"] if bal_row else 0
            cur.execute("""
                INSERT INTO inventory_logs (item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, order_code, note)
                VALUES ('ingredient', ?, ?, 'SALE', ?, ?, ?, ?)
            """, (bom["ingredient_id"], warehouse_id, -consumed, balance_after, ticket_code, f"Bán kèm phiếu Spa {ticket_code}"))

def restore_retail_products_stock(cur, items: list, ticket_code: str, warehouse_id: int = 1):
    if not items:
        return
    for it in items:
        if not it.get("is_retail"):
            continue
        prod_id = it.get("product_id")
        if not prod_id and it.get("name"):
            cur.execute("SELECT id FROM products WHERE name = ? LIMIT 1", (it.get("name"),))
            r = cur.fetchone()
            if r:
                prod_id = r["id"]
        if not prod_id:
            continue
        qty = float(it.get("quantity") or 1)
        cur.execute("SELECT id, type, stock FROM products WHERE id = ?", (prod_id,))
        p_row = cur.fetchone()
        if not p_row or p_row["type"] == "service":
            continue

        cur.execute("UPDATE products SET stock = stock + ? WHERE id = ? AND type != 'service'", (qty, prod_id))
        cur.execute("""
            INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
        """, (warehouse_id, prod_id, qty, qty))

        cur.execute("""
            SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
            FROM product_bom b
            JOIN ingredients i ON b.ingredient_id = i.id
            WHERE b.product_id = ?
        """, (prod_id,))
        bom_rows = cur.fetchall()
        for bom in bom_rows:
            if bom["ingredient_type"] == "SERVICE":
                continue
            consumed = bom["quantity"] * qty
            cur.execute("""
                INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
                    quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            """, (warehouse_id, bom["ingredient_id"], consumed, consumed))

    cur.execute("DELETE FROM inventory_logs WHERE order_code = ?", (ticket_code,))

def process_spa_ticket_payment(cur, ticket_id: int, payment_method: str = "cash", account_id: Optional[int] = None, note: Optional[str] = None, remainder_method: Optional[str] = None):
    """Thu tiền 1 phiếu Spa.

    - payment_method 'wallet': ví chỉ trả phần dịch vụ; phần còn lại (hàng hóa, tip,
      hoặc phần dịch vụ ví không đủ) thu bằng `remainder_method`
      ('cash' mặc định, hoặc 'transfer'/'card' — khi đó phải có account_id đúng loại).
    - Các hình thức khác: thu toàn bộ bằng payment_method.
    """
    cur.execute("SELECT * FROM pet_service_tickets WHERE id = ?", (ticket_id,))
    ticket = cur.fetchone()
    if not ticket:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu dịch vụ Spa")

    if ticket["payment_status"] == "paid":
        return {
            "status": "ok",
            "message": "Phiếu đã được thanh toán",
            "id": ticket_id,
            "code": ticket["code"],
            "wallet_deduction": float(ticket["spa_wallet_deduction"] or 0.0),
            "cash_collected": 0.0
        }

    import json as json_mod
    services_list = []
    if ticket["services_json"]:
        try:
            services_list = json_mod.loads(ticket["services_json"])
        except Exception:
            services_list = []

    pure_spa_service_total = 0.0
    retail_product_total = 0.0
    for it in services_list:
        sub = (it.get("quantity") or 1) * (it.get("price") or 0.0)
        if it.get("is_retail"):
            retail_product_total += sub
        elif it.get("is_tip") or it.get("name") == "Tiền tip thợ":
            pass
        else:
            pure_spa_service_total += sub

    tip_amount = float(ticket["tip_amount"] or 0.0)
    deposit_amount = float(ticket["deposit_amount"] or 0.0)
    price = float(ticket["price"] or 0.0)
    customer_id = ticket["customer_id"]
    code = ticket["code"]

    if not services_list:
        pure_spa_service_total = max(0.0, price - tip_amount)

    remaining_due = max(0.0, price - deposit_amount)
    wallet_deduction = 0.0
    paid_account_id = None  # tài khoản thực sự nhận tiền (None nếu ví Spa trả đủ)
    pay_remainder_method = None  # hình thức thu phần còn lại khi ví không trả đủ bill

    if payment_method == "wallet":
        cur.execute("SELECT id, name, spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
        c_row = cur.fetchone()
        current_wallet = float(c_row["spa_wallet_balance"] or 0.0) if c_row else 0.0
        if current_wallet <= 0:
            raise HTTPException(
                status_code=400,
                detail="Số dư ví Spa không đủ (Số dư ví bằng 0 đ, không thể chọn thanh toán bằng ví)"
            )
        # Sửa H: Ví chỉ trừ phần dịch vụ (không trừ tip, không trừ hàng bán kèm)
        charge_limit = min(pure_spa_service_total, remaining_due)
        wallet_deduction = min(current_wallet, charge_limit)
        if wallet_deduction > 0:
            new_wallet = max(0.0, current_wallet - wallet_deduction)
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (new_wallet, customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
                VALUES (?, 'spend', ?, ?, ?, ?)
            """, (customer_id, wallet_deduction, current_wallet, new_wallet, f"Trừ ví dịch vụ Spa cho phiếu {code}"))

        cash_collected = max(0.0, remaining_due - wallet_deduction)
    else:
        cash_collected = remaining_due

    if cash_collected > 0:
        cb_code = generate_cashbook_code(cur, "PT-SPA")
        note_str = note or f"Thu tiền phiếu Spa {code}"
        if payment_method == "wallet" and wallet_deduction > 0:
            note_str += f" (Trừ ví: {wallet_deduction:,.0f} đ, Thu ngoài: {cash_collected:,.0f} đ)"

        # Phần thu ngoài của 'Ví Spa' thu theo hình thức thu ngân chọn (tiền mặt / CK / thẻ);
        # các hình thức khác thì đúng hình thức của phiếu.
        pay_m = (remainder_method or "cash") if payment_method == "wallet" else payment_method
        if pay_m not in ("cash", "transfer", "card", "bank"):
            pay_m = "cash"
        # CK/thẻ bắt buộc có account_id đúng loại; tiền mặt luôn vào két tiền mặt
        account_id = resolve_payment_account(cur, pay_m, account_id if pay_m != "cash" else None)
        paid_account_id = account_id
        pay_remainder_method = pay_m if payment_method == "wallet" else None

        cur.execute("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        s_row = cur.fetchone()
        shift_id = s_row["id"] if s_row else None

        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
            VALUES (?, 'in', 'Thu tiền dịch vụ Spa', ?, ?, 'pet_service', ?, ?, ?, ?)
        """, (cb_code, cash_collected, customer_id, ticket_id, note_str, account_id, shift_id))

    cur.execute("""
        UPDATE pet_service_tickets
        SET payment_status = 'paid', payment_method = ?, spa_wallet_deduction = ?, account_id = ?,
            remainder_method = ?
        WHERE id = ?
    """, (payment_method, wallet_deduction, paid_account_id, pay_remainder_method, ticket_id))

    return {
        "status": "ok",
        "id": ticket_id,
        "code": code,
        "wallet_deduction": wallet_deduction,
        "cash_collected": cash_collected,
        "remainder_method": pay_remainder_method,
        "remaining_due": 0.0
    }

@service_router.post("")
def create_pet_service(ticket: PetServiceCreate):
    conn = get_db()
    cur = conn.cursor()
    try:
        now = datetime.datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        code = f"DV{now.strftime('%y%m%d%H%M%S')}{random.randint(10, 99)}"
        while True:
            cur.execute("SELECT 1 FROM pet_service_tickets WHERE code = ?", (code,))
            if not cur.fetchone():
                break
            code = f"DV{now.strftime('%y%m%d%H%M%S')}{random.randint(1000, 9999)}"

        # 1. Tính toán ticket_number reset theo ngày (bắt đầu random từ 5 đến 10 nếu ngày mới chưa có phiếu, sau đó +1)
        cur.execute("SELECT MAX(ticket_number) as max_num FROM pet_service_tickets WHERE ticket_date = ?", (today_str,))
        row = cur.fetchone()
        if row and row["max_num"] is not None:
            ticket_number = row["max_num"] + 1
        else:
            ticket_number = random.randint(5, 10)

        # 2. Xử lý thú cưng: Nếu có pet_id thì update cân nặng; Nếu chưa có pet_id nhưng có pet_name thì tự tạo bé mới cho khách
        actual_pet_id = ticket.pet_id
        if not actual_pet_id and ticket.pet_name and ticket.pet_name.strip():
            cur.execute("""
                INSERT INTO pets (customer_id, name, species, breed, color, weight, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                ticket.customer_id,
                ticket.pet_name.strip(),
                "Chó",
                ticket.pet_breed or "",
                ticket.pet_color or "",
                ticket.weight_at_service or 0.0,
                f"Tự động tạo từ phiếu Spa ngày {today_str}"
            ))
            actual_pet_id = cur.lastrowid
        elif actual_pet_id and ticket.weight_at_service is not None:
            cur.execute("UPDATE pets SET weight = ? WHERE id = ?", (ticket.weight_at_service, actual_pet_id))

        # 3. Thời gian nhận: Tự động lấy giờ bấm bill / tạo phiếu nếu chưa truyền
        received_time = ticket.received_time or now.strftime("%H:%M")

        services_list = []
        if ticket.services_json:
            try:
                import json as json_mod
                services_list = json_mod.loads(ticket.services_json)
            except Exception:
                services_list = []

        # T7: Trừ kho hàng bán kèm (nếu có sản phẩm bán kèm)
        if services_list:
            deduct_retail_products_stock(cur, services_list, code)

        cur.execute("""
            INSERT INTO pet_service_tickets (
                code, ticket_number, ticket_date, customer_id, pet_id, service_type,
                appointment_time, has_transport, transport_address, price, status, note,
                weight_at_service, shaving_feet, customer_request, accessories,
                payment_status, payment_method, services_json,
                call_status, received_time, arrival_method, checkout_time, return_method,
                staff_receiver, staff_worker_1, staff_worker_2, staff_cutter, staff_dyer,
                dye_package, surcharge, art_cutting_fee, teeth_cleaning, shipping_fee, tip_amount, deposit_amount,
                send_to_hotel, batch_code, spa_wallet_deduction
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code, ticket_number, today_str, ticket.customer_id, actual_pet_id, ticket.service_type,
            ticket.appointment_time or "", ticket.has_transport or 0, ticket.transport_address or "",
            ticket.price or 0.0, ticket.status or "pending", ticket.note or "",
            ticket.weight_at_service, ticket.shaving_feet or "Không cạo bàn",
            ticket.customer_request or "", ticket.accessories or "",
            "unpaid", ticket.payment_method or "",
            ticket.services_json or "[]",
            ticket.call_status or "Chưa gọi", received_time, ticket.arrival_method or "Khách chở tới",
            ticket.checkout_time or "", ticket.return_method or "Khách đón",
            ticket.staff_receiver or "", ticket.staff_worker_1 or "", ticket.staff_worker_2 or "",
            ticket.staff_cutter or "", ticket.staff_dyer or "",
            ticket.dye_package or "", ticket.surcharge or 0.0, ticket.art_cutting_fee or 0.0,
            ticket.teeth_cleaning or 0.0, ticket.shipping_fee or 0.0, ticket.tip_amount or 0.0, ticket.deposit_amount or 0.0,
            ticket.send_to_hotel or 0, ticket.batch_code or "", 0.0
        ))
        new_id = cur.lastrowid

        # 4. Sửa J: Tiền cọc ghi phiếu thu riêng lúc nhận
        if ticket.deposit_amount and ticket.deposit_amount > 0:
            cb_dep_code = generate_cashbook_code(cur, "PT-COC")
            # Cọc: tiền mặt -> két; CK/thẻ -> bắt buộc tài khoản đúng loại
            dep_m = ticket.deposit_method if ticket.deposit_method in ("cash", "transfer", "card") else "cash"
            account_id = resolve_payment_account(cur, dep_m, ticket.deposit_account_id if dep_m != "cash" else None)
            cur.execute("UPDATE pet_service_tickets SET deposit_account_id = ? WHERE id = ?", (account_id, new_id))

            cur.execute("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            s_row = cur.fetchone()
            shift_id = s_row["id"] if s_row else None

            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                VALUES (?, 'in', 'Thu tiền cọc Spa', ?, ?, 'pet_service_deposit', ?, ?, ?, ?)
            """, (cb_dep_code, ticket.deposit_amount, ticket.customer_id, new_id, f"Thu tiền cọc phiếu Spa {code}", account_id, shift_id))

        # 5. Nếu phiếu ở trạng thái Đã Thanh Toán: xử lý thanh toán phần còn lại qua hàm dùng chung
        if ticket.payment_status == "paid":
            process_spa_ticket_payment(cur, new_id, payment_method=ticket.payment_method or "cash", account_id=ticket.account_id,
                                       remainder_method=ticket.remainder_method or "cash")

        conn.commit()
        return {"status": "ok", "id": new_id, "code": code, "ticket_number": ticket_number, "batch_code": ticket.batch_code or ""}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@service_router.post("/batch")
def create_pet_services_batch(batch_req: PetServiceBatchCreate):
    if not batch_req.tickets:
        raise HTTPException(status_code=400, detail="Danh sách phiếu trống")

    conn = get_db()
    cur = conn.cursor()
    try:
        now = datetime.datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        batch_code = batch_req.batch_code or f"BATCH{now.strftime('%y%m%d%H%M%S')}{random.randint(10, 99)}"

        # Lấy ticket_number cơ sở cho ngày hôm nay (bắt đầu random từ 5 đến 10 nếu chưa có phiếu nào)
        cur.execute("SELECT MAX(ticket_number) as max_num FROM pet_service_tickets WHERE ticket_date = ?", (today_str,))
        row = cur.fetchone()
        db_next = (row["max_num"] + 1) if (row and row["max_num"] is not None) else None
        shown = batch_req.start_ticket_number
        if shown and shown > 0 and (db_next is None or shown >= db_next):
            base_number = shown  # đúng số đã hiển thị trên màn hình
        else:
            base_number = db_next if db_next is not None else random.randint(5, 10)

        cur.execute("SELECT id, name, phone FROM contacts WHERE id = ?", (batch_req.customer_id,))
        cust = cur.fetchone()

        # Kiểm tra số dư ví Spa trước khi bắt đầu tạo phiếu
        import json as json_mod
        current_wallet = 0.0
        cur.execute("SELECT id, name, spa_wallet_balance FROM contacts WHERE id = ?", (batch_req.customer_id,))
        c_row = cur.fetchone()
        if c_row and c_row["spa_wallet_balance"]:
            current_wallet = float(c_row["spa_wallet_balance"])

        has_wallet_req = any(t.payment_status == "paid" and t.payment_method == "wallet" for t in batch_req.tickets)
        if has_wallet_req and current_wallet <= 0:
            raise HTTPException(
                status_code=400,
                detail="Số dư ví Spa không đủ (Số dư ví bằng 0 đ, không thể chọn thanh toán bằng ví)"
            )

        wallet_deduction_total = 0.0
        cash_collected_batch = 0.0
        created_tickets = []

        # Tài khoản nhận tiền của cả đợt: theo hình thức của phiếu trả trước đầu tiên (Ví Spa -> phần thu ngoài là tiền mặt)
        paid_tickets = [t for t in batch_req.tickets if t.payment_status == "paid"]
        raw_batch_method = (paid_tickets[0].payment_method if paid_tickets else "cash") or "cash"
        # Ví Spa: phần còn lại của đợt thu theo hình thức thu ngân chọn (mặc định tiền mặt)
        batch_remainder_method = None
        if raw_batch_method == "wallet":
            batch_remainder_method = (batch_req.remainder_method or "cash")
            if batch_remainder_method not in ("cash", "transfer", "card", "bank"):
                batch_remainder_method = "cash"
        batch_method = batch_remainder_method or raw_batch_method
        batch_acc_req = batch_req.account_id or (paid_tickets[0].account_id if paid_tickets else None)
        account_id = resolve_payment_account(cur, batch_method if paid_tickets else "any",
                                            (batch_acc_req if batch_method != "cash" else None) if paid_tickets else None)

        cur.execute("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        s_row = cur.fetchone()
        shift_id = s_row["id"] if s_row else None

        for idx, t in enumerate(batch_req.tickets):
            t_number = base_number + idx
            t_code = f"DV{now.strftime('%y%m%d%H%M%S%f')[:16]}{random.randint(100, 999)}{idx}"
            while True:
                cur.execute("SELECT 1 FROM pet_service_tickets WHERE code = ?", (t_code,))
                if not cur.fetchone():
                    break
                t_code = f"DV{now.strftime('%y%m%d%H%M%S%f')[:16]}{random.randint(1000, 9999)}{idx}"
            
            actual_pet_id = t.pet_id
            if not actual_pet_id and t.pet_name and t.pet_name.strip():
                cur.execute("""
                    INSERT INTO pets (customer_id, name, species, breed, color, weight, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    batch_req.customer_id,
                    t.pet_name.strip(),
                    "Chó",
                    t.pet_breed or "",
                    t.pet_color or "",
                    t.weight_at_service or 0.0,
                    f"Tự động tạo từ phiếu Spa hàng loạt ngày {today_str}"
                ))
                actual_pet_id = cur.lastrowid
            elif actual_pet_id and t.weight_at_service is not None:
                cur.execute("UPDATE pets SET weight = ? WHERE id = ?", (t.weight_at_service, actual_pet_id))

            received_time = t.received_time or now.strftime("%H:%M")

            t_services = []
            if t.services_json:
                try:
                    t_services = json_mod.loads(t.services_json)
                except Exception:
                    t_services = []

            # Sửa H/I: Tính tiền dịch vụ thuần (không tính tip và hàng)
            pure_serv = sum(
                (it.get("quantity") or 1) * (it.get("price") or 0.0)
                for it in t_services
                if not it.get("is_retail") and not it.get("is_tip") and it.get("name") != "Tiền tip thợ"
            ) if t_services else max(0.0, (t.price or 0.0) - (t.tip_amount or 0.0))

            t_dep = float(t.deposit_amount or 0.0)
            t_price = float(t.price or 0.0)
            t_rem = max(0.0, t_price - t_dep)

            this_wallet_ded = 0.0
            if t.payment_status == "paid" and t.payment_method == "wallet":
                max_allowable = min(pure_serv, t_rem)
                this_wallet_ded = min(current_wallet, max_allowable)
                current_wallet = max(0.0, current_wallet - this_wallet_ded)
                wallet_deduction_total += this_wallet_ded

            cur.execute("""
                INSERT INTO pet_service_tickets (
                    code, ticket_number, ticket_date, customer_id, pet_id, service_type,
                    appointment_time, has_transport, transport_address, price, status, note,
                    weight_at_service, shaving_feet, customer_request, accessories,
                    payment_status, payment_method, services_json,
                    call_status, received_time, arrival_method, checkout_time, return_method,
                    staff_receiver, staff_worker_1, staff_worker_2, staff_cutter, staff_dyer,
                    dye_package, surcharge, art_cutting_fee, teeth_cleaning, shipping_fee, tip_amount, deposit_amount,
                    send_to_hotel, batch_code, spa_wallet_deduction
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                t_code, t_number, today_str, batch_req.customer_id, actual_pet_id, t.service_type,
                t.appointment_time or "", t.has_transport or 0, t.transport_address or "",
                t_price, t.status or "pending", t.note or "",
                t.weight_at_service, t.shaving_feet or "Không cạo bàn",
                t.customer_request or "", t.accessories or "",
                t.payment_status or "unpaid", t.payment_method or "",
                t.services_json or "[]",
                t.call_status or "Chưa gọi", received_time, t.arrival_method or "Khách chở tới",
                t.checkout_time or "", t.return_method or "Khách đón",
                t.staff_receiver or "", t.staff_worker_1 or "", t.staff_worker_2 or "",
                t.staff_cutter or "", t.staff_dyer or "",
                t.dye_package or "", t.surcharge or 0.0, t.art_cutting_fee or 0.0,
                t.teeth_cleaning or 0.0, t.shipping_fee or 0.0, t.tip_amount or 0.0, t_dep,
                t.send_to_hotel or 0, batch_code, this_wallet_ded
            ))
            t_id = cur.lastrowid

            # Sửa J: Ghi phiếu thu tiền cọc nếu có cọc
            if t_dep > 0:
                cb_dep_code = generate_cashbook_code(cur, "PT-COC")
                dep_m = t.deposit_method if t.deposit_method in ("cash", "transfer", "card") else "cash"
                dep_account_id = resolve_payment_account(cur, dep_m, t.deposit_account_id if dep_m != "cash" else None)
                cur.execute("UPDATE pet_service_tickets SET deposit_account_id = ? WHERE id = ?", (dep_account_id, t_id))
                cur.execute("""
                    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                    VALUES (?, 'in', 'Thu tiền cọc Spa', ?, ?, 'pet_service_deposit', ?, ?, ?, ?)
                """, (cb_dep_code, t_dep, batch_req.customer_id, t_id, f"Thu tiền cọc phiếu Spa {t_code} (Đợt {batch_code})", dep_account_id, shift_id))

            if t.payment_status == "paid":
                this_cash = max(0.0, t_rem - this_wallet_ded)
                cash_collected_batch += this_cash
                rem_m = batch_remainder_method if (t.payment_method == "wallet" and this_cash > 0) else None
                cur.execute("UPDATE pet_service_tickets SET account_id = ?, remainder_method = ? WHERE id = ?",
                            (account_id if this_cash > 0 else None, rem_m, t_id))

            created_tickets.append({
                "id": t_id,
                "code": t_code,
                "ticket_number": t_number,
                "pet_id": actual_pet_id,
                "pet_name": t.pet_name or "",
                "pet_breed": t.pet_breed or "",
                "pet_gender": t.pet_gender or "",
                "pet_color": t.pet_color or "",
                "weight_at_service": t.weight_at_service,
                "shaving_feet": t.shaving_feet or "Không cạo bàn",
                "service_type": t.service_type,
                "price": t.price or 0.0,
                "customer_id": batch_req.customer_id,
                "customer_name": cust["name"] if cust else "",
                "customer_phone": cust["phone"] if cust else "",
                "customer_request": t.customer_request or "",
                "accessories": t.accessories or "",
                "note": t.note or "",
                "services_json": t.services_json or "[]",
                "staff_receiver": t.staff_receiver or "",
                "staff_cutter": t.staff_cutter or "",
                "staff_worker_1": t.staff_worker_1 or "",
                "staff_dyer": t.staff_dyer or "",
                "dye_package": t.dye_package or "",
                "surcharge": t.surcharge or 0.0,
                "art_cutting_fee": t.art_cutting_fee or 0.0,
                "teeth_cleaning": t.teeth_cleaning or 0.0,
                "shipping_fee": t.shipping_fee or 0.0,
                "tip_amount": t.tip_amount or 0.0,
                "deposit_amount": t.deposit_amount or 0.0,
                "spa_wallet_deduction": this_wallet_ded,
                "received_time": received_time,
                "payment_status": t.payment_status or "unpaid",
                "batch_code": batch_code
            })

        # Xử lý trừ ví Spa cho đợt tiếp nhận nếu thanh toán bằng ví
        if wallet_deduction_total > 0:
            init_wallet = float(c_row["spa_wallet_balance"] or 0.0) if c_row else 0.0
            new_wallet = max(0.0, init_wallet - wallet_deduction_total)
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (new_wallet, batch_req.customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
                VALUES (?, 'spend', ?, ?, ?, ?)
            """, (batch_req.customer_id, wallet_deduction_total, init_wallet, new_wallet, f"Trừ ví dịch vụ Spa cho đợt tiếp nhận {batch_code} ({len(batch_req.tickets)} bé)"))

        if cash_collected_batch > 0:
            cb_code = generate_cashbook_code(cur, "PT-SPA")
            first_id = created_tickets[0]["id"] if created_tickets else None
            cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
            VALUES (?, 'in', 'Thu tiền dịch vụ Spa', ?, ?, 'pet_service', ?, ?, ?, ?)
            """, (cb_code, cash_collected_batch, batch_req.customer_id, first_id, f"Thu tiền ngoài đợt tiếp nhận Spa {batch_code} (Trừ ví: {wallet_deduction_total:,.0f} đ, Thu ngoài: {cash_collected_batch:,.0f} đ)", account_id, shift_id))

        conn.commit()
        return {"status": "ok", "batch_code": batch_code, "tickets": created_tickets, "count": len(created_tickets)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@service_router.get("/history/customer/{customer_id}")
def get_customer_spa_history(customer_id: int, pet_id: Optional[int] = None):
    conn = get_db()
    cur = conn.cursor()
    sql = """
        SELECT s.*, p.name as pet_name, p.breed as pet_breed, p.weight as pet_weight,
               c.name as customer_name, c.phone as customer_phone
        FROM pet_service_tickets s
        JOIN contacts c ON c.id = s.customer_id
        LEFT JOIN pets p ON p.id = s.pet_id
        WHERE s.customer_id = ?
    """
    params = [customer_id]
    if pet_id:
        sql += " AND s.pet_id = ?"
        params.append(pet_id)
    sql += " ORDER BY s.id DESC LIMIT 100"
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@service_router.put("/{ticket_id}/status")
def update_pet_service_status(ticket_id: int, req: PetServiceStatusUpdate):
    conn = get_db()
    cur = conn.cursor()
    # Nếu chuyển sang "completed" (Đã Về) và chưa có checkout_time thì tự động ghi nhận giờ hiện tại
    if req.status in ["completed", "done", "checked_out"]:
        now_time = datetime.datetime.now().strftime("%H:%M")
        checkout_val = req.checkout_time or now_time
        cur.execute("UPDATE pet_service_tickets SET status = ?, checkout_time = CASE WHEN checkout_time = '' OR checkout_time IS NULL THEN ? ELSE checkout_time END WHERE id = ?", (req.status, checkout_val, ticket_id))
    else:
        cur.execute("UPDATE pet_service_tickets SET status = ? WHERE id = ?", (req.status, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.put("/{ticket_id}/call-status")
def update_pet_service_call_status(ticket_id: int, req: PetServiceCallStatusUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE pet_service_tickets SET call_status = ? WHERE id = ?", (req.call_status, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.put("/{ticket_id}/progress")
def update_pet_service_progress(ticket_id: int, req: PetServiceProgressUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE pet_service_tickets SET
            staff_receiver = ?,
            staff_worker_1 = ?,
            staff_worker_2 = ?,
            staff_cutter = ?,
            staff_dyer = ?,
            teeth_cleaning = ?,
            art_cutting_fee = ?,
            surcharge = ?,
            shipping_fee = ?,
            tip_amount = ?,
            deposit_amount = ?,
            arrival_method = ?,
            return_method = ?,
            checkout_time = COALESCE(NULLIF(?, ''), checkout_time),
            note = COALESCE(NULLIF(?, ''), note),
            price = COALESCE(?, price)
        WHERE id = ?
    """, (
        req.staff_receiver or "",
        req.staff_worker_1 or "",
        req.staff_worker_2 or "",
        req.staff_cutter or "",
        req.staff_dyer or "",
        req.teeth_cleaning or 0,
        req.art_cutting_fee or 0,
        req.surcharge or 0,
        req.shipping_fee or 0,
        req.tip_amount or 0,
        req.deposit_amount or 0,
        req.arrival_method or "",
        req.return_method or "",
        req.checkout_time or "",
        req.note or "",
        req.price,
        ticket_id
    ))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@service_router.put("/tickets/bulk-update")
def bulk_update_pet_service_tickets(payload: PetServiceTicketBulkUpdate):
    if not payload.tickets:
        return {"success": True, "updated_count": 0, "message": "Không có phiếu nào cần cập nhật"}
    conn = get_db()
    cur = conn.cursor()
    updated_count = 0
    try:
        for t in payload.tickets:
            updates = []
            params = []
            if t.status is not None:
                updates.append("status = ?")
                params.append(t.status)
                if t.status in ["completed", "done", "checked_out"]:
                    now_str = datetime.datetime.now().strftime("%H:%M")
                    updates.append("checkout_time = CASE WHEN checkout_time = '' OR checkout_time IS NULL THEN ? ELSE checkout_time END")
                    params.append(now_str)
            if t.staff_cutter is not None:
                updates.append("staff_cutter = ?")
                params.append(t.staff_cutter)
            if t.staff_worker_1 is not None:
                updates.append("staff_worker_1 = ?")
                params.append(t.staff_worker_1)
            if t.staff_worker_2 is not None:
                updates.append("staff_worker_2 = ?")
                params.append(t.staff_worker_2)
            if t.staff_dyer is not None:
                updates.append("staff_dyer = ?")
                params.append(t.staff_dyer)
            if t.staff_receiver is not None:
                updates.append("staff_receiver = ?")
                params.append(t.staff_receiver)
            if t.weight_at_service is not None:
                updates.append("weight_at_service = ?")
                params.append(t.weight_at_service)
            if t.service_type is not None:
                updates.append("service_type = ?")
                params.append(t.service_type)
            if t.dye_package is not None:
                updates.append("dye_package = ?")
                params.append(t.dye_package)
            if t.shaving_feet is not None:
                updates.append("shaving_feet = ?")
                params.append(t.shaving_feet)
            if t.accessories is not None:
                updates.append("accessories = ?")
                params.append(t.accessories)
            if t.send_to_hotel is not None:
                updates.append("send_to_hotel = ?")
                params.append(t.send_to_hotel)
            if t.received_time is not None:
                updates.append("received_time = ?")
                params.append(t.received_time)
            if t.checkout_time is not None:
                updates.append("checkout_time = ?")
                params.append(t.checkout_time)
            if t.surcharge is not None:
                updates.append("surcharge = ?")
                params.append(t.surcharge)
            if t.teeth_cleaning is not None:
                updates.append("teeth_cleaning = ?")
                params.append(t.teeth_cleaning)
            if t.art_cutting_fee is not None:
                updates.append("art_cutting_fee = ?")
                params.append(t.art_cutting_fee)
            if t.shipping_fee is not None:
                updates.append("shipping_fee = ?")
                params.append(t.shipping_fee)
            if t.tip_amount is not None:
                updates.append("tip_amount = ?")
                params.append(t.tip_amount)
            if t.deposit_amount is not None:
                updates.append("deposit_amount = ?")
                params.append(t.deposit_amount)
            if t.price is not None:
                updates.append("price = ?")
                params.append(t.price)
            if t.original_service_type is not None:
                updates.append("original_service_type = ?")
                params.append(t.original_service_type)
            if t.original_price is not None:
                updates.append("original_price = ?")
                params.append(t.original_price)
            if t.service_change_reason is not None:
                updates.append("service_change_reason = ?")
                params.append(t.service_change_reason)
            if t.service_changed_at is not None:
                updates.append("service_changed_at = ?")
                params.append(t.service_changed_at)
            if t.payment_status is not None:
                cur.execute("SELECT payment_status, payment_method FROM pet_service_tickets WHERE id = ?", (t.id,))
                cur_t = cur.fetchone()
                if cur_t and cur_t["payment_status"] != "paid" and t.payment_status == "paid":
                    pay_m = t.payment_method or cur_t["payment_method"] or "cash"
                    process_spa_ticket_payment(cur, t.id, payment_method=pay_m, account_id=getattr(t, 'account_id', None),
                                               remainder_method=getattr(t, 'remainder_method', None) or "cash")
                else:
                    updates.append("payment_status = ?")
                    params.append(t.payment_status)
            if t.payment_method is not None:
                updates.append("payment_method = ?")
                params.append(t.payment_method)
            if t.note is not None:
                updates.append("note = ?")
                params.append(t.note)
            if t.customer_request is not None:
                updates.append("customer_request = ?")
                params.append(t.customer_request)

            if updates:
                params.append(t.id)
                sql = f"UPDATE pet_service_tickets SET {', '.join(updates)} WHERE id = ?"
                cur.execute(sql, tuple(params))
                updated_count += 1

        conn.commit()
    except HTTPException:
        # Lỗi nghiệp vụ (400/403/404) phải giữ nguyên mã, không bọc thành 500
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error in bulk_update_pet_service_tickets: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return {
        "success": True,
        "updated_count": updated_count,
        "message": f"Đã cập nhật thành công {updated_count} phiếu dịch vụ Spa"
    }

@service_router.post("/{ticket_id}/pay")
def pay_pet_service(ticket_id: int, req: PetServicePayRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        res = process_spa_ticket_payment(
            cur,
            ticket_id,
            payment_method=req.payment_method or "cash",
            account_id=req.account_id,
            note=req.note,
            remainder_method=req.remainder_method or "cash"
        )
        conn.commit()
        return res
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@service_router.delete("/{ticket_id}")
def delete_pet_service(ticket_id: int):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        ticket = cur.fetchone()
        if not ticket:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu Spa")

        # 1. Hoàn ví Spa nếu phiếu có trừ ví
        wallet_deduction = float(ticket["spa_wallet_deduction"] or 0.0)
        customer_id = ticket["customer_id"]
        if wallet_deduction > 0 and customer_id:
            cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (customer_id,))
            c_row = cur.fetchone()
            bal_before = float(c_row["spa_wallet_balance"] or 0.0) if c_row else 0.0
            bal_after = bal_before + wallet_deduction
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (bal_after, customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
                VALUES (?, 'refund', ?, ?, ?, ?)
            """, (customer_id, wallet_deduction, bal_before, bal_after, f"Hoàn tiền trừ ví do xóa phiếu Spa {ticket['code']}"))

        # 2. Hoàn tồn kho hàng bán kèm (T7)
        if ticket["services_json"]:
            try:
                import json as json_mod
                items = json_mod.loads(ticket["services_json"])
                restore_retail_products_stock(cur, items, ticket["code"])
            except Exception as e:
                logger.warning(f"Lỗi hoàn kho khi xóa phiếu Spa {ticket['code']}: {e}")

        # 3. Xóa các phiếu thu liên quan trong sổ quỹ (ref_type = pet_service hoặc pet_service_deposit)
        cur.execute("""
            DELETE FROM cashbook 
            WHERE ref_type IN ('pet_service', 'pet_service_deposit') AND ref_id = ?
        """, (ticket_id,))

        # 4. Xóa phiếu Spa
        cur.execute("DELETE FROM pet_service_tickets WHERE id = ?", (ticket_id,))
        conn.commit()
        return {"status": "ok", "message": f"Đã xóa phiếu {ticket['code']} thành công"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
