from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db

router = APIRouter(prefix="/api/contacts", tags=["Partners"])

class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    type: str = "customer" # customer | supplier

class ContactUpdate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""

class ContactPayDebt(BaseModel):
    amount: float
    note: Optional[str] = ""

@router.get("")
def list_contacts(type: Optional[str] = None, search: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM contacts WHERE 1=1"
    params = []
    if type and type != "all":
        query += " AND type = ?"
        params.append(type)
    if search:
        query += " AND (name LIKE ? OR phone LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s])
    query += " ORDER BY id DESC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.get("/{contact_id}")
def get_contact(contact_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy đối tác")
    data = dict(row)
    
    # Lấy lịch sử giao dịch liên quan
    if data["type"] == "customer":
        cur.execute("SELECT code, created_at, total_amount, paid_amount, (total_amount - paid_amount) as debt, note FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    else:
        cur.execute("SELECT code, created_at, total_amount, paid_amount, debt_amount as debt, status, note FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    data["history"] = [dict(r) for r in cur.fetchall()]
    
    # Lấy lịch sử thu/chi quỹ liên quan
    cur.execute("SELECT code, type, category, amount, note, created_at FROM cashbook WHERE contact_id = ? ORDER BY id DESC LIMIT 20", (contact_id,))
    data["cashbook_history"] = [dict(r) for r in cur.fetchall()]
    
    conn.close()
    return data

@router.post("")
def create_contact(req: ContactCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (type, name, phone, address, debt) VALUES (?, ?, ?, ?, 0)", 
                (req.type, req.name.strip(), req.phone.strip(), req.address.strip()))
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"status": "ok", "id": new_id}

@router.put("/{contact_id}")
def update_contact(contact_id: int, req: ContactUpdate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE contacts SET name = ?, phone = ?, address = ? WHERE id = ?",
                (req.name.strip(), req.phone.strip(), req.address.strip(), contact_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.delete("/{contact_id}")
def delete_contact(contact_id: int):
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
def pay_contact_debt(contact_id: int, req: ContactPayDebt):
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
    
    # Ghi nhận tự động vào sổ quỹ
    cb_type = "in" if c["type"] == "customer" else "out"
    cb_cat = "Thu nợ khách hàng" if c["type"] == "customer" else "Chi trả nợ NCC"
    cb_code = f"CB{datetime_str()}"
    note = f"Thanh toán nợ cho {c['name']} (Nợ cũ: {current_debt:,.0f} đ, Thu/Chi: {req.amount:,.0f} đ). {req.note or ''}".strip()
    cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, note) VALUES (?, ?, ?, ?, ?, ?)",
                (cb_code, cb_type, cb_cat, req.amount, contact_id, note))
    conn.commit()
    conn.close()
    return {"status": "ok", "new_debt": new_debt}

def datetime_str():
    import datetime
    return datetime.datetime.now().strftime("%y%m%d%H%M%S")
