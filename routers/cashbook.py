from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime
from database import get_db, archive_code, is_code_archived
from schemas import (
    CashbookCreate, CashbookUpdate, CashbookTransferCreate,
    PaymentAccountCreate, PaymentAccountUpdate,
    ExpenseRequestCreate, ExpenseRequestApprove, ExpenseRequestBatchApprove,
    CashbookCategoryCreate, CashbookCategoryUpdate
)
from logger_config import get_module_logger
from dependencies import get_current_user, get_optional_user, require_role, require_permission

logger = get_module_logger("cashbook")

router = APIRouter(tags=["Cashbook & Reports"])

def generate_cashbook_code(cur, prefix: str = "SQ") -> str:
    """Sinh mã phiếu Thu / Chi theo định dạng: {PREFIX}-{YYMMDD}-{STT:03d} (chống trùng mã vĩnh viễn)"""
    date_str = datetime.now().strftime("%y%m%d")
    pattern = f"{prefix}-{date_str}-%"
    
    cur.execute("""
        SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 2) AS INTEGER))
        FROM (
            SELECT code FROM cashbook WHERE code LIKE ?
            UNION ALL
            SELECT code FROM archived_codes WHERE code LIKE ?
        )
    """, (f"{prefix}-{date_str}", pattern, pattern))
    row = cur.fetchone()
    max_stt = row[0] if row and row[0] is not None else 0
    stt = max_stt + 1
    
    while True:
        candidate = f"{prefix}-{date_str}-{stt:03d}"
        cur.execute("SELECT 1 FROM cashbook WHERE code = ?", (candidate,))
        if not cur.fetchone() and not is_code_archived(cur, candidate):
            archive_code(cur, candidate, "cashbook")
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
            COALESCE(ct.name, o_ct.name, pst_ct.name) as contact_name,
            COALESCE(ct.phone, o_ct.phone, pst_ct.phone) as contact_phone,
            COALESCE(ct.address, o_ct.address, pst_ct.address) as contact_address,
            o.code as ref_order_code,
            pst.code as ref_pet_service_code
        FROM cashbook cb
        LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
        LEFT JOIN contacts ct ON cb.contact_id = ct.id
        LEFT JOIN orders o ON (cb.ref_type = 'order' AND cb.ref_id = o.id)
        LEFT JOIN contacts o_ct ON o.customer_id = o_ct.id
        LEFT JOIN pet_service_tickets pst ON (cb.ref_type = 'pet_service' AND cb.ref_id = pst.id)
        LEFT JOIN contacts pst_ct ON pst.customer_id = pst_ct.id
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
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        if req.created_at and req.created_at.strip():
            created_at_val = req.created_at.strip()
            if " " not in created_at_val:
                now_time = datetime.now().strftime("%H:%M:%S")
                created_at_val = f"{created_at_val} {now_time}"
        else:
            created_at_val = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        cur.execute('''
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, account_id, fund_source, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            code, norm_type, req.category.strip(), req.amount, req.contact_id,
            req.ref_type or "manual", req.ref_id, note, acc_id, req.fund_source or "COMPANY", user_name, created_at_val
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

@router.put("/api/cashbook/{voucher_id}")
def update_cashbook_voucher(
    voucher_id: int,
    req: CashbookUpdate,
    user=Depends(require_permission("cashbook.manage"))
):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook WHERE id = ?", (voucher_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu chi")

    current = dict(row)
    updates = []
    params = []

    if req.amount is not None:
        if req.amount <= 0:
            conn.close()
            raise HTTPException(status_code=400, detail="Số tiền phải lớn hơn 0")
        updates.append("amount = ?")
        params.append(req.amount)

    if req.category is not None:
        updates.append("category = ?")
        params.append(req.category.strip())

    if req.account_id is not None:
        cur.execute("SELECT id FROM payment_accounts WHERE id = ? AND is_active = 1", (req.account_id,))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Tài khoản thanh toán không tồn tại hoặc đã bị khóa")
        updates.append("account_id = ?")
        params.append(req.account_id)

    if req.contact_id is not None:
        updates.append("contact_id = ?")
        params.append(req.contact_id)

    if req.note is not None:
        updates.append("note = ?")
        params.append(req.note.strip())

    if req.created_at is not None and req.created_at.strip():
        updates.append("created_at = ?")
        params.append(req.created_at.strip())

    user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    now_vn = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates.append("updated_by = ?")
    params.append(user_name)
    updates.append("updated_at = ?")
    params.append(now_vn)

    if not updates:
        conn.close()
        return current

    params.append(voucher_id)
    cur.execute(f"UPDATE cashbook SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()

    cur.execute("SELECT * FROM cashbook WHERE id = ?", (voucher_id,))
    updated = dict(cur.fetchone())
    conn.close()
    return updated

@router.delete("/api/cashbook/{voucher_id}")
def delete_cashbook_voucher(
    voucher_id: int,
    user=Depends(require_permission("cashbook.manage"))
):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook WHERE id = ?", (voucher_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu chi")

    current = dict(row)
    cb_type = (current.get("type") or "").lower()
    ref_type = (current.get("ref_type") or "").lower()
    ref_id = current.get("ref_id")
    category = current.get("category") or ""
    amount = float(current.get("amount") or 0.0)
    contact_id = current.get("contact_id")
    fund_src = (current.get("fund_source") or "COMPANY").upper()
    code = current.get("code") or ""

    # Chặn xóa trực tiếp phiếu thu của đơn hàng bán lẻ tại Sổ Quỹ
    if ref_type == "order":
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Không thể xóa trực tiếp phiếu thu của đơn hàng bán lẻ tại Sổ Quỹ (chỉ được phép xóa phiếu chi hoặc phiếu thu nạp ví Spa). Vui lòng hủy hoặc sửa từ màn hình Hóa Đơn!"
        )

    # 1. Hoàn tác công nợ NCC khi xóa phiếu chi trả nợ / chi mua hàng
    if cb_type in ("out", "chi") and (
        category in ("Chi trả nợ NCC", "Chi tiền nhập hàng", "OEM_PAYMENT") or
        ref_type in ("supplier_debt", "purchase", "oem_order") or
        code.startswith("PC-NH")
    ):
        if ref_type == "purchase" and ref_id and amount > 0:
            if contact_id:
                cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (amount, contact_id))
            cur.execute("""
                UPDATE purchases 
                SET debt_amount = debt_amount + ?, paid_amount = MAX(0.0, paid_amount - ?)
                WHERE id = ?
            """, (amount, amount, ref_id))

        elif ref_type == "oem_order" and ref_id and amount > 0:
            if contact_id:
                cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (amount, contact_id))
            cur.execute("""
                UPDATE oem_orders 
                SET remaining_payment = remaining_payment + ?, deposit_amount = MAX(0.0, deposit_amount - ?)
                WHERE id = ?
            """, (amount, amount, ref_id))

        elif contact_id and amount > 0:
            # ref_type == "supplier_debt" hoặc trả nợ đầu kỳ
            if fund_src == "PERSONAL":
                cur.execute("""
                    UPDATE contacts 
                    SET debt = debt + ?, initial_debt_personal = initial_debt_personal + ?
                    WHERE id = ?
                """, (amount, amount, contact_id))
            else:
                cur.execute("""
                    UPDATE contacts 
                    SET debt = debt + ?, initial_debt_company = initial_debt_company + ?
                    WHERE id = ?
                """, (amount, amount, contact_id))

    # 2. Hoàn tác công nợ khách hàng khi xóa phiếu thu nợ
    elif cb_type in ("in", "thu") and (
        category == "Thu nợ khách hàng" or
        ref_type in ("contact_debt", "customer_debt", "order_debt") or
        code.startswith("PT-CN")
    ):
        if contact_id and amount > 0:
            cur.execute("UPDATE contacts SET debt = debt + ? WHERE id = ?", (amount, contact_id))
            if ref_type == "order_debt" and ref_id:
                cur.execute("UPDATE orders SET debt_amount = debt_amount + ?, paid_amount = MAX(0.0, paid_amount - ?) WHERE id = ?", (amount, amount, ref_id))

    # 3. Hoàn tác Ví Spa & điểm tích lũy khi xóa phiếu thu Nạp Ví (topup)
    if cb_type in ("in", "thu") and (
        ref_type == "topup" or (code and code.startswith("PT-VI")) or ("nạp ví" in category.lower())
    ):
        tx = None
        if ref_id:
            cur.execute("SELECT * FROM spa_wallet_transactions WHERE id = ?", (ref_id,))
            tx = cur.fetchone()
        if not tx and contact_id:
            cur.execute("SELECT * FROM spa_wallet_transactions WHERE contact_id = ? ORDER BY id DESC LIMIT 1", (contact_id,))
            tx = cur.fetchone()

        if tx:
            tx_id = tx["id"]
            tx_contact_id = tx["contact_id"] or contact_id
            wallet_added = float(tx["amount"] or 0.0)
            pts_earned = int(tx["points_earned"] or 0)

            cur.execute("""
                UPDATE contacts 
                SET spa_wallet_balance = MAX(0.0, COALESCE(spa_wallet_balance, 0) - ?),
                    points = MAX(0, COALESCE(points, 0) - ?)
                WHERE id = ?
            """, (wallet_added, pts_earned, tx_contact_id))

            # Cập nhật lại hạng khách hàng theo số điểm mới
            cur.execute("SELECT points FROM contacts WHERE id = ?", (tx_contact_id,))
            c_row = cur.fetchone()
            if c_row:
                new_points = c_row["points"] or 0
                cur.execute("""
                    SELECT id FROM customer_segments
                    WHERE is_active = 1 AND allow_points = 1 AND min_points <= ?
                    ORDER BY min_points DESC, priority DESC, id DESC LIMIT 1
                """, (new_points,))
                seg_row = cur.fetchone()
                seg_id = seg_row["id"] if seg_row else None
                cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (seg_id, tx_contact_id))

            cur.execute("DELETE FROM spa_wallet_transactions WHERE id = ?", (tx_id,))

    cur.execute("UPDATE expense_requests SET status = 'pending', cashbook_id = NULL WHERE cashbook_id = ?", (voucher_id,))
    from services.payroll_service import on_cashbook_deleted
    on_cashbook_deleted(cur, voucher_id)
    cur.execute("DELETE FROM cashbook WHERE id = ?", (voucher_id,))
    conn.commit()
    conn.close()

    v_title = "phiếu thu" if cb_type in ("in", "thu") else "phiếu chi"
    logger.info(f"User {user.get('username') if isinstance(user, dict) else ''} đã xóa {v_title} {code} (id={voucher_id}) và hoàn tác công nợ liên quan")
    return {"success": True, "message": f"Đã xóa thành công {v_title} {code} và cập nhật lại công nợ"}

@router.post("/api/cashbook/transfer")
def transfer_cashbook_funds(req: CashbookTransferCreate, user=Depends(get_current_user)):
    if req.from_account_id == req.to_account_id:
        raise HTTPException(status_code=400, detail="Tài khoản nguồn và tài khoản đích không được trùng nhau")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền chuyển phải lớn hơn 0")

    conn = get_db()
    cur = conn.cursor()
    try:
        # Kiểm tra 2 tài khoản
        cur.execute("SELECT id, name, code, owner_type FROM payment_accounts WHERE id = ? AND is_active = 1", (req.from_account_id,))
        from_acc = cur.fetchone()
        if not from_acc:
            conn.close()
            raise HTTPException(status_code=400, detail="Tài khoản nguồn không tồn tại hoặc đã bị khóa")

        cur.execute("SELECT id, name, code, owner_type FROM payment_accounts WHERE id = ? AND is_active = 1", (req.to_account_id,))
        to_acc = cur.fetchone()
        if not to_acc:
            conn.close()
            raise HTTPException(status_code=400, detail="Tài khoản đích không tồn tại hoặc đã bị khóa")

        # Sinh mã giao dịch chuyển tiền
        user_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        if req.created_at and req.created_at.strip():
            created_at_val = req.created_at.strip()
            if " " not in created_at_val:
                now_time = datetime.now().strftime("%H:%M:%S")
                created_at_val = f"{created_at_val} {now_time}"
            d_part = created_at_val.split()[0]
            try:
                date_str = datetime.strptime(d_part, "%Y-%m-%d").strftime("%y%m%d")
            except Exception:
                date_str = datetime.now().strftime("%y%m%d")
        else:
            created_at_val = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            date_str = datetime.now().strftime("%y%m%d")

        pattern = f"PC-CK-{date_str}-%"
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE code LIKE ?", (pattern,))
        count = cur.fetchone()[0]
        stt = count + 1
        while True:
            transfer_code = f"CK-{date_str}-{stt:03d}"
            pc_code = f"PC-{transfer_code}"
            pt_code = f"PT-{transfer_code}"
            cur.execute("SELECT 1 FROM cashbook WHERE code = ? OR code = ?", (pc_code, pt_code))
            if not cur.fetchone():
                break
            stt += 1

        user_note = req.note.strip() if req.note else ""
        from_note = f"Chuyển sang [{to_acc['name']}]: {user_note}".rstrip(": ")
        to_note = f"Nhận từ [{from_acc['name']}]: {user_note}".rstrip(": ")

        # 1. Phiếu Chi (tại tài khoản nguồn)
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, account_id, ref_type, note, created_by, created_at)
            VALUES (?, 'out', 'Chuyển tiền nội bộ', ?, ?, 'fund_transfer', ?, ?, ?)
        """, (pc_code, req.amount, req.from_account_id, from_note, user_name, created_at_val))
        out_id = cur.lastrowid

        # 2. Phiếu Thu (tại tài khoản đích)
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, account_id, ref_type, note, created_by, created_at)
            VALUES (?, 'in', 'Chuyển tiền nội bộ', ?, ?, 'fund_transfer', ?, ?, ?)
        """, (pt_code, req.amount, req.to_account_id, to_note, user_name, created_at_val))
        in_id = cur.lastrowid

        conn.commit()
        conn.close()

        logger.info(f"User {user.get('name')} đã chuyển quỹ {req.amount:,.0f} đ từ {from_acc['name']} sang {to_acc['name']} (Mã: {transfer_code})")
        return {
            "success": True,
            "transfer_code": transfer_code,
            "out_voucher": {"id": out_id, "code": pc_code, "account_name": from_acc["name"]},
            "in_voucher": {"id": in_id, "code": pt_code, "account_name": to_acc["name"]},
            "amount": req.amount
        }
    except HTTPException:
        conn.rollback()
        conn.close()
        raise
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Lỗi chuyển quỹ nội bộ: {str(e)}")

# --- Danh mục Hạng mục Thu Chi (Cashbook Categories) ---
@router.get("/api/cashbook/categories")
def list_cashbook_categories(type: Optional[str] = Query(None, description="in, out, both, all")):
    conn = get_db()
    cur = conn.cursor()
    query = """
        SELECT cc.id, cc.name, cc.type, cc.sort_order, cc.created_at,
               COUNT(c.id) as voucher_count
        FROM cashbook_categories cc
        LEFT JOIN cashbook c ON c.category = cc.name
    """
    params = []
    if type and type not in ("all", "both"):
        query += " WHERE cc.type IN (?, 'both')"
        params.append(type)
    query += " GROUP BY cc.id, cc.name ORDER BY cc.sort_order ASC, cc.id ASC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

@router.post("/api/cashbook/categories")
def create_cashbook_category(payload: CashbookCategoryCreate, user=Depends(require_permission("cashbook.manage"))):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên hạng mục không được để trống")
    c_type = payload.type if payload.type in ("in", "out", "both") else "both"

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM cashbook_categories WHERE LOWER(name) = LOWER(?)", (name,))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Hạng mục '{name}' đã tồn tại")

    cur.execute("INSERT INTO cashbook_categories (name, type, sort_order) VALUES (?, ?, ?)",
                (name, c_type, payload.sort_order or 0))
    new_id = cur.lastrowid
    conn.commit()
    cur.execute("SELECT id, name, type, sort_order, created_at FROM cashbook_categories WHERE id = ?", (new_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row

@router.put("/api/cashbook/categories/{cat_id}")
def update_cashbook_category(cat_id: int, payload: CashbookCategoryUpdate, user=Depends(require_permission("cashbook.manage"))):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên hạng mục không được để trống")
    c_type = payload.type if payload.type in ("in", "out", "both") else "both"

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM cashbook_categories WHERE id = ?", (cat_id,))
    existing = cur.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục")
    old_name = existing["name"]

    cur.execute("SELECT id FROM cashbook_categories WHERE LOWER(name) = LOWER(?) AND id != ?", (name, cat_id))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Hạng mục '{name}' đã tồn tại")

    cur.execute("UPDATE cashbook_categories SET name = ?, type = ?, sort_order = ? WHERE id = ?",
                (name, c_type, payload.sort_order or 0, cat_id))
    # Cập nhật tên mới trong các phiếu cashbook cũ
    if old_name != name:
        cur.execute("UPDATE cashbook SET category = ? WHERE category = ?", (name, old_name))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã cập nhật hạng mục '{name}'"}

@router.delete("/api/cashbook/categories/{cat_id}")
def delete_cashbook_category(cat_id: int, user=Depends(require_permission("cashbook.manage"))):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, name, type FROM cashbook_categories WHERE id = ?", (cat_id,))
    cat = cur.fetchone()
    if not cat:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục")

    fallback = "Thu khác" if cat["type"] == "in" else "Chi khác"
    cur.execute("UPDATE cashbook SET category = ? WHERE category = ?", (fallback, cat["name"]))
    cur.execute("DELETE FROM cashbook_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã xóa hạng mục '{cat['name']}'"}

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
    # Tong hoa hong nhan vien (doanh thu thuần, bỏ đơn nháp, trừ hàng trả)
    from services.commission import sales_commission_by_staff
    total_comm = sum(v["commission"] for v in sales_commission_by_staff(cur, "2000-01-01 00:00:00", "2100-12-31 23:59:59").values())

    conn.close()
    return {
        "revenue": order_stat["revenue"],
        "customer_debt": order_stat["customer_debt"],
        "cash_balance": total_in - total_out,
        "supplier_debt": supplier_debt,
        "commission_paid": total_comm
    }

# ====================================================
# BÁO CÁO KINH DOANH ĐA CHIỀU & VISUAL ANALYTICS API
# ====================================================
@router.get("/api/reports/analytics")
def get_reports_analytics(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    cat_mode: str = "exclude",
    cat_list: Optional[str] = None,
    user=Depends(get_current_user)
):
    """
    Truy vấn báo cáo phân tích kinh doanh đa chiều (Tinh hoa KiotViet + POS PetCare):
    - 6 KPI chuẩn kế toán KiotViet (Số hóa đơn, Doanh thu, Giá trị trả, Doanh thu thuần, Tổng giá vốn, Lợi nhuận gộp) + TB/ngày + % So với kỳ trước
    - 3 KPI dòng tiền & vận hành POS PetCare (Thực thu tại quầy, Công nợ phát sinh, Cơ cấu Hàng hóa / Spa / Khách sạn)
    - Bộ lọc Thêm / Loại trừ Nhóm hàng hóa & Dịch vụ đặc biệt (cat_mode='exclude'|'include', cat_list='Thú Cưng||Vận chuyển')
    - Timeline 4 đường chuẩn KiotViet (Doanh thu, Trả hàng, Tổng giá vốn, Lợi nhuận gộp) + bóc tách kênh
    """
    from datetime import timedelta
    import json as json_mod

    now = datetime.now()
    if not from_date:
        from_date = now.strftime("%Y-%m-%d")
    if not to_date:
        to_date = now.strftime("%Y-%m-%d")

    try:
        d_start = datetime.strptime(from_date, "%Y-%m-%d").date()
        d_end = datetime.strptime(to_date, "%Y-%m-%d").date()
    except Exception:
        d_start = now.date()
        d_end = now.date()
    if d_end < d_start:
        d_start, d_end = d_end, d_start

    days_count = max(1, (d_end - d_start).days + 1)
    prev_end = d_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days_count - 1)

    selected_cats = set(
        [c.strip() for c in (cat_list or "").split("||") if c.strip()]
    )
    mode_clean = "include" if (cat_mode or "").strip().lower() == "include" else "exclude"

    def is_cat_allowed(cat_name: str) -> bool:
        c = (cat_name or "Khác").strip() or "Khác"
        if not selected_cats:
            return True
        if mode_clean == "exclude":
            return c not in selected_cats
        return c in selected_cats

    conn = get_db()
    cur = conn.cursor()

    # Lấy toàn bộ danh mục Nhóm hàng đang có trong hệ thống + 2 nhóm dịch vụ đặc thù
    cur.execute("SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), 'Khác') as cat FROM products ORDER BY cat ASC")
    all_db_cats = [r["cat"] for r in cur.fetchall()]
    for special_c in ["Dịch vụ Spa & Grooming", "Khách sạn thú cưng"]:
        if special_c not in all_db_cats:
            all_db_cats.append(special_c)

    def compute_period_metrics(p_from_str: str, p_to_str: str, collect_details: bool = False):
        p_from_dt = f"{p_from_str} 00:00:00"
        p_to_dt = f"{p_to_str} 23:59:59"

        daily_map = {}
        cat_stats = {}
        prod_stats = {}
        staff_stats = {}
        payment_map = {}

        def add_daily(d_str, rev=0.0, ret=0.0, cost=0.0, orders=0, goods=0.0, spa=0.0, hotel=0.0):
            if d_str not in daily_map:
                daily_map[d_str] = {
                    "revenue": 0.0, "returns": 0.0, "cost": 0.0, "orders": 0,
                    "goods_rev": 0.0, "spa_rev": 0.0, "hotel_rev": 0.0
                }
            daily_map[d_str]["revenue"] += rev
            daily_map[d_str]["returns"] += ret
            daily_map[d_str]["cost"] += cost
            daily_map[d_str]["orders"] += orders
            daily_map[d_str]["goods_rev"] += goods
            daily_map[d_str]["spa_rev"] += spa
            daily_map[d_str]["hotel_rev"] += hotel

        def add_cat(cat_name, ch_type, rev=0.0, cost=0.0, ret=0.0, qty=0.0):
            c = (cat_name or "Khác").strip() or "Khác"
            if c not in cat_stats:
                cat_stats[c] = {"category": c, "channel": ch_type, "revenue": 0.0, "cost": 0.0, "returns": 0.0, "qty": 0.0}
            cat_stats[c]["revenue"] += rev
            cat_stats[c]["cost"] += cost
            cat_stats[c]["returns"] += ret
            cat_stats[c]["qty"] += qty

        # 1. Đơn hàng POS (orders + order_items)
        cur.execute("""
            SELECT o.id, o.code, o.staff_id, COALESCE(s.name, 'Quản trị viên') as staff_name,
                   o.total_amount, o.discount, o.shipping_fee, o.final_amount,
                   o.paid_amount, o.debt_amount, o.commission_amount, o.spa_wallet_deduction,
                   strftime('%Y-%m-%d', datetime(o.created_at, '+7 hours')) as raw_date
            FROM orders o
            LEFT JOIN staff s ON o.staff_id = s.id
            WHERE datetime(o.created_at, '+7 hours') >= ? AND datetime(o.created_at, '+7 hours') <= ?
              AND COALESCE(o.status, 'completed') != 'cancelled'
        """, (p_from_dt, p_to_dt))
        orders_rows = cur.fetchall()
        orders_by_id = {r["id"]: dict(r) for r in orders_rows}

        cur.execute("""
            SELECT oi.order_id, oi.product_id, oi.quantity, oi.price, oi.subtotal, oi.unit_ratio,
                   COALESCE(p.code, 'SP') as p_code,
                   COALESCE(p.name, 'Sản phẩm') as p_name,
                   COALESCE(NULLIF(TRIM(p.category), ''), 'Khác') as category,
                   COALESCE(p.type, 'product') as p_type,
                   COALESCE(p.unit, 'Cái') as p_unit,
                   COALESCE(p.cost_price, 0) as cost_price
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE datetime(o.created_at, '+7 hours') >= ? AND datetime(o.created_at, '+7 hours') <= ?
              AND COALESCE(o.status, 'completed') != 'cancelled'
        """, (p_from_dt, p_to_dt))
        oi_rows = cur.fetchall()

        items_by_order = {}
        for it in oi_rows:
            items_by_order.setdefault(it["order_id"], []).append(dict(it))

        pos_orders_count = 0
        pos_rev = 0.0
        pos_cost = 0.0
        pos_paid = 0.0
        pos_debt = 0.0
        goods_rev = 0.0
        goods_qty = 0.0
        services_rev = 0.0
        services_qty = 0.0
        order_kept_ratio = {}

        for oid, o in orders_by_id.items():
            o_items = items_by_order.get(oid, [])
            raw_total = sum(float(x["subtotal"] or 0) for x in o_items) or float(o["total_amount"] or 0) or 1.0
            disc_factor = float(o["final_amount"] or 0) / raw_total if raw_total > 0 else 1.0

            # Ghi nhận thống kê cho tất cả nhóm hàng (để hiển thị trong bảng Ma trận Nhóm hàng kể cả khi bị gạch bỏ)
            kept_sub = 0.0
            kept_cost = 0.0
            kept_goods = 0.0
            kept_serv = 0.0

            for x in o_items:
                cat = x["category"]
                sub_net = float(x["subtotal"] or 0) * disc_factor
                ratio = float(x["unit_ratio"] or 1.0)
                c_amt = float(x["quantity"] or 0) * ratio * float(x["cost_price"] or 0)
                ch_type = "spa" if x["p_type"] == "service" else "goods"
                if collect_details:
                    add_cat(cat, ch_type, rev=sub_net, cost=c_amt, qty=float(x["quantity"] or 0))

                if is_cat_allowed(cat):
                    kept_sub += sub_net
                    kept_cost += c_amt
                    if x["p_type"] == "service":
                        services_rev += sub_net
                        services_qty += float(x["quantity"] or 0)
                        kept_serv += sub_net
                    else:
                        goods_rev += sub_net
                        goods_qty += float(x["quantity"] or 0)
                        kept_goods += sub_net

                    if collect_details:
                        pid = x["product_id"] or 0
                        if pid not in prod_stats:
                            prod_stats[pid] = {
                                "product_id": pid, "code": x["p_code"], "name": x["p_name"],
                                "category": cat, "type": x["p_type"], "unit": x["p_unit"],
                                "qty_sold": 0.0, "revenue": 0.0, "cost": 0.0
                            }
                        prod_stats[pid]["qty_sold"] += float(x["quantity"] or 0)
                        prod_stats[pid]["revenue"] += sub_net
                        prod_stats[pid]["cost"] += c_amt

            if kept_sub > 0 or not o_items:
                pos_orders_count += 1
                share = (kept_sub / float(o["final_amount"] or 1.0)) if float(o["final_amount"] or 0) > 0 else 1.0
                share = min(1.0, max(0.0, share))
                order_kept_ratio[oid] = share
                o_paid = float(o["paid_amount"] or 0) * share
                o_debt = float(o["debt_amount"] or 0) * share
                pos_rev += kept_sub
                pos_cost += kept_cost
                pos_paid += o_paid
                pos_debt += o_debt
                add_daily(o["raw_date"], rev=kept_sub, cost=kept_cost, orders=1, goods=kept_goods, spa=kept_serv)

                if collect_details:
                    sid = o["staff_id"] or 1
                    if sid not in staff_stats:
                        staff_stats[sid] = {
                            "staff_id": sid, "staff_name": o["staff_name"],
                            "order_count": 0, "revenue": 0.0, "paid_revenue": 0.0, "commission": 0.0
                        }
                    staff_stats[sid]["order_count"] += 1
                    staff_stats[sid]["revenue"] += kept_sub
                    staff_stats[sid]["paid_revenue"] += o_paid
                    staff_stats[sid]["commission"] += float(o["commission_amount"] or 0) * share

        # 2. Giá trị trả hàng (order_returns + order_return_items)
        cur.execute("""
            SELECT ori.return_id, ori.product_id, ori.quantity, ori.subtotal,
                   COALESCE(NULLIF(TRIM(p.category), ''), 'Khác') as category,
                   COALESCE(p.cost_price, 0) as cost_price,
                   strftime('%Y-%m-%d', datetime(r.created_at, '+7 hours')) as raw_date
            FROM order_return_items ori
            JOIN order_returns r ON ori.return_id = r.id
            LEFT JOIN products p ON ori.product_id = p.id
            WHERE datetime(r.created_at, '+7 hours') >= ? AND datetime(r.created_at, '+7 hours') <= ?
        """, (p_from_dt, p_to_dt))
        ret_rows = cur.fetchall()
        total_returns = 0.0
        returned_cost = 0.0
        for rr in ret_rows:
            r_cat = rr["category"]
            r_sub = float(rr["subtotal"] or 0)
            r_cost = float(rr["quantity"] or 0) * float(rr["cost_price"] or 0)
            if collect_details:
                add_cat(r_cat, "goods", ret=r_sub)
            if is_cat_allowed(r_cat):
                total_returns += r_sub
                returned_cost += r_cost
                add_daily(rr["raw_date"], ret=r_sub, cost=-r_cost)

        # 3. Vé Dịch vụ Spa (pet_service_tickets)
        spa_rev = 0.0
        spa_cost = 0.0
        spa_paid = 0.0
        spa_debt = 0.0
        spa_count = 0
        cur.execute("""
            SELECT id, code, price, services_json, tip_amount, deposit_amount,
                   spa_wallet_deduction, payment_method, payment_status, ticket_date, staff_worker_1
            FROM pet_service_tickets
            WHERE ticket_date >= ? AND ticket_date <= ?
              AND (payment_status = 'paid' OR status IN ('completed', 'checked_out', 'done'))
              AND COALESCE(status, '') != 'cancelled'
        """, (p_from_str, p_to_str))
        for st in cur.fetchall():
            t_price = float(st["price"] or 0.0)
            t_tip = float(st["tip_amount"] or 0.0)
            t_dep = float(st["deposit_amount"] or 0.0)
            t_wallet = float(st["spa_wallet_deduction"] or 0.0)
            t_date = st["ticket_date"] or p_from_str
            shop_rev = max(0.0, t_price - t_tip)
            est_spa_cost = round(shop_rev * 0.18, 0)  # Chi phí vật tư/sữa tắm/khấu hao Spa (~18%)

            if collect_details:
                add_cat("Dịch vụ Spa & Grooming", "spa", rev=shop_rev, cost=est_spa_cost, qty=1)

            if is_cat_allowed("Dịch vụ Spa & Grooming") or is_cat_allowed("Dịch vụ Spa combo") or is_cat_allowed("Dịch Vụ spa lẻ"):
                spa_count += 1
                spa_rev += shop_rev
                spa_cost += est_spa_cost
                services_rev += shop_rev
                services_qty += 1
                if st["payment_status"] == "paid":
                    spa_paid += shop_rev
                else:
                    spa_paid += min(t_dep, shop_rev)
                    spa_debt += max(0.0, shop_rev - t_dep)
                add_daily(t_date, rev=shop_rev, cost=est_spa_cost, orders=1, spa=shop_rev)

                if collect_details and st["payment_status"] == "paid":
                    p_method = st["payment_method"] or "cash"
                    if t_wallet > 0:
                        payment_map["wallet"] = payment_map.get("wallet", {"count": 0, "amount": 0.0})
                        payment_map["wallet"]["count"] += 1
                        payment_map["wallet"]["amount"] += t_wallet
                    rem = max(0.0, shop_rev - t_wallet)
                    if rem > 0:
                        c_m = "bank" if p_method in ("transfer", "card") else "cash"
                        payment_map[c_m] = payment_map.get(c_m, {"count": 0, "amount": 0.0})
                        payment_map[c_m]["count"] += 1
                        payment_map[c_m]["amount"] += rem

        # 4. Phiếu Khách sạn thú cưng (hotel_bookings)
        hotel_rev = 0.0
        hotel_cost = 0.0
        hotel_paid = 0.0
        hotel_debt = 0.0
        hotel_count = 0
        cur.execute("""
            SELECT id, code, total_amount, deposit_amount, status,
                   strftime('%Y-%m-%d', datetime(created_at, '+7 hours')) as raw_date
            FROM hotel_bookings
            WHERE datetime(created_at, '+7 hours') >= ? AND datetime(created_at, '+7 hours') <= ?
              AND COALESCE(status, '') != 'cancelled'
        """, (p_from_dt, p_to_dt))
        for hb in cur.fetchall():
            h_amt = float(hb["total_amount"] or 0.0)
            h_dep = float(hb["deposit_amount"] or 0.0)
            h_cost = round(h_amt * 0.15, 0)  # Chi phí thức ăn/vệ sinh lưu chuồng (~15%)
            if collect_details:
                add_cat("Khách sạn thú cưng", "hotel", rev=h_amt, cost=h_cost, qty=1)

            if is_cat_allowed("Khách sạn thú cưng") or is_cat_allowed("Khách sạn"):
                hotel_count += 1
                hotel_rev += h_amt
                hotel_cost += h_cost
                if hb["status"] == "completed":
                    hotel_paid += h_amt
                else:
                    hotel_paid += min(h_dep, h_amt)
                    hotel_debt += max(0.0, h_amt - h_dep)
                add_daily(hb["raw_date"] or p_from_str, rev=h_amt, cost=h_cost, orders=1, hotel=h_amt)
                if collect_details and hb["status"] == "completed" and h_amt > 0:
                    payment_map["bank"] = payment_map.get("bank", {"count": 0, "amount": 0.0})
                    payment_map["bank"]["count"] += 1
                    payment_map["bank"]["amount"] += h_amt

        # 5. Kênh thanh toán đơn POS
        if collect_details:
            cur.execute("""
                SELECT op.order_id, op.method, op.amount
                FROM order_payments op
                JOIN orders o ON op.order_id = o.id
                WHERE datetime(o.created_at, '+7 hours') >= ? AND datetime(o.created_at, '+7 hours') <= ?
                  AND COALESCE(o.status, 'completed') != 'cancelled'
            """, (p_from_dt, p_to_dt))
            for op in cur.fetchall():
                oid = op["order_id"]
                if oid not in order_kept_ratio:
                    continue
                scaled_amt = float(op["amount"] or 0) * order_kept_ratio[oid]
                if scaled_amt <= 0:
                    continue
                m = op["method"] or "cash"
                payment_map[m] = payment_map.get(m, {"count": 0, "amount": 0.0})
                payment_map[m]["count"] += 1
                payment_map[m]["amount"] += scaled_amt

            for oid, share in order_kept_ratio.items():
                o = orders_by_id.get(oid)
                w_ded = float((o or {}).get("spa_wallet_deduction") or 0) * share
                if w_ded > 0:
                    payment_map["wallet"] = payment_map.get("wallet", {"count": 0, "amount": 0.0})
                    payment_map["wallet"]["count"] += 1
                    payment_map["wallet"]["amount"] += w_ded

        gross_rev = pos_rev + spa_rev + hotel_rev
        net_rev = max(0.0, gross_rev - total_returns)
        total_cost = max(0.0, pos_cost + spa_cost + hotel_cost - returned_cost)
        gross_profit = net_rev - total_cost
        total_orders = pos_orders_count + spa_count + hotel_count
        total_paid = pos_paid + spa_paid + hotel_paid
        total_debt = pos_debt + spa_debt + hotel_debt

        return {
            "order_count": total_orders,
            "gross_revenue": gross_rev,
            "return_amount": total_returns,
            "net_revenue": net_rev,
            "total_cost": total_cost,
            "gross_profit": gross_profit,
            "total_paid": total_paid,
            "total_debt": total_debt,
            "goods_rev": goods_rev,
            "goods_qty": goods_qty,
            "services_rev": services_rev,
            "services_qty": services_qty,
            "hotel_rev": hotel_rev,
            "hotel_count": hotel_count,
            "daily_map": daily_map,
            "cat_stats": cat_stats,
            "prod_stats": prod_stats,
            "staff_stats": staff_stats,
            "payment_map": payment_map,
        }

    cur_m = compute_period_metrics(from_date, to_date, collect_details=True)
    prev_m = compute_period_metrics(prev_start.strftime("%Y-%m-%d"), prev_end.strftime("%Y-%m-%d"), collect_details=False)

    def calc_growth(cur_val: float, prev_val: float) -> float:
        if prev_val <= 0:
            return 100.0 if cur_val > 0 else 0.0
        return round(((cur_val - prev_val) / prev_val) * 100.0, 2)

    # Xây dựng timeline đầy đủ từng ngày trong kỳ (4 đường KiotViet + 3 kênh)
    timeline_rows = []
    for day_idx in range(days_count):
        d_obj = d_start + timedelta(days=day_idx)
        d_str = d_obj.strftime("%Y-%m-%d")
        d_lbl = d_obj.strftime("%d/%m")
        dm = cur_m["daily_map"].get(d_str, {})
        d_rev = round(dm.get("revenue", 0.0), 0)
        d_ret = round(dm.get("returns", 0.0), 0)
        d_net = max(0.0, d_rev - d_ret)
        d_cost = round(max(0.0, dm.get("cost", 0.0)), 0)
        d_prof = d_net - d_cost
        timeline_rows.append({
            "label": d_lbl,
            "raw_date": d_str,
            "revenue": d_rev,
            "returns": d_ret,
            "net_revenue": d_net,
            "cost": d_cost,
            "profit": d_prof,
            "orders": dm.get("orders", 0),
            "goods_rev": round(dm.get("goods_rev", 0.0), 0),
            "spa_rev": round(dm.get("spa_rev", 0.0), 0),
            "hotel_rev": round(dm.get("hotel_rev", 0.0), 0),
        })

    # Chuẩn hóa danh sách kênh thanh toán
    method_names = {
        "cash": "Tiền mặt",
        "transfer": "Chuyển khoản (VietQR)",
        "bank": "Chuyển khoản (VietQR)",
        "card": "Thẻ quẹt POS",
        "wallet": "Cấn trừ Ví Spa",
        "ewallet": "Ví điện tử",
        "pos_card": "Thẻ quẹt POS"
    }
    merged_pay = {}
    for m_code, val in cur_m["payment_map"].items():
        norm_code = "transfer" if m_code in ("transfer", "bank") else m_code
        if norm_code not in merged_pay:
            merged_pay[norm_code] = {"method": norm_code, "name": method_names.get(norm_code, norm_code.upper()), "count": 0, "amount": 0.0}
        merged_pay[norm_code]["count"] += val["count"]
        merged_pay[norm_code]["amount"] += val["amount"]

    total_pay_sum = sum(p["amount"] for p in merged_pay.values()) or 1.0
    payments_list = []
    for p in merged_pay.values():
        p["pct"] = round((p["amount"] / total_pay_sum) * 100.0, 1)
        payments_list.append(p)
    payments_list.sort(key=lambda x: x["amount"], reverse=True)

    # Danh sách Ma trận Nhóm hàng (bao gồm cả nhóm có phát sinh và nhóm trong kho)
    categories_breakdown = []
    for c_name, st in cur_m["cat_stats"].items():
        c_net = max(0.0, st["revenue"] - st["returns"])
        c_prof = c_net - st["cost"]
        c_margin = round((c_prof / c_net) * 100.0, 1) if c_net > 0 else 0.0
        categories_breakdown.append({
            "category": c_name,
            "channel": st["channel"],
            "revenue": round(st["revenue"], 0),
            "returns": round(st["returns"], 0),
            "net_revenue": round(c_net, 0),
            "cost": round(st["cost"], 0),
            "profit": round(c_prof, 0),
            "margin_pct": c_margin,
            "qty": st["qty"],
            "is_included": is_cat_allowed(c_name)
        })
    categories_breakdown.sort(key=lambda x: x["revenue"], reverse=True)

    top_products = sorted(cur_m["prod_stats"].values(), key=lambda x: (x["revenue"], x["qty_sold"]), reverse=True)[:20]
    staff_rows = sorted(cur_m["staff_stats"].values(), key=lambda x: x["revenue"], reverse=True)
    total_comm = sum(s["commission"] for s in staff_rows)
    aov = round(cur_m["net_revenue"] / cur_m["order_count"]) if cur_m["order_count"] > 0 else 0

    conn.close()

    return {
        "range": {
            "from_date": from_date,
            "to_date": to_date,
            "days_count": days_count,
            "prev_from": prev_start.strftime("%Y-%m-%d"),
            "prev_to": prev_end.strftime("%Y-%m-%d"),
        },
        "all_categories": all_db_cats,
        "categories_breakdown": categories_breakdown,
        "summary": {
            "order_count": cur_m["order_count"],
            "avg_orders_per_day": round(cur_m["order_count"] / days_count, 2),
            "growth_orders": calc_growth(cur_m["order_count"], prev_m["order_count"]),

            "gross_revenue": cur_m["gross_revenue"],
            "avg_gross_per_day": round(cur_m["gross_revenue"] / days_count, 0),
            "growth_gross": calc_growth(cur_m["gross_revenue"], prev_m["gross_revenue"]),

            "return_amount": cur_m["return_amount"],
            "avg_return_per_day": round(cur_m["return_amount"] / days_count, 0),
            "growth_return": calc_growth(cur_m["return_amount"], prev_m["return_amount"]),

            "total_revenue": cur_m["net_revenue"],
            "net_revenue": cur_m["net_revenue"],
            "avg_net_per_day": round(cur_m["net_revenue"] / days_count, 0),
            "growth_net": calc_growth(cur_m["net_revenue"], prev_m["net_revenue"]),

            "total_cost": cur_m["total_cost"],
            "avg_cost_per_day": round(cur_m["total_cost"] / days_count, 0),
            "growth_cost": calc_growth(cur_m["total_cost"], prev_m["total_cost"]),

            "gross_profit": cur_m["gross_profit"],
            "avg_profit_per_day": round(cur_m["gross_profit"] / days_count, 0),
            "growth_profit": calc_growth(cur_m["gross_profit"], prev_m["gross_profit"]),
            "margin_pct": round((cur_m["gross_profit"] / cur_m["net_revenue"]) * 100.0, 1) if cur_m["net_revenue"] > 0 else 0.0,

            "total_paid": cur_m["total_paid"],
            "total_debt": cur_m["total_debt"],
            "total_commission": total_comm,
            "aov": aov
        },
        "timeline": timeline_rows,
        "payments": payments_list,
        "goods_vs_services": {
            "goods_revenue": cur_m["goods_rev"],
            "goods_items_sold": cur_m["goods_qty"],
            "services_revenue": cur_m["services_rev"],
            "services_items_sold": cur_m["services_qty"],
            "hotel_revenue": cur_m["hotel_rev"],
            "hotel_bookings": cur_m["hotel_count"]
        },
        "staff_performance": staff_rows,
        "top_products": top_products
    }

@router.get("/api/reports/export-excel")
def export_reports_excel(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Xuất file Excel báo cáo kinh doanh tổng hợp nhiều bảng định dạng chuẩn."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO

    data = get_reports_analytics(from_date, to_date, user)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "BaoCaoKinhDoanh"

    # Styling helpers
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    section_font = Font(name="Arial", size=11, bold=True, color="0F172A")
    title_font = Font(name="Arial", size=16, bold=True, color="0284C7")
    sub_font = Font(name="Arial", size=9, italic=True, color="64748B")
    bold_font = Font(name="Arial", size=10, bold=True)
    normal_font = Font(name="Arial", size=10)
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # 1. Tiêu đề báo cáo
    ws["A1"] = "BÁO CÁO PHÂN TÍCH TÌNH HÌNH KINH DOANH"
    ws["A1"].font = title_font
    ws["A2"] = f"Kỳ báo cáo: Từ {data['range']['from_date']} đến {data['range']['to_date']} (Xuất lúc: {datetime.now().strftime('%d/%m/%Y %H:%M')})"
    ws["A2"].font = sub_font

    # 2. Bảng Tóm tắt KPI
    ws["A4"] = "I. TỔNG QUAN KINH DOANH"
    ws["A4"].font = section_font
    ws["A4"].fill = section_fill

    kpi_headers = ["Chỉ số", "Giá trị"]
    for col_idx, h in enumerate(kpi_headers, 1):
        cell = ws.cell(row=5, column=col_idx, value=h)
        cell.fill = header_fill
        cell.font = header_font

    kpis = [
        ("Tổng Doanh Thu (Doanh số gộp)", f"{int(data['summary']['total_revenue']):,} đ"),
        ("Thực Thu Tại Quầy", f"{int(data['summary']['total_paid']):,} đ"),
        ("Công Nợ Phát Sinh", f"{int(data['summary']['total_debt']):,} đ"),
        ("Tổng Số Đơn Hàng", f"{data['summary']['order_count']} đơn"),
        ("Giá Trị Đơn Trung Bình (AOV)", f"{int(data['summary']['aov']):,} đ"),
        ("Tổng Hoa Hồng Nhân Viên", f"{int(data['summary']['total_commission']):,} đ")
    ]
    cur_row = 6
    for name, val in kpis:
        c1 = ws.cell(row=cur_row, column=1, value=name)
        c2 = ws.cell(row=cur_row, column=2, value=val)
        c1.font = normal_font; c1.border = thin_border
        c2.font = bold_font; c2.border = thin_border; c2.alignment = Alignment(horizontal='right')
        cur_row += 1

    # 3. Kênh thanh toán
    cur_row += 1
    ws.cell(row=cur_row, column=1, value="II. DÒNG TIỀN THEO PHƯƠNG THỨC THANH TOÁN").font = section_font
    ws.cell(row=cur_row, column=1).fill = section_fill
    cur_row += 1

    pay_headers = ["Phương thức", "Số giao dịch", "Số tiền (VNĐ)", "Tỷ trọng (%)"]
    for c_idx, h in enumerate(pay_headers, 1):
        cell = ws.cell(row=cur_row, column=c_idx, value=h)
        cell.fill = header_fill; cell.font = header_font
    cur_row += 1

    for p in data["payments"]:
        ws.cell(row=cur_row, column=1, value=p["name"]).border = thin_border
        c2 = ws.cell(row=cur_row, column=2, value=p["count"]); c2.border = thin_border; c2.alignment = Alignment(horizontal='center')
        c3 = ws.cell(row=cur_row, column=3, value=f"{int(p['amount']):,} đ"); c3.border = thin_border; c3.alignment = Alignment(horizontal='right')
        c4 = ws.cell(row=cur_row, column=4, value=f"{p['pct']}%"); c4.border = thin_border; c4.alignment = Alignment(horizontal='right')
        cur_row += 1

    # 4. Doanh số nhân viên
    cur_row += 1
    ws.cell(row=cur_row, column=1, value="III. DOANH SỐ THEO NHÂN VIÊN").font = section_font
    ws.cell(row=cur_row, column=1).fill = section_fill
    cur_row += 1

    staff_headers = ["Tên nhân viên", "Số đơn bán", "Tổng doanh số", "Thực thu", "Hoa hồng"]
    for c_idx, h in enumerate(staff_headers, 1):
        cell = ws.cell(row=cur_row, column=c_idx, value=h)
        cell.fill = header_fill; cell.font = header_font
    cur_row += 1

    for s in data["staff_performance"]:
        ws.cell(row=cur_row, column=1, value=s["staff_name"]).border = thin_border
        c2 = ws.cell(row=cur_row, column=2, value=s["order_count"]); c2.border = thin_border; c2.alignment = Alignment(horizontal='center')
        c3 = ws.cell(row=cur_row, column=3, value=f"{int(s['revenue']):,} đ"); c3.border = thin_border; c3.alignment = Alignment(horizontal='right')
        c4 = ws.cell(row=cur_row, column=4, value=f"{int(s['paid_revenue']):,} đ"); c4.border = thin_border; c4.alignment = Alignment(horizontal='right')
        c5 = ws.cell(row=cur_row, column=5, value=f"{int(s['commission']):,} đ"); c5.border = thin_border; c5.alignment = Alignment(horizontal='right')
        cur_row += 1

    # 5. Top sản phẩm bán chạy
    cur_row += 1
    ws.cell(row=cur_row, column=1, value="IV. TOP MẶT HÀNG BÁN CHẠY NHẤT").font = section_font
    ws.cell(row=cur_row, column=1).fill = section_fill
    cur_row += 1

    top_headers = ["Mã hàng", "Tên hàng hóa / Dịch vụ", "Loại", "ĐVT", "Số lượng bán", "Doanh thu"]
    for c_idx, h in enumerate(top_headers, 1):
        cell = ws.cell(row=cur_row, column=c_idx, value=h)
        cell.fill = header_fill; cell.font = header_font
    cur_row += 1

    for item in data["top_products"]:
        ws.cell(row=cur_row, column=1, value=item["code"]).border = thin_border
        ws.cell(row=cur_row, column=2, value=item["name"]).border = thin_border
        type_lbl = "💆 Dịch vụ" if item["type"] == "service" else "📦 Hàng hóa"
        ws.cell(row=cur_row, column=3, value=type_lbl).border = thin_border
        ws.cell(row=cur_row, column=4, value=item["unit"]).border = thin_border
        c5 = ws.cell(row=cur_row, column=5, value=item["qty_sold"]); c5.border = thin_border; c5.alignment = Alignment(horizontal='center')
        c6 = ws.cell(row=cur_row, column=6, value=f"{int(item['revenue']):,} đ"); c6.border = thin_border; c6.alignment = Alignment(horizontal='right')
        cur_row += 1

    # Căn chỉnh bề rộng cột tự động
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"BaoCao_KinhDoanh_{data['range']['from_date']}_{data['range']['to_date']}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# --- Phân Hệ: Dự Chi & Hoàn Ứng Nhân Viên (Expense Requests) ---

def generate_expense_request_code(cur, prefix: str = "YC") -> str:
    """Sinh mã yêu cầu chi theo định dạng: YC-{YYMMDD}-{STT:03d} (chống trùng mã vĩnh viễn)"""
    date_str = datetime.now().strftime("%y%m%d")
    pattern = f"{prefix}-{date_str}-%"
    
    cur.execute("""
        SELECT MAX(CAST(SUBSTR(code, LENGTH(?) + 2) AS INTEGER))
        FROM (
            SELECT code FROM expense_requests WHERE code LIKE ?
            UNION ALL
            SELECT code FROM archived_codes WHERE code LIKE ?
        )
    """, (f"{prefix}-{date_str}", pattern, pattern))
    row = cur.fetchone()
    max_stt = row[0] if row and row[0] is not None else 0
    stt = max_stt + 1

    while True:
        candidate = f"{prefix}-{date_str}-{stt:03d}"
        cur.execute("SELECT 1 FROM expense_requests WHERE code = ?", (candidate,))
        if not cur.fetchone() and not is_code_archived(cur, candidate):
            archive_code(cur, candidate, "expense_request")
            return candidate
        stt += 1

@router.get("/api/expense-requests")
def list_expense_requests(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    q: Optional[str] = Query(None)
):
    conn = get_db()
    cur = conn.cursor()

    conditions = []
    params = []

    if status:
        conditions.append("er.status = ?")
        params.append(status)
    if type:
        conditions.append("er.type = ?")
        params.append(type)
    if q:
        kw = f"%{q.strip()}%"
        conditions.append("(er.code LIKE ? OR er.employee_name LIKE ? OR er.category LIKE ? OR er.note LIKE ?)")
        params.extend([kw, kw, kw, kw])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT 
            er.*,
            cb.code as cashbook_code,
            pa.name as payment_account_name
        FROM expense_requests er
        LEFT JOIN cashbook cb ON er.cashbook_id = cb.id
        LEFT JOIN payment_accounts pa ON cb.account_id = pa.id
        {where_clause}
        ORDER BY er.id DESC
    """
    cur.execute(query, params)
    items = [dict(r) for r in cur.fetchall()]

    # Thống kê tổng hợp
    cur.execute("""
        SELECT
            SUM(CASE WHEN status = 'pending' AND type = 'reimbursement' THEN amount ELSE 0 END) as total_reimbursement_pending,
            SUM(CASE WHEN status = 'pending' AND type = 'planned' THEN amount ELSE 0 END) as total_planned_pending,
            SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_completed,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
        FROM expense_requests
    """)
    stats_row = cur.fetchone()
    stats = {
        "total_reimbursement_pending": stats_row["total_reimbursement_pending"] or 0.0,
        "total_planned_pending": stats_row["total_planned_pending"] or 0.0,
        "total_completed": stats_row["total_completed"] or 0.0,
        "pending_count": stats_row["pending_count"] or 0
    }

    conn.close()
    return {"items": items, "stats": stats}

@router.post("/api/expense-requests")
def create_expense_request(req: ExpenseRequestCreate, user=Depends(get_optional_user)):
    if not req.employee_name or not req.employee_name.strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập tên người đề xuất / nhân viên chi")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Số tiền yêu cầu phải lớn hơn 0")

    conn = get_db()
    cur = conn.cursor()
    code = generate_expense_request_code(cur)
    user_name = (user.get("name") if isinstance(user, dict) else None) or req.employee_name.strip()
    exp_date = req.expense_date or datetime.now().strftime("%Y-%m-%d")

    cur.execute("""
        INSERT INTO expense_requests (
            code, type, employee_name, amount, category, note, bill_image, bank_account_info, due_date, expense_date, created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    """, (
        code, req.type, req.employee_name.strip(), req.amount,
        req.category or "Chi khác", req.note or "", req.bill_image,
        req.bank_account_info, req.due_date, exp_date, user_name
    ))
    req_id = cur.lastrowid
    conn.commit()

    cur.execute("SELECT * FROM expense_requests WHERE id = ?", (req_id,))
    row = dict(cur.fetchone())
    conn.close()
    return row

@router.post("/api/expense-requests/{req_id}/approve")
def approve_expense_request(req_id: int, payload: ExpenseRequestApprove, user=Depends(get_optional_user)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM expense_requests WHERE id = ?", (req_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu chi")

    req = dict(row)
    if req["status"] != "pending":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Yêu cầu này không ở trạng thái chờ duyệt (hiện tại: {req['status']})")

    # Kiểm tra tài khoản thanh toán hợp lệ
    cur.execute("SELECT id, name FROM payment_accounts WHERE id = ? AND is_active = 1", (payload.account_id,))
    acc = cur.fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=400, detail="Tài khoản thanh toán không tồn tại hoặc đã bị khóa")

    # 1. Tự động sinh phiếu chi bên cashbook
    prefix = "PC-HO" if req["type"] == "reimbursement" else "PC-DC"
    cb_code = generate_cashbook_code(cur, prefix)
    
    if req["type"] == "reimbursement":
        cb_note = f"Hoàn ứng cho {req['employee_name']}: {payload.note or req['note'] or req['category']}".strip()
    else:
        cb_note = f"Dự chi giải ngân: {payload.note or req['note'] or req['category']}".strip()

    approver_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    cb_created_at = (req.get("expense_date") + " 12:00:00") if req.get("expense_date") else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cur.execute("""
        INSERT INTO cashbook (
            code, type, category, amount, account_id, ref_type, ref_id, note, created_by, created_at
        ) VALUES (?, 'out', ?, ?, ?, 'expense_request', ?, ?, ?, ?)
    """, (
        cb_code, req["category"], req["amount"], payload.account_id, req_id, cb_note, approver_name, cb_created_at
    ))
    cb_id = cur.lastrowid

    # 2. Cập nhật trạng thái expense_requests
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        UPDATE expense_requests
        SET status = 'completed', cashbook_id = ?, resolved_at = ?
        WHERE id = ?
    """, (cb_id, now_str, req_id))
    conn.commit()

    cur.execute("""
        SELECT er.*, cb.code as cashbook_code
        FROM expense_requests er
        LEFT JOIN cashbook cb ON er.cashbook_id = cb.id
        WHERE er.id = ?
    """, (req_id,))
    updated = dict(cur.fetchone())
    conn.close()
    return updated

@router.post("/api/expense-requests/batch-approve")
def batch_approve_expense_requests(payload: ExpenseRequestBatchApprove, user=Depends(get_optional_user)):
    if not payload.request_ids:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ít nhất 1 yêu cầu để duyệt chi")

    conn = get_db()
    cur = conn.cursor()

    # Kiểm tra tài khoản thanh toán hợp lệ
    cur.execute("SELECT id, name FROM payment_accounts WHERE id = ? AND is_active = 1", (payload.account_id,))
    acc = cur.fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=400, detail="Tài khoản thanh toán không tồn tại hoặc đã bị khóa")

    # Lấy danh sách các yêu cầu được chọn
    placeholders = ",".join("?" for _ in payload.request_ids)
    cur.execute(f"SELECT * FROM expense_requests WHERE id IN ({placeholders})", tuple(payload.request_ids))
    rows = [dict(r) for r in cur.fetchall()]

    if len(rows) != len(payload.request_ids):
        conn.close()
        raise HTTPException(status_code=400, detail="Một số yêu cầu không tồn tại trong hệ thống")

    # Kiểm tra tất cả đều ở trạng thái pending
    non_pending = [r["code"] for r in rows if r["status"] != "pending"]
    if non_pending:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Các yêu cầu sau không ở trạng thái chờ duyệt: {', '.join(non_pending)}"
        )

    # Tính tổng tiền và chuẩn bị thông tin phiếu chi
    total_amount = sum(float(r["amount"]) for r in rows)
    emp_names = list(dict.fromkeys(r["employee_name"] for r in rows if r.get("employee_name")))
    codes = [r["code"] for r in rows]
    types = list(dict.fromkeys(r["type"] for r in rows))

    # Sinh mã phiếu chi: nếu toàn bộ là hoàn ứng thì PC-HO, khác thì PC-DC
    prefix = "PC-HO" if len(types) == 1 and types[0] == "reimbursement" else "PC-DC"
    cb_code = generate_cashbook_code(cur, prefix)

    # Hạng mục chi tổng: lấy hạng mục chung nếu giống nhau, hoặc "Chi hoàn ứng nhân viên"
    cats = list(dict.fromkeys(r["category"] for r in rows if r.get("category")))
    cb_category = cats[0] if len(cats) == 1 else ("Hoàn ứng chi hộ nhân viên" if prefix == "PC-HO" else "Dự chi giải ngân")

    if payload.note:
        cb_note = payload.note.strip()
    else:
        emp_str = ", ".join(emp_names)
        cb_note = f"Hoàn ứng gộp {len(rows)} phiếu ({', '.join(codes)}) cho {emp_str}"

    approver_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
    cb_created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Tạo 1 Phiếu Chi cashbook gộp duy nhất
    cur.execute("""
        INSERT INTO cashbook (
            code, type, category, amount, account_id, ref_type, ref_id, note, created_by, created_at
        ) VALUES (?, 'out', ?, ?, ?, 'expense_request_batch', 0, ?, ?, ?)
    """, (
        cb_code, cb_category, total_amount, payload.account_id, cb_note, approver_name, cb_created_at
    ))
    cb_id = cur.lastrowid

    # 2. Cập nhật toàn bộ các expense_requests sang completed và trỏ về cashbook_id vừa tạo
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute(f"""
        UPDATE expense_requests
        SET status = 'completed', cashbook_id = ?, resolved_at = ?
        WHERE id IN ({placeholders})
    """, (cb_id, now_str, *payload.request_ids))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "cashbook_id": cb_id,
        "cashbook_code": cb_code,
        "approved_count": len(rows),
        "total_amount": total_amount,
        "note": cb_note
    }

@router.post("/api/expense-requests/{req_id}/cancel")
def cancel_expense_request(req_id: int):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM expense_requests WHERE id = ?", (req_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu chi")

    req = dict(row)
    if req["status"] != "pending":
        conn.close()
        raise HTTPException(status_code=400, detail="Chỉ có thể hủy yêu cầu đang ở trạng thái chờ duyệt")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        UPDATE expense_requests
        SET status = 'cancelled', resolved_at = ?
        WHERE id = ?
    """, (now_str, req_id))
    conn.commit()

    cur.execute("SELECT * FROM expense_requests WHERE id = ?", (req_id,))
    updated = dict(cur.fetchone())
    conn.close()
    return updated

