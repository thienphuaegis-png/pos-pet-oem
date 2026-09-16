from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db

router = APIRouter(prefix="/api/contacts", tags=["Partners"])

class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    type: str = "customer"

@router.get("")
def list_contacts(type: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    if type:
        cur.execute("SELECT * FROM contacts WHERE type = ? ORDER BY id DESC", (type,))
    else:
        cur.execute("SELECT * FROM contacts ORDER BY id DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("")
def create_contact(name: str, type: str = "customer", phone: str = "", address: str = ""):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (type, name, phone, address) VALUES (?, ?, ?, ?)", (type, name, phone, address))
    conn.commit()
    conn.close()
    return {"status": "ok"}

