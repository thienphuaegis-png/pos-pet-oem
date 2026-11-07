from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from dependencies import require_role, require_permission, get_current_user, resolve_payment_account
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

class TopupTransactionUpdate(BaseModel):
    payment_method: Optional[str] = None
    account_id: Optional[int] = None
    note: Optional[str] = None

class WalletAdjustIn(BaseModel):
    new_balance: float
    reason: str

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
        cur.execute("""
            SELECT c.id, c.name, c.points, c.spa_wallet_balance, c.segment_id, cs.allow_points
            FROM contacts c
            LEFT JOIN customer_segments cs ON c.segment_id = cs.id
            WHERE c.id = ?
        """, (req.contact_id,))
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

        # Loyalty points calculation on pay_amt
        cust_points = contact["points"] or 0
        allow_pts = contact["allow_points"]
        can_earn_points = (allow_pts is None or allow_pts == 1)

        points_earned = 0
        current_points = cust_points
        tier_upgraded = None

        if can_earn_points and pay_amt > 0:
            cur.execute("SELECT value FROM settings WHERE key = 'points_exchange_rate'")
            sett_row = cur.fetchone()
            try:
                rate = float(sett_row["value"]) if sett_row and sett_row["value"] else 1000.0
            except (ValueError, TypeError):
                rate = 1000.0
            if rate <= 0:
                rate = 1000.0

            points_earned = int(pay_amt // rate)
            current_points = cust_points + points_earned
            cur.execute("UPDATE contacts SET points = ? WHERE id = ?", (current_points, req.contact_id))

            # Xét thăng hạng tự động
            from services.loyalty import apply_tier_by_points
            tier_upgraded = apply_tier_by_points(cur, req.contact_id, current_points)

        note = req.note or f"Nạp ví Spa gói {pkg['name']}"
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, points_earned, note)
            VALUES (?, ?, 'topup', ?, ?, ?, ?, ?)
        """, (req.contact_id, req.package_id, receive_amt, balance_before, balance_after, points_earned, note))
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
            method_labels = {
                "cash": "Tiền mặt",
                "transfer": "Chuyển khoản",
                "bank": "Chuyển khoản",
                "card": "Quẹt thẻ",
                "wallet": "Ví điện tử"
            }
            method_label = method_labels.get(req.payment_method, req.payment_method or "Tiền mặt")

            # Chuyển khoản/thẻ: bắt buộc tài khoản đúng loại; tiền mặt: két. Không tự rơi vào tài khoản mặc định.
            acc_id = resolve_payment_account(cur, req.payment_method or "cash", req.account_id)

            cur.execute("""
                INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, shift_id)
                VALUES (?, 'in', 'Thu tien nap vi Spa', ?, ?, 'topup', ?, ?, ?, ?)
            """, (cb_code, pay_amt, req.contact_id, tx_id, f"Thu tiền nạp ví: {pkg['name']} ({method_label})", acc_id, shift_id))

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
        "package_name": pkg["name"],
        "pay_amount": pay_amt,
        "receive_amount": receive_amt,
        "amount": receive_amt,
        "points_earned": points_earned,
        "current_points": current_points,
        "tier_upgraded": tier_upgraded,
        "payment_method": req.payment_method,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "spa_wallet_balance": balance_after
    }

# --- History ---
@router.put("/adjust/{contact_id}")
def adjust_spa_wallet(contact_id: int, req: WalletAdjustIn, user=Depends(require_role("owner", "admin"))):
    """Owner/Admin đặt lại số dư ví Spa. Không ghi sổ quỹ (không có tiền thật), chỉ lưu lịch sử 'adjust'."""
    reason = (req.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Vui lòng nhập lý do điều chỉnh ví")
    new_bal = round(float(req.new_balance), 2)
    if new_bal < 0:
        raise HTTPException(status_code=400, detail="Số dư ví không được âm")
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ? AND type = 'customer'", (contact_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
        old_bal = float(row["spa_wallet_balance"] or 0.0)
        if new_bal == old_bal:
            raise HTTPException(status_code=400, detail="Số dư mới trùng số dư hiện tại")
        cur.execute("UPDATE contacts SET spa_wallet_balance = ? WHERE id = ?", (new_bal, contact_id))
        cur.execute("""
            INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
            VALUES (?, 'adjust', ?, ?, ?, ?)
        """, (contact_id, new_bal - old_bal, old_bal, new_bal, f"Điều chỉnh bởi {user.get('name') or 'Admin'}: {reason}"))
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"status": "ok", "balance_before": old_bal, "balance_after": new_bal, "spa_wallet_balance": new_bal}

@router.get("/history/{contact_id}")
def get_spa_wallet_history(contact_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.*, p.name as package_name, p.pay_amount, p.receive_amount, o.code as order_code
        FROM spa_wallet_transactions t
        LEFT JOIN topup_packages p ON t.package_id = p.id
        LEFT JOIN orders o ON t.order_id = o.id
        WHERE t.contact_id = ?
        ORDER BY t.created_at DESC, t.id DESC
    """, (contact_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# --- Transactions Management (Orders Sub-tab & Wallet History) ---
@router.get("/transactions")
def list_topup_transactions(
    search: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    payment_method: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_user)
):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT 
            t.id, t.contact_id, t.package_id, t.type, t.amount, t.balance_before, t.balance_after,
            t.points_earned, t.note, t.created_at,
            c.name as contact_name, c.phone as contact_phone,
            p.name as package_name, p.pay_amount, p.receive_amount,
            cb.code as cashbook_code, cb.account_id, cb.amount as pay_amount_actual,
            pa.name as account_name, pa.account_type,
            s.name as cashier_name
        FROM spa_wallet_transactions t
        JOIN contacts c ON t.contact_id = c.id
        LEFT JOIN topup_packages p ON t.package_id = p.id
        LEFT JOIN cashbook cb ON (cb.ref_type = 'topup' AND cb.ref_id = t.id)
        LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
        LEFT JOIN shifts sh ON cb.shift_id = sh.id
        LEFT JOIN staff s ON sh.cashier_id = s.id
        WHERE t.type = 'topup'
    """
    params = []
    if search:
        s_pat = f"%{search.strip()}%"
        query += " AND (c.name LIKE ? OR c.phone LIKE ? OR cb.code LIKE ? OR p.name LIKE ?)"
        params.extend([s_pat, s_pat, s_pat, s_pat])
    if from_date:
        query += " AND date(t.created_at) >= date(?)"
        params.append(from_date)
    if to_date:
        query += " AND date(t.created_at) <= date(?)"
        params.append(to_date)
    
    query += " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.put("/transactions/{id}")
def update_topup_transaction(
    id: int,
    req: TopupTransactionUpdate,
    user=Depends(require_role("owner", "admin"))
):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (id,))
    tx = cur.fetchone()
    if not tx:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch nạp ví")

    # Update spa_wallet_transactions note
    if req.note is not None:
        cur.execute("UPDATE spa_wallet_transactions SET note = ? WHERE id = ?", (req.note.strip(), id))

    # Sync with cashbook
    cur.execute("SELECT id FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (id,))
    cb = cur.fetchone()
    if cb:
        cb_updates = []
        cb_params = []
        if req.account_id is not None:
            cur.execute("SELECT id FROM payment_accounts WHERE id = ? AND is_active = 1", (req.account_id,))
            if cur.fetchone():
                cb_updates.append("account_id = ?")
                cb_params.append(req.account_id)
        if req.note is not None:
            cb_updates.append("note = ?")
            cb_params.append(req.note.strip())
        if cb_updates:
            cb_params.append(cb["id"])
            cur.execute(f"UPDATE cashbook SET {', '.join(cb_updates)} WHERE id = ?", cb_params)

    conn.commit()
    cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (id,))
    updated = dict(cur.fetchone())
    conn.close()
    return updated

@router.delete("/transactions/{id}")
def delete_topup_transaction(
    id: int,
    user=Depends(require_role("owner", "admin"))
):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (id,))
    tx = cur.fetchone()
    if not tx:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch nạp ví")

    tx_data = dict(tx)
    if tx_data.get("type") != "topup":
        conn.close()
        raise HTTPException(status_code=400, detail="Chỉ có thể xóa giao dịch loại nạp ví (topup)")

    cid = tx_data.get("contact_id")
    receive_amt = float(tx_data.get("amount") or 0.0)
    pts = int(tx_data.get("points_earned") or 0)

    # 1. Rollback customer balance and points
    if cid:
        cur.execute("SELECT spa_wallet_balance, points FROM contacts WHERE id = ?", (cid,))
        c_row = cur.fetchone()
        if c_row:
            cur_bal = float(c_row["spa_wallet_balance"] or 0.0)
            if cur_bal < receive_amt:
                conn.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"Số dư ví khách hàng ({cur_bal:,.0f}đ) không đủ để hoàn tác khoản nạp ({receive_amt:,.0f}đ)"
                )
        cur.execute("""
            UPDATE contacts
            SET spa_wallet_balance = spa_wallet_balance - ?,
                points = MAX(0, points - ?)
            WHERE id = ?
        """, (receive_amt, pts, cid))

    # 2. Delete cashbook voucher if exists
    cur.execute("DELETE FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (id,))

    # 3. Delete spa_wallet_transactions
    cur.execute("DELETE FROM spa_wallet_transactions WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Đã xóa giao dịch nạp ví #{id} và hoàn tác số dư ví, điểm thưởng thành công"}

