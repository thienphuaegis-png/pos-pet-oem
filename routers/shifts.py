from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import get_db
from dependencies import get_current_user, require_role, require_permission

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


class OpenShiftIn(BaseModel):
    opening_cash: float = 0


class CloseShiftIn(BaseModel):
    closing_cash: float
    note: Optional[str] = None


@router.post("/open")
def open_shift(body: OpenShiftIn, user=Depends(require_role("cashier", "owner"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id FROM shifts WHERE cashier_id=? AND status='open'", (user["id"],))
    if cur.fetchone():
        db.close()
        raise HTTPException(400, "Bạn đang có ca chưa kết. Vui lòng kết ca trước.")
    cur.execute(
        "INSERT INTO shifts (cashier_id, opening_cash) VALUES (?,?)",
        (user["id"], body.opening_cash)
    )
    db.commit()
    shift_id = cur.lastrowid
    db.close()
    return {"shift_id": shift_id, "message": "Mở ca thành công"}


@router.get("/current")
def current_shift(user=Depends(get_current_user)):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT s.*, st.name as cashier_name
           FROM shifts s JOIN staff st ON st.id=s.cashier_id
           WHERE s.cashier_id=? AND s.status='open'""",
        (user["id"],)
    )
    row = cur.fetchone()
    db.close()
    if not row:
        return None
    return dict(row)


@router.post("/{shift_id}/close")
def close_shift(shift_id: int, body: CloseShiftIn, user=Depends(get_current_user)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM shifts WHERE id=?", (shift_id,))
    shift = cur.fetchone()
    if not shift:
        db.close(); raise HTTPException(404, "Không tìm thấy ca")
    if shift["cashier_id"] != user["id"] and user["role"] != "owner":
        db.close(); raise HTTPException(403, "Không có quyền kết ca này")
    if shift["status"] != "open":
        db.close(); raise HTTPException(400, "Ca này đã được kết")

    # Tính tiền két lý thuyết: opening_cash + net thu/chi tiền mặt trong ca
    cur.execute("""
        SELECT COALESCE(SUM(
            CASE WHEN cb.type IN ('in','THU') THEN cb.amount
                 WHEN cb.type IN ('out','CHI') THEN -cb.amount
                 ELSE 0 END
        ), 0)
        FROM cashbook cb WHERE cb.shift_id=?
    """, (shift_id,))
    net_cash = cur.fetchone()[0]
    expected = (shift["opening_cash"] or 0) + net_cash
    diff = body.closing_cash - expected

    cur.execute("""
        UPDATE shifts SET status='closed', close_at=CURRENT_TIMESTAMP,
        closing_cash=?, expected_cash=?, difference=?, note=? WHERE id=?
    """, (body.closing_cash, expected, diff, body.note, shift_id))
    db.commit()
    db.close()
    return {
        "expected_cash": expected,
        "closing_cash": body.closing_cash,
        "difference": diff,
        "message": "Kết ca thành công"
    }


@router.post("/{shift_id}/approve")
def approve_shift(shift_id: int, user=Depends(require_permission("shifts.approve"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM shifts WHERE id=?", (shift_id,))
    row = cur.fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Không tìm thấy ca")
    if row["status"] != "closed":
        db.close(); raise HTTPException(400, "Ca chưa được kết, không thể duyệt")
    cur.execute(
        "UPDATE shifts SET status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?",
        (user["id"], shift_id)
    )
    db.commit()
    db.close()
    return {"message": "Duyệt ca thành công"}


@router.get("/")
def list_shifts(user=Depends(require_permission("shifts.approve"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT s.*,
               st.name as cashier_name,
               (SELECT name FROM staff WHERE id=s.approved_by) as approver_name,
               (SELECT COUNT(*) FROM orders o WHERE o.shift_id=s.id) as order_count,
               (SELECT COALESCE(SUM(o.final_amount),0) FROM orders o WHERE o.shift_id=s.id) as total_sales,
               (SELECT COALESCE(SUM(CASE WHEN cb.type='in' THEN cb.amount ELSE 0 END),0) FROM cashbook cb WHERE cb.shift_id=s.id) as cash_in,
               (SELECT COALESCE(SUM(CASE WHEN cb.type='out' THEN cb.amount ELSE 0 END),0) FROM cashbook cb WHERE cb.shift_id=s.id) as cash_out
        FROM shifts s
        JOIN staff st ON st.id=s.cashier_id
        ORDER BY s.open_at DESC
        LIMIT 200
    """)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows
