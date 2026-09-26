from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
import datetime
from database import get_db
from schemas import CashbookCreate, PaymentAccountCreate, PaymentAccountUpdate
from logger_config import get_module_logger
from dependencies import get_current_user, require_role, require_permission

logger = get_module_logger("cashbook")

router = APIRouter(tags=["Cashbook & Reports"])

def generate_cashbook_code(cur, prefix: str = "SQ") -> str:
    """Sinh mã phiếu Thu / Chi theo định dạng: {PREFIX}-{YYMMDD}-{STT:03d}"""
    date_str = datetime.datetime.now().strftime("%y%m%d")
    pattern = f"{prefix}-{date_str}-%"
    cur.execute("SELECT COUNT(*) FROM cashbook WHERE code LIKE ?", (pattern,))
    count = cur.fetchone()[0]
    
    stt = count + 1
    while True:
        candidate = f"{prefix}-{date_str}-{stt:03d}"
        cur.execute("SELECT 1 FROM cashbook WHERE code = ?", (candidate,))
        if not cur.fetchone():
            return candidate
        stt += 1

@router.get("/api/cashbook/next-code")
def get_next_cashbook_code(prefix: str = Query("PT-TT")):
    conn = get_db()
    cur = conn.cursor()
    code = generate_cashbook_code(cur, prefix)
    conn.close()
    return {"code": code, "prefix": prefix}

# --- Payment Accounts (Tài Khoản Thanh Toán) ---
@router.get("/api/payment-accounts")
def list_payment_accounts():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            pa.*,
            COALESCE(SUM(
                CASE 
                    WHEN cb.type IN ('in', 'THU') THEN cb.amount
                    WHEN cb.type IN ('out', 'CHI') THEN -cb.amount
                    ELSE 0 
                END
            ), 0) as transaction_sum
        FROM payment_accounts pa
        LEFT JOIN cashbook cb ON cb.account_id = pa.id
        WHERE pa.is_active = 1
        GROUP BY pa.id
        ORDER BY pa.is_default DESC, pa.id ASC
    """)
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["current_balance"] = (d.get("initial_balance") or 0.0) + (d.get("transaction_sum") or 0.0)
        rows.append(d)
    conn.close()
    return rows

@router.post("/api/payment-accounts")
def create_payment_account(req: PaymentAccountCreate, user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Nếu đặt là default, bỏ default các tài khoản khác
        if req.is_default:
            cur.execute("UPDATE payment_accounts SET is_default = 0")
        
        cur.execute("""
            INSERT INTO payment_accounts (
                code, name, account_type, owner_type, bank_name, account_number, account_holder, initial_balance, is_default
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.code.strip().upper(), req.name.strip(), req.account_type, req.owner_type or "COMPANY",
            req.bank_name or "", req.account_number or "", req.account_holder or "",
            req.initial_balance or 0.0, 1 if req.is_default else 0
        ))
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
        return {"status": "ok", "id": new_id}
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Lỗi tạo tài khoản: {str(e)}")

@router.put("/api/payment-accounts/{account_id}")
def update_payment_account(account_id: int, req: PaymentAccountUpdate, user=Depends(require_role("owner"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM payment_accounts WHERE id = ?", (account_id,))
        acc = cur.fetchone()
        if not acc:
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
        
        if req.is_default:
            cur.execute("UPDATE payment_accounts SET is_default = 0 WHERE id != ?", (account_id,))

        update_fields = []
        values = []
        if req.code is not None:
            update_fields.append("code = ?")
            values.append(req.code.strip().upper())
        if req.name is not None:
            update_fields.append("name = ?")
            values.append(req.name.strip())
        if req.account_type is not None:
            update_fields.append("account_type = ?")
            values.append(req.account_type)
        if req.owner_type is not None:
            update_fields.append("owner_type = ?")
            values.append(req.owner_type)
        if req.bank_name is not None:
            update_fields.append("bank_name = ?")
            values.append(req.bank_name)
        if req.account_number is not None:
            update_fields.append("account_number = ?")
            values.append(req.account_number)
        if req.account_holder is not None:
            update_fields.append("account_holder = ?")
            values.append(req.account_holder)
        if req.initial_balance is not None:
            update_fields.append("initial_balance = ?")
            values.append(req.initial_balance)
        if req.is_default is not None:
            update_fields.append("is_default = ?")
            values.append(1 if req.is_default else 0)
        if req.is_active is not None:
            update_fields.append("is_active = ?")
            values.append(1 if req.is_active else 0)

        if update_fields:
            values.append(account_id)
            cur.execute(f"UPDATE payment_accounts SET {', '.join(update_fields)} WHERE id = ?", values)
            conn.commit()
        
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Lỗi cập nhật tài khoản: {str(e)}")

# --- Cashbook Records (Sổ Quỹ) ---
@router.get("/api/cashbook")
def list_cashbook(
    type: Optional[str] = None,
    account_id: Optional[int] = None,
    limit: int = 100
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT 
            cb.*,
            pa.code as account_code,
            pa.name as account_name,
            pa.owner_type as account_owner_type,
            pa.account_type,
            ct.name as contact_name,
            o.code as ref_order_code,
            pst.code as ref_pet_service_code
        FROM cashbook cb
        LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
        LEFT JOIN contacts ct ON cb.contact_id = ct.id
        LEFT JOIN orders o ON (cb.ref_type = 'order' AND cb.ref_id = o.id)
        LEFT JOIN pet_service_tickets pst ON (cb.ref_type = 'pet_service' AND cb.ref_id = pst.id)
        WHERE 1=1
    """
    params = []
    if type:
        norm_type = "in" if type in ["in", "THU", "Thu"] else "out"
        query += " AND (cb.type = ? OR cb.type = ?)"
        params.extend([norm_type, "THU" if norm_type == "in" else "CHI"])
    if account_id:
        query += " AND cb.account_id = ?"
        params.append(account_id)
    
    query += " ORDER BY cb.id DESC LIMIT ?"
    params.append(limit)
    
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/cashbook")
def create_cashbook(req: CashbookCreate, user=Depends(require_permission("cashbook.manage"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Chuẩn hóa loại in/out
        norm_type = "in" if req.type in ["in", "THU", "Thu"] else "out"
        
        # 1. Xác định tài khoản thanh toán
        acc_id = req.account_id
        if not acc_id:
            cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
            row = cur.fetchone()
            if row:
                acc_id = row[0]
            else:
                cur.execute("SELECT id FROM payment_accounts WHERE is_active = 1 ORDER BY id ASC LIMIT 1")
                row_first = cur.fetchone()
                acc_id = row_first[0] if row_first else None

        # 2. Sinh mã hoặc kiểm tra mã người dùng nhập tay
        if req.code and req.code.strip():
            code = req.code.strip().upper()
            cur.execute("SELECT 1 FROM cashbook WHERE code = ?", (code,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail=f"Mã phiếu '{code}' đã tồn tại trong hệ thống!")
        else:
            prefix = "PT-TT" if norm_type == "in" else "PC-CP"
            code = generate_cashbook_code(cur, prefix)

        note = (req.note or req.description or "").strip()

        cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            code, norm_type, req.category.strip(), req.amount, req.contact_id,
            req.ref_type or "manual", req.ref_id, note, acc_id
        ))
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
        return {"status": "ok", "id": new_id, "code": code}
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Lỗi tạo phiếu thu chi: {str(e)}")

# --- Báo Cáo Tổng Hợp ---
@router.get("/api/reports/summary")
def report_summary():
    conn = get_db()
    cur = conn.cursor()
    # Doanh thu
    cur.execute("SELECT COALESCE(SUM(final_amount), 0) as revenue, COALESCE(SUM(debt_amount), 0) as customer_debt FROM orders")
    order_stat = cur.fetchone()
    # Tong chi & Thu so quy
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type IN ('in', 'THU')")
    total_in = cur.fetchone()[0]
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM cashbook WHERE type IN ('out', 'CHI')")
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
