from fastapi import APIRouter, HTTPException
import datetime
from database import get_db
from schemas import CashbookCreate
from logger_config import get_module_logger

logger = get_module_logger("cashbook")

router = APIRouter(tags=["Cashbook & Reports"])

@router.get("/api/cashbook")
def list_cashbook():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook ORDER BY id DESC LIMIT 100")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/cashbook")
def create_cashbook(req: CashbookCreate):
    conn = get_db()
    cur = conn.cursor()
    code = f"SQ{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
    cur.execute('''
    INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, note)
    VALUES (?, ?, ?, ?, ?, 'manual', ?)
    ''', (code, req.type, req.category, req.amount, req.contact_id, req.note))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# Bao cao tong hop
@router.get("/api/reports/summary")
def report_summary():
    conn = get_db()
    cur = conn.cursor()
    # Doanh thu
    cur.execute("SELECT COALESCE(SUM(final_amount), 0) as revenue, COALESCE(SUM(debt_amount), 0) as customer_debt FROM orders")
    order_stat = cur.fetchone()
    # Tong chi & Thu so quy
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type = 'in'")
    total_in = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type = 'out'")
    total_out = cur.fetchone()[0]
    # No NCC
    cur.execute("SELECT COALESCE(SUM(debt), 0) FROM contacts WHERE type = 'supplier'")
    supplier_debt = cur.fetchone()[0]
    # Tong hoa hong nhan vien
    cur.execute("SELECT COALESCE(SUM(commission_amount), 0) FROM orders")
    total_comm = cur.fetchone()[0]

    conn.close()
    return {
        "revenue": order_stat["revenue"],
        "customer_debt": order_stat["customer_debt"],
        "cash_balance": total_in - total_out,
        "supplier_debt": supplier_debt,
        "commission_paid": total_comm
    }
