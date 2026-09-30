from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
import io
import datetime
import random
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from database import get_db
from logger_config import get_module_logger
from routers.cashbook import generate_cashbook_code
from dependencies import require_role, require_permission

logger = get_module_logger("partners")

router = APIRouter(prefix="/api/contacts", tags=["Partners"])

class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    type: str = "customer" # customer | supplier
    segment_id: Optional[int] = None

class ContactUpdate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    segment_id: Optional[int] = None

class CustomerWarningUpdate(BaseModel):
    is_flagged: bool = False
    warning_note: Optional[str] = ""

class ContactPayDebt(BaseModel):
    amount: float
    note: Optional[str] = ""
    account_id: Optional[int] = None

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
               (SELECT COUNT(*) FROM pets p WHERE p.customer_id = c.id) as pets_count
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
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/export-excel")
def export_contacts_excel(type: str = "customer"):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT c.*, cs.name as segment_name,
               (SELECT COUNT(*) FROM pets p WHERE p.customer_id = c.id) as pets_count
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
        headers = ["STT", "Tên Nhà Cung Cấp", "Số Điện Thoại", "Địa Chỉ", "Công Nợ Hiện Tại (đ)"]

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
            ws.append([idx, r["name"] or "", r["phone"] or "", r["address"] or "", r["debt"] or 0])

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
    wb = openpyxl.Workbook()
    ws = wb.active
    label = "Mau_Khach_Hang" if type == "customer" else "Mau_Nha_Cung_Cap"
    ws.title = label

    header_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    if type == "customer":
        headers = ["Tên Khách Hàng (*)", "Số Điện Thoại", "Địa Chỉ", "Nhóm Khách Hàng", "Công Nợ Ban Đầu (đ)"]
        samples = [
            ["Nguyễn Văn An", "0901234567", "123 Lê Lợi, Bến Tre", "Khách VIP", 0],
            ["Trần Thị Mai", "0912345678", "456 Nguyễn Huệ, TP.HCM", "Khách lẻ", 150000]
        ]
    else:
        headers = ["Tên Nhà Cung Cấp (*)", "Số Điện Thoại", "Địa Chỉ", "Công Nợ Ban Đầu (đ)"]
        samples = [
            ["Công Ty Bao Bì Hưng Phát", "0283888999", "KCN Tân Bình, TP.HCM", 0],
            ["Xưởng Chai Lọ Sài Gòn", "0933444555", "Bình Chánh, TP.HCM", 5000000]
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
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    
    def find_col(aliases):
        for idx, h in enumerate(header_row):
            for a in aliases:
                if a in h:
                    return idx
        return -1

    idx_name = find_col(["tên", "name", "khách hàng", "nhà cung cấp"])
    idx_phone = find_col(["thoại", "sđt", "phone", "điện thoại"])
    idx_addr = find_col(["địa chỉ", "address"])
    idx_group = find_col(["nhóm", "phân loại", "segment", "group"])
    idx_debt = find_col(["nợ", "công nợ", "debt"])

    if idx_name == -1:
        idx_name = 0

    conn = get_db()
    cur = conn.cursor()

    # Load nhóm khách hàng để map
    cur.execute("SELECT id, name FROM customer_segments")
    segments_map = {r["name"].strip().lower(): r["id"] for r in cur.fetchall()}

    created = 0
    updated = 0

    for r in rows[1:]:
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        
        name = str(r[idx_name] or "").strip()
        if not name:
            continue

        phone = str(r[idx_phone] or "").strip() if idx_phone != -1 and idx_phone < len(r) else ""
        address = str(r[idx_addr] or "").strip() if idx_addr != -1 and idx_addr < len(r) else ""
        
        segment_id = None
        if type == "customer" and idx_group != -1 and idx_group < len(r):
            group_name = str(r[idx_group] or "").strip().lower()
            segment_id = segments_map.get(group_name)

        debt = 0.0
        if idx_debt != -1 and idx_debt < len(r) and r[idx_debt] is not None:
            try:
                debt = float(r[idx_debt])
            except:
                debt = 0.0

        # Kiểm tra trùng SĐT nếu có
        existing_id = None
        if phone:
            cur.execute("SELECT id FROM contacts WHERE phone = ? AND type = ?", (phone, type))
            ex = cur.fetchone()
            if ex:
                existing_id = ex["id"]

        if existing_id:
            cur.execute("""
                UPDATE contacts 
                SET name = ?, address = ?, segment_id = COALESCE(?, segment_id)
                WHERE id = ?
            """, (name, address, segment_id, existing_id))
            updated += 1
        else:
            cur.execute("""
                INSERT INTO contacts (type, name, phone, address, segment_id, debt)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (type, name, phone, address, segment_id, debt))
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
    cur.execute("INSERT INTO contacts (type, name, phone, email, address, segment_id, debt) VALUES (?, ?, ?, ?, ?, ?, 0)", 
                (req.type, req.name.strip(), (req.phone or "").strip(), (req.email or "").strip(), (req.address or "").strip(), req.segment_id))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@router.put("/{contact_id}")
def update_contact(contact_id: int, req: ContactUpdate, user=Depends(require_permission("partners.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET name = ?, phone = ?, email = ?, address = ?, segment_id = ? WHERE id = ?",
                (req.name.strip(), (req.phone or "").strip(), (req.email or "").strip(), (req.address or "").strip(), req.segment_id, contact_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

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
    cur.execute("SELECT id, type, name, debt FROM contacts WHERE id = ?", (contact_id,))
    c = cur.fetchone()
    if not c:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    
    current_debt = c["debt"]
    new_debt = max(0.0, current_debt - req.amount)
    cur.execute("UPDATE contacts SET debt = ? WHERE id = ?", (new_debt, contact_id))
    
    cb_type = "in" if c["type"] == "customer" else "out"
    cb_cat = "Thu nợ khách hàng" if c["type"] == "customer" else "Chi trả nợ NCC"
    prefix = "PT-CN" if c["type"] == "customer" else "PC-NH"
    cb_code = generate_cashbook_code(cur, prefix)
    
    acc_id = req.account_id
    if not acc_id:
        cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
        row_acc = cur.fetchone()
        acc_id = row_acc[0] if row_acc else None

    note = f"Thanh toán nợ cho {c['name']} (Nợ cũ: {current_debt:,.0f} đ, Thu/Chi: {req.amount:,.0f} đ). {req.note or ''}".strip()
    cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, note, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (cb_code, cb_type, cb_cat, req.amount, contact_id, note, acc_id))
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

class PetServiceBatchCreate(BaseModel):
    customer_id: int
    batch_code: Optional[str] = ""
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

class SpaStaffCreate(BaseModel):
    staff_code: Optional[str] = ""
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "Thợ Spa"
    is_active: Optional[int] = 1

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

@service_router.post("")
def create_pet_service(ticket: PetServiceCreate):
    conn = get_db()
    cur = conn.cursor()
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    code = f"DV{now.strftime('%y%m%d%H%M%S')}{random.randint(10, 99)}"

    # 1. Tính toán ticket_number reset theo ngày (bắt đầu từ 1 mỗi ngày mới, sau đó +1)
    cur.execute("SELECT MAX(ticket_number) as max_num FROM pet_service_tickets WHERE ticket_date = ?", (today_str,))
    row = cur.fetchone()
    if row and row["max_num"] is not None:
        ticket_number = row["max_num"] + 1
    else:
        ticket_number = 1

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

    # Phân tách tiền dịch vụ Spa vs tiền sản phẩm hàng hóa bán kèm từ services_json
    services_list = []
    if ticket.services_json:
        try:
            import json as json_mod
            services_list = json_mod.loads(ticket.services_json)
        except Exception:
            services_list = []

    spa_service_total = 0.0
    retail_product_total = 0.0
    for it in services_list:
        sub = (it.get("quantity") or 1) * (it.get("price") or 0.0)
        if it.get("is_retail"):
            retail_product_total += sub
        else:
            spa_service_total += sub

    if not services_list:
        spa_service_total = ticket.price or 0.0

    wallet_deduction = 0.0
    if ticket.payment_status == "paid" and ticket.payment_method == "wallet" and (ticket.price or 0.0) > 0:
        cur.execute("SELECT id, name, spa_wallet_balance FROM contacts WHERE id = ?", (ticket.customer_id,))
        c_row = cur.fetchone()
        current_wallet = c_row["spa_wallet_balance"] if (c_row and c_row["spa_wallet_balance"]) else 0.0
        if current_wallet <= 0:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="Số dư ví Spa không đủ (Số dư ví bằng 0 đ, không thể chọn thanh toán bằng ví)"
            )
        # Ví Spa: Cấn trừ tối đa số dư ví hiện có (Lựa chọn A: trừ hết ví, phần thiếu thu ngoài)
        charge_amount = min(spa_service_total, ticket.price or 0.0)
        wallet_deduction = min(current_wallet, charge_amount)
        if wallet_deduction > 0:
            new_wallet = max(0.0, current_wallet - wallet_deduction)
            cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (new_wallet, ticket.customer_id))
            cur.execute("""
                INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
                VALUES (?, 'spend', ?, ?, ?, ?)
            """, (ticket.customer_id, wallet_deduction, current_wallet, new_wallet, f"Trừ ví làm dịch vụ Spa cho phiếu {code}"))

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
        ticket.payment_status or "unpaid", ticket.payment_method or "",
        ticket.services_json or "[]",
        ticket.call_status or "Chưa gọi", received_time, ticket.arrival_method or "Khách chở tới",
        ticket.checkout_time or "", ticket.return_method or "Khách đón",
        ticket.staff_receiver or "", ticket.staff_worker_1 or "", ticket.staff_worker_2 or "",
        ticket.staff_cutter or "", ticket.staff_dyer or "",
        ticket.dye_package or "", ticket.surcharge or 0.0, ticket.art_cutting_fee or 0.0,
        ticket.teeth_cleaning or 0.0, ticket.shipping_fee or 0.0, ticket.tip_amount or 0.0, ticket.deposit_amount or 0.0,
        ticket.send_to_hotel or 0, ticket.batch_code or "", wallet_deduction
    ))
    new_id = cur.lastrowid

    # 4. Ghi nhận Sổ Quỹ cashbook cho phần tiền mặt / chuyển khoản thực thu
    if ticket.payment_status == "paid":
        cash_collected = 0.0
        if ticket.payment_method == "wallet":
            # Phần sản phẩm hoặc chi phí vượt ví bắt buộc thu tiền mặt/chuyển khoản
            cash_collected = max(0.0, (ticket.price or 0.0) - wallet_deduction)
        elif ticket.payment_method in ("cash", "transfer"):
            cash_collected = ticket.price or 0.0

        if cash_collected > 0:
            cb_code = generate_cashbook_code(cur, "PT-SPA")
            note_str = f"Thu tiền phiếu Spa {code}"
            if ticket.payment_method == "wallet" and wallet_deduction > 0:
                note_str += f" (Trừ ví: {wallet_deduction:,.0f} đ, Thu ngoài: {cash_collected:,.0f} đ)"
            cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES (?, 'in', 'Thu tien dich vu Spa', ?, ?, 'pet_service', ?, ?)
            """, (cb_code, cash_collected, ticket.customer_id, new_id, note_str))

    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id, "code": code, "ticket_number": ticket_number, "batch_code": ticket.batch_code or ""}

@service_router.post("/batch")
def create_pet_services_batch(batch_req: PetServiceBatchCreate):
    if not batch_req.tickets:
        raise HTTPException(status_code=400, detail="Danh sách phiếu trống")

    conn = get_db()
    cur = conn.cursor()
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    batch_code = batch_req.batch_code or f"BATCH{now.strftime('%y%m%d%H%M%S')}{random.randint(10, 99)}"

    # Lấy ticket_number cơ sở cho ngày hôm nay (reset bắt đầu từ 1 nếu chưa có phiếu nào)
    cur.execute("SELECT MAX(ticket_number) as max_num FROM pet_service_tickets WHERE ticket_date = ?", (today_str,))
    row = cur.fetchone()
    base_number = (row["max_num"] + 1) if (row and row["max_num"] is not None) else 1

    cur.execute("SELECT id, name, phone FROM contacts WHERE id = ?", (batch_req.customer_id,))
    cust = cur.fetchone()

    # Kiểm tra số dư ví Spa trước khi bắt đầu tạo phiếu
    wallet_batch_total = sum(t.price or 0.0 for t in batch_req.tickets if (t.payment_status == "paid" and t.payment_method == "wallet"))
    current_wallet = 0.0
    wallet_deduction_total = 0.0
    cash_collected_batch = 0.0
    if wallet_batch_total > 0:
        cur.execute("SELECT id, name, spa_wallet_balance FROM contacts WHERE id = ?", (batch_req.customer_id,))
        c_row = cur.fetchone()
        current_wallet = c_row["spa_wallet_balance"] if (c_row and c_row["spa_wallet_balance"]) else 0.0
        if current_wallet <= 0:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="Số dư ví Spa không đủ (Số dư ví bằng 0 đ, không thể chọn thanh toán bằng ví)"
            )
        # Cấn trừ tối đa số dư ví hiện có (Lựa chọn A)
        wallet_deduction_total = min(current_wallet, wallet_batch_total)
        cash_collected_batch = max(0.0, wallet_batch_total - wallet_deduction_total)

    created_tickets = []

    for idx, t in enumerate(batch_req.tickets):
        t_number = base_number + idx
        t_code = f"DV{now.strftime('%y%m%d%H%M%S%f')[:16]}{random.randint(100, 999)}{idx}"
        
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

        cur.execute("""
            INSERT INTO pet_service_tickets (
                code, ticket_number, ticket_date, customer_id, pet_id, service_type,
                appointment_time, has_transport, transport_address, price, status, note,
                weight_at_service, shaving_feet, customer_request, accessories,
                payment_status, payment_method, services_json,
                call_status, received_time, arrival_method, checkout_time, return_method,
                staff_receiver, staff_worker_1, staff_worker_2, staff_cutter, staff_dyer,
                dye_package, surcharge, art_cutting_fee, teeth_cleaning, shipping_fee, tip_amount, deposit_amount,
                send_to_hotel, batch_code
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            t_code, t_number, today_str, batch_req.customer_id, actual_pet_id, t.service_type,
            t.appointment_time or "", t.has_transport or 0, t.transport_address or "",
            t.price or 0.0, t.status or "pending", t.note or "",
            t.weight_at_service, t.shaving_feet or "Không cạo bàn",
            t.customer_request or "", t.accessories or "",
            t.payment_status or "unpaid", t.payment_method or "",
            t.services_json or "[]",
            t.call_status or "Chưa gọi", received_time, t.arrival_method or "Khách chở tới",
            t.checkout_time or "", t.return_method or "Khách đón",
            t.staff_receiver or "", t.staff_worker_1 or "", t.staff_worker_2 or "",
            t.staff_cutter or "", t.staff_dyer or "",
            t.dye_package or "", t.surcharge or 0.0, t.art_cutting_fee or 0.0,
            t.teeth_cleaning or 0.0, t.shipping_fee or 0.0, t.tip_amount or 0.0, t.deposit_amount or 0.0,
            t.send_to_hotel or 0, batch_code
        ))
        t_id = cur.lastrowid
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
            "received_time": received_time,
            "payment_status": t.payment_status or "unpaid",
            "batch_code": batch_code
        })

    # Xử lý trừ ví Spa cho đợt tiếp nhận nếu thanh toán bằng ví (Lựa chọn A)
    if wallet_deduction_total > 0:
        new_wallet = max(0.0, current_wallet - wallet_deduction_total)
        cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (new_wallet, batch_req.customer_id))
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
            VALUES (?, 'spend', ?, ?, ?, ?)
        """, (batch_req.customer_id, wallet_deduction_total, current_wallet, new_wallet, f"Trừ ví dịch vụ Spa cho đợt tiếp nhận {batch_code} ({len(batch_req.tickets)} bé)"))

    if cash_collected_batch > 0:
        cb_code = generate_cashbook_code(cur, "PT-SPA")
        first_id = created_tickets[0]["id"] if created_tickets else None
        cur.execute("""
        INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
        VALUES (?, 'in', 'Thu tien dich vu Spa', ?, ?, 'pet_service', ?, ?)
        """, (cb_code, cash_collected_batch, batch_req.customer_id, first_id, f"Thu tiền ngoài đợt tiếp nhận Spa {batch_code} (Trừ ví: {wallet_deduction_total:,.0f} đ, Thu ngoài: {cash_collected_batch:,.0f} đ)"))

    conn.commit()
    conn.close()
    return {"status": "ok", "batch_code": batch_code, "tickets": created_tickets, "count": len(created_tickets)}

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
    except Exception as e:
        conn.rollback()
        conn.close()
        logger.error(f"Error in bulk_update_pet_service_tickets: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return {
        "success": True,
        "updated_count": updated_count,
        "message": f"Đã cập nhật thành công {updated_count} phiếu dịch vụ Spa"
    }

@service_router.delete("/{ticket_id}")
def delete_pet_service(ticket_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM pet_service_tickets WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}
