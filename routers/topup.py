from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from dependencies import require_role, require_permission, get_current_user
from routers.cashbook import generate_cashbook_code

router = APIRouter(prefix="/api/topup", tags=["topup"])

class TopupPackageCreate(BaseModel):
    name: str
    pay_amount: float
    receive_amount: float
    is_active: Optional[int] = 1

class TopupPackageUpdate(BaseModel):
    name: Optional[str] = None
    pay_amount: Optional[float] = None
    receive_amount: Optional[float] = None
    is_active: Optional[int] = None

class TopupRechargeIn(BaseModel):
    contact_id: int
    package_id: int
    payment_method: Optional[str] = "cash"
    note: Optional[str] = ""
    account_id: Optional[int] = None
    shift_id: Optional[int] = None

# --- Packages CRUD ---
@router.get("/packages")
def list_topup_packages(all: bool = Query(False)):
    conn = get_db()
    cur = conn.cursor()
    if all:
        cur.execute("SELECT * FROM topup_packages ORDER BY pay_amount ASC")
    else:
        cur.execute("SELECT * FROM topup_packages WHERE is_active = 1 ORDER BY pay_amount ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/packages")
def create_topup_package(pkg: TopupPackageCreate, user=Depends(require_role("owner", "admin"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active)
            VALUES (?, ?, ?, ?)
        """, (pkg.name, pkg.pay_amount, pkg.receive_amount, pkg.is_active if pkg.is_active is not None else 1))
        conn.commit()
        pkg_id = cur.lastrowid
        cur.execute("SELECT * FROM topup_packages WHERE id = ?", (pkg_id,))
        row = dict(cur.fetchone())
    finally:
        conn.close()
    return row

@router.put("/packages/{id}")
def update_topup_package(id: int, pkg: TopupPackageUpdate, user=Depends(require_role("owner", "admin"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM topup_packages WHERE id = ?", (id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Không tìm thấy gói topup")
        
        updates = []
        vals = []
        if pkg.name is not None:
            updates.append("name = ?")
            vals.append(pkg.name)
        if pkg.pay_amount is not None:
            updates.append("pay_amount = ?")
            vals.append(pkg.pay_amount)
        if pkg.receive_amount is not None:
            updates.append("receive_amount = ?")
            vals.append(pkg.receive_amount)
        if pkg.is_active is not None:
            updates.append("is_active = ?")
            vals.append(pkg.is_active)
        
        if updates:
            vals.append(id)
            cur.execute(f"UPDATE topup_packages SET {', '.join(updates)} WHERE id = ?", vals)
            conn.commit()
            
        cur.execute("SELECT * FROM topup_packages WHERE id = ?", (id,))
        row = dict(cur.fetchone())
    finally:
        conn.close()
    return row

@router.delete("/packages/{id}")
def delete_topup_package(id: int, user=Depends(require_role("owner", "admin"))):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM topup_packages WHERE id = ?", (id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy gói topup")
        
        # Check if used in transactions
        cur.execute("SELECT 1 FROM spa_wallet_transactions WHERE package_id = ? LIMIT 1", (id,))
        if cur.fetchone():
            # Soft delete if referenced
            cur.execute("UPDATE topup_packages SET is_active = 0 WHERE id = ?", (id,))
        else:
            cur.execute("DELETE FROM topup_packages WHERE id = ?", (id,))
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "message": "Đã xóa gói topup"}

# --- Recharge Wallet ---
@router.post("/recharge")
def recharge_spa_wallet(req: TopupRechargeIn, user=Depends(get_current_user)):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, name, spa_wallet_balance FROM contacts WHERE id = ?", (req.contact_id,))
        contact = cur.fetchone()
        if not contact:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
        
        cur.execute("SELECT * FROM topup_packages WHERE id = ? AND is_active = 1", (req.package_id,))
        pkg = cur.fetchone()
        if not pkg:
            raise HTTPException(status_code=404, detail="Gói topup không tồn tại hoặc đã ngừng áp dụng")

        balance_before = contact["spa_wallet_balance"] or 0.0
        receive_amt = float(pkg["receive_amount"])
        pay_amt = float(pkg["pay_amount"])
        balance_after = balance_before + receive_amt

        # Update contact balance
        cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (balance_after, req.contact_id))

        note = req.note or f"Nạp ví Spa gói {pkg['name']}"
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note)
            VALUES (?, ?, 'topup', ?, ?, ?, ?)
        """, (req.contact_id, req.package_id, receive_amt, balance_before, balance_after, note))
        tx_id = cur.lastrowid

        # Determine shift_id if not provided
        shift_id = req.shift_id
        if not shift_id and user and "id" in user:
            cur.execute("SELECT id FROM shifts WHERE cashier_id = ? AND status = 'open' LIMIT 1", (user["id"],))
            s_row = cur.fetchone()
            if s_row:
                shift_id = s_row["id"]

        # Record cash transaction / revenue into cashbook
        if pay_amt > 0:
            cb_code = generate_cashbook_code(cur, "PT-VI")
            acc_id = req.account_id
            if not acc_id:
                if req.payment_method == "bank":
                    cur.execute("SELECT id FROM payment_accounts WHERE account_type = 'bank' AND is_active = 1 LIMIT 1")
                else:
                    cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
                row_acc = cur.fetchone()
                acc_id = row_acc[0] if row_acc else None

            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                VALUES (?, 'in', 'Thu tien nap vi Spa', ?, ?, 'topup', ?, ?, ?, ?)
            """, (cb_code, pay_amt, req.contact_id, tx_id, f"Thu tiền nạp ví: {pkg['name']} ({req.payment_method})", acc_id, shift_id))

        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

    return {
        "status": "ok",
        "transaction_id": tx_id,
        "contact_id": req.contact_id,
        "package_id": req.package_id,
        "amount": receive_amt,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "spa_wallet_balance": balance_after
    }

# --- History ---
@router.get("/history/{contact_id}")
def get_spa_wallet_history(contact_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.*, p.name as package_name, o.code as order_code
        FROM spa_wallet_transactions t
        LEFT JOIN topup_packages p ON t.package_id = p.id
        LEFT JOIN orders o ON t.order_id = o.id
        WHERE t.contact_id = ?
        ORDER BY t.created_at DESC, t.id DESC
    """, (contact_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows
