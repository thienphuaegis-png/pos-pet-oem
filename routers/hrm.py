"""HRM: hồ sơ lương, chấm công (import máy vân tay), tăng ca, tạm ứng, hoa hồng spa, bảng lương."""
import json
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import get_db
from dependencies import require_permission
from services import payroll_service as ps
from services.attendance_import import parse_attendance_xlsx, punches_to_json
from services.payroll_engine import to_min

router = APIRouter(prefix="/api/hrm", tags=["HRM & Payroll"])
PERM = "payroll.manage"
PROFILE_FIELDS = ("employee_code", "device_code", "work_block_id", "position", "base_salary", "allowance",
                  "bank_account", "bank_name", "bank_branch", "birthday", "hire_date", "probation_start",
                  "official_date", "leave_date", "is_spa_worker", "commission_rate")


def _uname(user) -> str:
    return (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"


def _date_or_none(v, field):
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise HTTPException(400, f"{field} không hợp lệ (YYYY-MM-DD)")


# ── Cấu hình ──
class BlockIn(BaseModel):
    name: str
    start_time: str
    end_time: str
    lunch_minutes: int = 0
    std_hours: float = 8
    off_sunday: int = 0
    monthly_off_days: int = 0
    split_time: str = "12:00"


@router.get("/config")
def get_config(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM hrm_work_blocks ORDER BY id")
    blocks = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM hrm_holidays ORDER BY holiday_date")
    holidays = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT value FROM settings WHERE key='hrm_rules'")
    row = cur.fetchone()
    cur.execute("SELECT * FROM spa_commission_rules ORDER BY role_key, id")
    spa_rules = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"blocks": blocks, "holidays": holidays, "rules": json.loads(row["value"]) if row else {}, "spa_rules": spa_rules}


@router.put("/config/rules")
def update_rules(body: dict, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key='hrm_rules'")
    cur_rules = json.loads(cur.fetchone()["value"])
    for k, v in body.items():
        if k not in cur_rules:
            raise HTTPException(400, f"Tham số không hợp lệ: {k}")
        try:
            if float(v) < 0:
                raise ValueError
        except (TypeError, ValueError):
            raise HTTPException(400, f"Giá trị không hợp lệ: {k}")
        cur_rules[k] = v
    cur.execute("UPDATE settings SET value=? WHERE key='hrm_rules'", (json.dumps(cur_rules),))
    conn.commit(); conn.close()
    return {"status": "ok", "rules": cur_rules}


@router.put("/config/blocks/{block_id}")
def update_block(block_id: int, b: BlockIn, user=Depends(require_permission(PERM))):
    for t in (b.start_time, b.end_time, b.split_time):
        if to_min(t) is None:
            raise HTTPException(400, f"Giờ không hợp lệ: {t}")
    conn = get_db(); cur = conn.cursor()
    cur.execute("""UPDATE hrm_work_blocks SET name=?, start_time=?, end_time=?, lunch_minutes=?, std_hours=?,
                   off_sunday=?, monthly_off_days=?, split_time=? WHERE id=?""",
                (b.name.strip(), b.start_time, b.end_time, b.lunch_minutes, b.std_hours, int(bool(b.off_sunday)),
                 b.monthly_off_days, b.split_time, block_id))
    if cur.rowcount == 0:
        conn.close(); raise HTTPException(404, "Không tìm thấy khối làm việc")
    conn.commit(); conn.close()
    return {"status": "ok"}


class HolidayIn(BaseModel):
    holiday_date: str
    name: str


@router.post("/config/holidays")
def add_holiday(h: HolidayIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(h.holiday_date, "Ngày lễ")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO hrm_holidays (holiday_date, name) VALUES (?, ?)", (d, h.name.strip()))
    conn.commit(); conn.close()
    return {"status": "ok"}


@router.delete("/config/holidays/{holiday_date}")
def delete_holiday(holiday_date: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM hrm_holidays WHERE holiday_date=?", (holiday_date,))
    conn.commit(); conn.close()
    return {"status": "ok"}


class SpaRuleIn(BaseModel):
    role_key: str
    service_name: Optional[str] = None
    rate_type: str
    value: float
    is_active: int = 1


@router.post("/config/spa-rules")
def add_spa_rule(r: SpaRuleIn, user=Depends(require_permission(PERM))):
    if r.role_key not in ("receiver", "worker_1", "worker_2", "cutter", "dyer") or r.rate_type not in ("percent", "fixed") or r.value < 0:
        raise HTTPException(400, "Quy tắc hoa hồng không hợp lệ")
    if r.rate_type == "percent" and r.value > 100:
        raise HTTPException(400, "Phần trăm phải từ 0 đến 100")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value, is_active) VALUES (?,?,?,?,?)",
                (r.role_key, (r.service_name or "").strip() or None, r.rate_type, r.value, r.is_active))
    conn.commit(); new_id = cur.lastrowid; conn.close()
    return {"status": "ok", "id": new_id}


@router.delete("/config/spa-rules/{rule_id}")
def delete_spa_rule(rule_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM spa_commission_rules WHERE id=?", (rule_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Hồ sơ nhân sự ──
class ProfileIn(BaseModel):
    employee_code: Optional[str] = None
    device_code: Optional[str] = None
    work_block_id: Optional[int] = None
    position: Optional[str] = None
    base_salary: Optional[float] = None
    allowance: Optional[float] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    birthday: Optional[str] = None
    hire_date: Optional[str] = None
    probation_start: Optional[str] = None
    official_date: Optional[str] = None
    leave_date: Optional[str] = None
    is_spa_worker: Optional[int] = None
    commission_rate: Optional[float] = None


@router.get("/employees")
def list_employees(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute(f"""SELECT s.id, s.name, s.phone, s.role, s.is_active, s.username, {', '.join('s.' + f for f in PROFILE_FIELDS)},
                   b.name AS block_name FROM staff s LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
                   ORDER BY s.is_active DESC, COALESCE(s.employee_code,'zz'), s.id""")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


class EmployeeCreate(ProfileIn):
    name: str
    phone: Optional[str] = ""


@router.post("/employees")
def create_employee(body: EmployeeCreate, user=Depends(require_permission(PERM))):
    """Tạo nhân viên KHÔNG có tài khoản đăng nhập (thợ spa, NV kho...). Tài khoản đăng nhập tạo ở Cài đặt > Nhân viên."""
    if not body.name.strip():
        raise HTTPException(400, "Tên nhân viên bắt buộc")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT INTO staff (name, phone, role, is_active, commission_rate) VALUES (?, ?, 'staff', 1, 0)", (body.name.strip(), body.phone or ""))
    sid = cur.lastrowid
    conn.commit(); conn.close()
    update_profile(sid, ProfileIn(**body.model_dump(exclude={"name", "phone"})), user)
    return {"status": "ok", "id": sid}


@router.put("/employees/{staff_id}")
def update_profile(staff_id: int, body: ProfileIn, user=Depends(require_permission(PERM))):
    data = body.model_dump(exclude_unset=True)
    for f in ("birthday", "hire_date", "probation_start", "official_date", "leave_date"):
        if f in data:
            data[f] = _date_or_none(data[f], f)
    for f in ("base_salary", "allowance", "commission_rate"):
        if f in data and data[f] is not None and data[f] < 0:
            raise HTTPException(400, f"{f} không được âm")
    if data.get("commission_rate") is not None and data["commission_rate"] > 100:
        raise HTTPException(400, "Hoa hồng % phải từ 0 đến 100")
    for f in ("employee_code", "device_code"):
        if f in data:
            data[f] = (data[f] or "").strip() or None
    if not data:
        raise HTTPException(400, "Không có trường nào để cập nhật")
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id FROM staff WHERE id=?", (staff_id,))
    if not cur.fetchone():
        conn.close(); raise HTTPException(404, "Không tìm thấy nhân viên")
    try:
        cur.execute(f"UPDATE staff SET {', '.join(k + '=?' for k in data)} WHERE id=?", (*data.values(), staff_id))
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(400, "Mã nhân viên hoặc mã chấm công đã được dùng cho người khác")
        raise
    conn.commit(); conn.close()
    return {"status": "ok"}


class AdjustmentIn(BaseModel):
    effective_date: str
    base_delta: float = 0
    allowance_delta: float = 0
    reason: Optional[str] = ""


@router.get("/employees/{staff_id}/adjustments")
def list_adjustments(staff_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM hrm_salary_adjustments WHERE staff_id=? ORDER BY effective_date DESC, id DESC", (staff_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/employees/{staff_id}/adjustments")
def add_adjustment(staff_id: int, a: AdjustmentIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(a.effective_date, "Ngày áp dụng")
    if not d or (a.base_delta == 0 and a.allowance_delta == 0):
        raise HTTPException(400, "Cần ngày áp dụng và số tiền điều chỉnh")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("INSERT INTO hrm_salary_adjustments (staff_id, effective_date, base_delta, allowance_delta, reason, created_by) VALUES (?,?,?,?,?,?)",
                (staff_id, d, a.base_delta, a.allowance_delta, a.reason or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Chấm công ──
@router.post("/attendance/import")
async def import_attendance(file: UploadFile = File(...), user=Depends(require_permission(PERM))):
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Chỉ nhận file Excel .xlsx")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File quá lớn (tối đa 10MB)")
    try:
        parsed = parse_attendance_xlsx(content)
    except Exception:
        raise HTTPException(400, "Không đọc được file Excel")
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, device_code FROM staff WHERE device_code IS NOT NULL AND device_code != ''")
    by_code = {r["device_code"]: r["id"] for r in cur.fetchall()}
    imported, skipped_manual, locked = 0, 0, 0
    unknown = {}
    for row in parsed["rows"]:
        sid = by_code.get(row["device_code"])
        if not sid:
            unknown[row["device_code"]] = row["name"]
            continue
        if ps.month_status(cur, row["work_date"].year, row["work_date"].month) != "draft":
            locked += 1
            continue
        cur.execute("SELECT source FROM staff_attendance WHERE staff_id=? AND work_date=?", (sid, row["work_date"].isoformat()))
        ex = cur.fetchone()
        if ex and ex["source"] == "manual":
            skipped_manual += 1
            continue
        cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, source, updated_by, updated_at)
                       VALUES (?, ?, ?, 'device', ?, CURRENT_TIMESTAMP)
                       ON CONFLICT(staff_id, work_date) DO UPDATE SET punches=excluded.punches, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP""",
                    (sid, row["work_date"].isoformat(), json.dumps(punches_to_json(row["punches"])), _uname(user)))
        imported += 1
    conn.commit(); conn.close()
    return {"status": "ok", "imported": imported, "skipped_manual": skipped_manual, "skipped_locked": locked,
            "unknown_codes": [{"device_code": k, "name": v} for k, v in unknown.items()], "errors": parsed["errors"]}


@router.get("/attendance")
def attendance_grid(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    rules, blocks = ps.load_rules(cur), ps.load_blocks(cur)
    out = []
    for s in ps.payroll_staff(cur, first):
        block = blocks.get(s["work_block_id"])
        days = [ps.day_to_dict(d) for d in ps.build_days(cur, s, block, rules, first, last, date.today())] if block else []
        cur.execute("SELECT work_date, punches, leave_type, waive, note, source FROM staff_attendance WHERE staff_id=? AND work_date BETWEEN ? AND ?",
                    (s["id"], first.isoformat(), last.isoformat()))
        raw = {r["work_date"]: dict(r) for r in cur.fetchall()}
        for d in days:
            r = raw.get(d["date"]) or {}
            d.update({"punches": json.loads(r.get("punches") or "[]"), "leave_type": r.get("leave_type"),
                      "waive": bool(r.get("waive")), "note": r.get("note") or "", "source": r.get("source")})
        out.append({"staff_id": s["id"], "name": s["name"], "employee_code": s["employee_code"] or "",
                    "block": block.name if block else "", "days": days,
                    "credit": sum(d["credit"] for d in days), "penalty": sum(d["penalty"] for d in days),
                    "ot_suggest_hours": sum(d["ot_suggest_hours"] for d in days)})
    status = ps.month_status(cur, y, m)
    conn.close()
    return {"month": month, "status": status, "days_in_month": last.day, "employees": out}


class AttendanceIn(BaseModel):
    staff_id: int
    work_date: str
    punches: List[str] = []
    leave_type: Optional[str] = None
    waive: bool = False
    note: Optional[str] = ""


@router.put("/attendance")
def upsert_attendance(a: AttendanceIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(a.work_date, "Ngày")
    if a.leave_type not in (None, "", "off", "off_morning", "off_afternoon"):
        raise HTTPException(400, "Loại nghỉ không hợp lệ")
    punches = sorted({to_min(p) for p in a.punches if to_min(p) is not None})
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(staff_id, work_date) DO UPDATE SET punches=excluded.punches, leave_type=excluded.leave_type,
                   waive=excluded.waive, note=excluded.note, source='manual', updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP""",
                (a.staff_id, d, json.dumps([f"{p // 60:02d}:{p % 60:02d}" for p in punches]), a.leave_type or None,
                 int(a.waive), a.note or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Tăng ca ──
class OvertimeIn(BaseModel):
    staff_id: int
    work_date: str
    hours: float
    note: Optional[str] = ""


@router.get("/overtime")
def list_overtime(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    cur.execute("""SELECT o.*, s.name FROM staff_overtime o JOIN staff s ON s.id=o.staff_id
                   WHERE o.work_date BETWEEN ? AND ? ORDER BY o.work_date, s.name""", (first.isoformat(), last.isoformat()))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/overtime")
def approve_overtime(o: OvertimeIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(o.work_date, "Ngày")
    if o.hours <= 0 or o.hours > 12:
        raise HTTPException(400, "Số giờ tăng ca phải từ 0 đến 12")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("""INSERT INTO staff_overtime (staff_id, work_date, hours, note, approved_by) VALUES (?,?,?,?,?)
                   ON CONFLICT(staff_id, work_date) DO UPDATE SET hours=excluded.hours, note=excluded.note, approved_by=excluded.approved_by""",
                (o.staff_id, d, o.hours, o.note or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


@router.delete("/overtime/{ot_id}")
def delete_overtime(ot_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT work_date FROM staff_overtime WHERE id=?", (ot_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "Không tìm thấy")
    ps.assert_month_open(cur, row["work_date"])
    cur.execute("DELETE FROM staff_overtime WHERE id=?", (ot_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Tạm ứng ──
class AdvanceIn(BaseModel):
    staff_id: int
    advance_date: str
    amount: float
    note: Optional[str] = ""
    account_id: Optional[int] = None  # có -> sinh phiếu chi "Tạm ứng lương"


@router.get("/advances")
def list_advances(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    cur.execute("""SELECT a.*, s.name, c.code AS cashbook_code FROM staff_advances a JOIN staff s ON s.id=a.staff_id
                   LEFT JOIN cashbook c ON c.id=a.cashbook_id WHERE a.advance_date BETWEEN ? AND ? ORDER BY a.advance_date""",
                (first.isoformat(), last.isoformat()))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/advances")
def create_advance(a: AdvanceIn, user=Depends(require_permission(PERM))):
    from routers.cashbook import generate_cashbook_code
    d = _date_or_none(a.advance_date, "Ngày ứng")
    if a.amount <= 0:
        raise HTTPException(400, "Số tiền ứng phải lớn hơn 0")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("SELECT name FROM staff WHERE id=?", (a.staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close(); raise HTTPException(404, "Không tìm thấy nhân viên")
    cb_id = None
    if a.account_id:
        code = generate_cashbook_code(cur, "PC-UL")
        cur.execute("""INSERT INTO cashbook (code, type, category, amount, ref_type, note, account_id, fund_source, created_by, created_at)
                       VALUES (?, 'out', ?, ?, 'salary_advance', ?, ?, 'COMPANY', ?, ?)""",
                    (code, ps.ADVANCE_CATEGORY, a.amount, f"Tạm ứng lương - {st['name']}", a.account_id, _uname(user),
                     f"{d} {datetime.now().strftime('%H:%M:%S')}"))
        cb_id = cur.lastrowid
    cur.execute("INSERT INTO staff_advances (staff_id, advance_date, amount, note, cashbook_id, created_by) VALUES (?,?,?,?,?,?)",
                (a.staff_id, d, a.amount, a.note or "", cb_id, _uname(user)))
    if cb_id:
        cur.execute("UPDATE cashbook SET ref_id=? WHERE id=?", (cur.lastrowid, cb_id))
    conn.commit(); conn.close()
    return {"status": "ok", "cashbook_id": cb_id}


@router.delete("/advances/{adv_id}")
def delete_advance(adv_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM staff_advances WHERE id=?", (adv_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "Không tìm thấy")
    ps.assert_month_open(cur, row["advance_date"])
    if row["cashbook_id"]:
        conn.close(); raise HTTPException(400, "Khoản ứng có phiếu chi, xóa phiếu chi ở Sổ Quỹ (khoản ứng tự xóa theo)")
    cur.execute("DELETE FROM staff_advances WHERE id=?", (adv_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Bảng lương ──
@router.get("/payroll/{month}")
def get_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    res = ps.get_period(cur, month)
    conn.close()
    return res


@router.post("/payroll/{month}/calculate")
def calculate_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.calculate_period(cur, month)
        conn.commit()
        return res
    finally:
        conn.close()


class ManualIn(BaseModel):
    bonus_other: Optional[float] = None
    fuel_other: Optional[float] = None
    deduction_other: Optional[float] = None
    manual_note: Optional[str] = None


@router.put("/payroll/{month}/lines/{staff_id}")
def update_payroll_line(month: str, staff_id: int, body: ManualIn, user=Depends(require_permission(PERM))):
    for k in ("bonus_other", "fuel_other", "deduction_other"):
        v = getattr(body, k)
        if v is not None and v < 0:
            raise HTTPException(400, f"{k} không được âm")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.update_manual(cur, month, staff_id, body.model_dump())
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/payroll/{month}/lock")
def lock_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.lock_period(cur, month, _uname(user))
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/payroll/{month}/unlock")
def unlock_payroll(month: str, user=Depends(require_permission(PERM))):
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Chỉ chủ cửa hàng được mở khóa bảng lương")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.unlock_period(cur, month)
        conn.commit()
        return res
    finally:
        conn.close()


class PayIn(BaseModel):
    account_id: int
    staff_ids: Optional[List[int]] = None


@router.post("/payroll/{month}/pay")
def pay_payroll(month: str, body: PayIn, user=Depends(require_permission("cashbook.manage"))):
    from dependencies import check_permission
    if user.get("role") not in ("owner", "admin") and not check_permission(user["id"], user.get("role", ""), PERM):
        raise HTTPException(403, "Không có quyền truy cập")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.pay_period(cur, month, body.account_id, body.staff_ids, _uname(user))
        conn.commit()
        return res
    finally:
        conn.close()


@router.get("/payroll/{month}/export")
def export_payroll(month: str, user=Depends(require_permission(PERM))):
    import io
    import openpyxl
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    conn = get_db(); cur = conn.cursor()
    data = ps.get_period(cur, month)
    conn.close()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bang_Luong"
    cols = [("Mã NV", "employee_code"), ("Họ tên", "name"), ("Khối", "block"), ("Công chuẩn", "std_days"),
            ("Công CT", "days_official"), ("Công TV", "days_probation"), ("Lương CB", "base_salary"),
            ("Lương theo công", "pay_days"), ("Phụ cấp", "allowance"), ("Xăng xe/Khác", "fuel_other"),
            ("Lương lễ", "holiday_pay"), ("Hoa hồng bán", "commission"), ("Hoa hồng spa", "spa_commission"),
            ("Tip", "tips"), ("Thưởng SN", "birthday_bonus"), ("Chuyên cần", "attendance_bonus"),
            ("Thưởng khác", "bonus_other"), ("Giờ OT CT", "ot_hours_official"), ("Giờ OT TV", "ot_hours_probation"),
            ("Tiền OT", "ot_pay"), ("Phạt", "penalties"), ("Tạm ứng", "advances"), ("Trừ khác", "deduction_other"),
            ("Thực lãnh", "net_pay"), ("Phiếu chi", "cashbook_code")]
    ws.append([f"BẢNG LƯƠNG THÁNG {month[5:]}/{month[:4]} — {data['status'].upper()}"])
    ws.append([c[0] for c in cols])
    for c in ws[2]:
        c.font = Font(bold=True)
    for line in data["lines"]:
        ws.append([line.get(k, "") for _, k in cols])
    ws.append(["", "TỔNG"] + [""] * (len(cols) - 3) + [data["totals"].get("net_pay", 0)])
    for i in range(1, len(cols) + 1):
        ws.column_dimensions[get_column_letter(i)].width = 14
    ws2 = wb.create_sheet("Chuyen_khoan")
    ws2.append(["STT", "Mã NV", "Tên thụ hưởng", "Số tài khoản", "Ngân hàng", "Chi nhánh", "Số tiền", "Nội dung"])
    conn = get_db(); cur = conn.cursor()
    n = 0
    for line in data["lines"]:
        if line.get("net_pay", 0) <= 0:
            continue
        cur.execute("SELECT bank_account, bank_name, bank_branch FROM staff WHERE id=?", (line["staff_id"],))
        b = cur.fetchone()
        n += 1
        ws2.append([n, line.get("employee_code"), line.get("name"), b["bank_account"] or "", b["bank_name"] or "",
                    b["bank_branch"] or "", line["net_pay"], f"Luong T{month[5:]}/{month[:4]} {line.get('employee_code') or ''}"])
    conn.close()
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="Bang_Luong_{month}.xlsx"'})
