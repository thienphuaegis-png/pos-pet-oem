"""HRM: hồ sơ lương, chấm công (import máy vân tay), tăng ca, tạm ứng, hoa hồng spa, bảng lương."""
import json
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import get_db
from dependencies import require_permission, get_current_user
from services import payroll_service as ps
from services.hrm_schema import HRM_DEFAULT_RULES
from services.attendance_import import parse_attendance_xlsx, punches_to_json
from services.payroll_engine import to_min

router = APIRouter(prefix="/api/hrm", tags=["HRM & Payroll"])
PERM = "payroll.manage"
PROFILE_FIELDS = (
    "employee_code", "device_code", "work_block_id", "department", "position", "gender",
    "base_salary", "allowance", "bank_account", "bank_name", "bank_branch",
    "birthday", "hire_date", "probation_start", "official_date", "leave_date",
    "id_card_number", "id_card_date", "id_card_place",
    "permanent_address", "temporary_address", "email",
    "emergency_phone", "emergency_relation",
    "has_contract", "contract_number", "contract_type", "dependents_count",
    "insurance_salary", "is_insurance_exempt",
    "is_spa_worker", "commission_rate"
)


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
    row = cur.fetchone()
    cur_rules = json.loads(row["value"]) if row and row["value"] else {}
    for default_k, default_v in HRM_DEFAULT_RULES.items():
        if default_k not in cur_rules:
            cur_rules[default_k] = default_v

    for k, v in body.items():
        if k not in HRM_DEFAULT_RULES and k not in cur_rules:
            raise HTTPException(400, f"Tham số không hợp lệ: {k}")
        if k == "payroll_mode":
            if v not in ("sme", "enterprise"):
                raise HTTPException(400, "payroll_mode phải là 'sme' hoặc 'enterprise'")
            cur_rules[k] = v
            continue
        try:
            if float(v) < 0:
                raise ValueError
        except (TypeError, ValueError):
            raise HTTPException(400, f"Giá trị không hợp lệ: {k}")
        cur_rules[k] = v
    cur.execute("UPDATE settings SET value=? WHERE key='hrm_rules'", (json.dumps(cur_rules),))
    conn.commit(); conn.close()
    return {"status": "ok", "rules": cur_rules}


@router.post("/config/blocks")
def create_block(b: BlockIn, user=Depends(require_permission(PERM))):
    for t in (b.start_time, b.end_time, b.split_time):
        if to_min(t) is None:
            raise HTTPException(400, f"Giờ không hợp lệ: {t}")
    name = b.name.strip()
    if not name:
        raise HTTPException(400, "Tên khối làm việc bắt buộc")
    conn = get_db(); cur = conn.cursor()
    cur.execute("""INSERT INTO hrm_work_blocks (name, start_time, end_time, lunch_minutes, std_hours, off_sunday, monthly_off_days, split_time)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (name, b.start_time, b.end_time, b.lunch_minutes, b.std_hours, int(bool(b.off_sunday)), b.monthly_off_days, b.split_time))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "ok", "id": new_id}


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


@router.delete("/config/blocks/{block_id}")
def delete_block(block_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM staff WHERE work_block_id = ? AND is_active = 1", (block_id,))
    count = cur.fetchone()[0]
    if count > 0:
        conn.close()
        raise HTTPException(400, f"Không thể xóa khối đang được gán cho {count} nhân viên. Vui lòng chuyển khối cho nhân viên trước khi xóa.")
    cur.execute("DELETE FROM hrm_work_blocks WHERE id = ?", (block_id,))
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
    name: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None
    device_code: Optional[str] = None
    work_block_id: Optional[int] = None
    department: Optional[str] = None
    position: Optional[str] = None
    gender: Optional[str] = None
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
    id_card_number: Optional[str] = None
    id_card_date: Optional[str] = None
    id_card_place: Optional[str] = None
    permanent_address: Optional[str] = None
    temporary_address: Optional[str] = None
    email: Optional[str] = None
    emergency_phone: Optional[str] = None
    emergency_relation: Optional[str] = None
    has_contract: Optional[int] = None
    contract_number: Optional[str] = None
    contract_type: Optional[str] = None
    dependents_count: Optional[int] = None
    insurance_salary: Optional[float] = None
    is_insurance_exempt: Optional[int] = None
    is_spa_worker: Optional[int] = None
    commission_rate: Optional[float] = None


@router.get("/employees")
def list_employees(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute(f"""SELECT s.id, s.name, s.phone, s.role, s.is_active, s.username,
                   (CASE WHEN s.username IS NOT NULL AND TRIM(s.username) != '' AND s.password_hash IS NOT NULL THEN 1 ELSE 0 END) AS has_account,
                   {', '.join('s.' + f for f in PROFILE_FIELDS)},
                   b.name AS block_name FROM staff s LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
                   ORDER BY s.is_active DESC, COALESCE(s.employee_code,'zz'), s.id""")
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d.update(ps.compute_staff_virtual_fields(cur, d))
        rows.append(d)
    conn.close()
    return rows


class EmployeeCreate(ProfileIn):
    name: str
    phone: Optional[str] = ""


@router.post("/employees")
def create_employee(body: EmployeeCreate, user=Depends(require_permission(PERM))):
    """Tạo nhân viên KHÔNG có tài khoản đăng nhập (thợ spa, NV kho...). Tài khoản đăng nhập tạo nhanh qua phím tắt / nút Cấp TK."""
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
    if "name" in data:
        name_clean = (data["name"] or "").strip()
        if not name_clean:
            raise HTTPException(400, "Họ tên không được để trống")
        data["name"] = name_clean
    if "phone" in data:
        data["phone"] = (data["phone"] or "").strip()
    for f in ("birthday", "hire_date", "probation_start", "official_date", "leave_date", "id_card_date"):
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


class QuickAccountIn(BaseModel):
    username: str
    password: str
    role: Optional[str] = "staff"


@router.post("/employees/{staff_id}/quick-account")
def quick_grant_account(staff_id: int, body: QuickAccountIn, user=Depends(require_permission(PERM))):
    """Cấp nhanh tài khoản đăng nhập POS / Mobile cho nhân sự lương."""
    uname = body.username.strip()
    if not uname:
        raise HTTPException(400, "Tên đăng nhập không được để trống")
    pwd = body.password.strip()
    if len(pwd) < 6:
        raise HTTPException(400, "Mật khẩu phải từ 6 ký tự trở lên")
    role = body.role or "staff"
    if role not in ("owner", "cashier", "accountant", "warehouse", "staff"):
        role = "staff"

    from routers.auth import pwd_ctx
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name, username FROM staff WHERE id = ?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        conn.close(); raise HTTPException(404, "Không tìm thấy nhân viên")

    cur.execute("SELECT id FROM staff WHERE LOWER(username) = LOWER(?) AND id != ?", (uname, staff_id))
    if cur.fetchone():
        conn.close(); raise HTTPException(400, f"Tên đăng nhập '{uname}' đã được sử dụng")

    pwd_hash = pwd_ctx.hash(pwd)
    cur.execute("""UPDATE staff SET username=?, password_hash=?, role=?, must_change_password=1, token_version=token_version+1
                   WHERE id=?""", (uname, pwd_hash, role, staff_id))
    conn.commit(); conn.close()
    return {"status": "ok", "message": f"Đã cấp tài khoản '{uname}' thành công cho nhân viên {staff['name']}"}


class AdjustmentIn(BaseModel):
    decision_date: Optional[str] = None
    effective_date: str
    adjustment_type: Optional[str] = "salary"
    base_delta: float = 0
    allowance_delta: float = 0
    reason: Optional[str] = ""


@router.get("/adjustments")
def list_all_adjustments(month: Optional[str] = None, staff_id: Optional[int] = None, user=Depends(require_permission(PERM))):
    """Lấy danh sách quyết định điều chỉnh lương trên toàn hệ thống kèm thông tin nhân sự."""
    conn = get_db(); cur = conn.cursor()
    query = """
        SELECT a.*, s.name as staff_name, s.employee_code, s.position, s.department
        FROM hrm_salary_adjustments a
        JOIN staff s ON s.id = a.staff_id
        WHERE 1=1
    """
    params = []
    if staff_id:
        query += " AND a.staff_id = ?"
        params.append(staff_id)
    if month:
        query += " AND a.effective_date LIKE ?"
        params.append(f"{month}%")
    query += " ORDER BY a.effective_date DESC, a.id DESC"
    cur.execute(query, tuple(params))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.delete("/adjustments/{adj_id}")
def delete_adjustment(adj_id: int, user=Depends(require_permission(PERM))):
    """Xóa quyết định điều chỉnh lương (chỉ cho phép khi tháng áp dụng chưa chốt)."""
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM hrm_salary_adjustments WHERE id=?", (adj_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Không tìm thấy quyết định điều chỉnh")
    ps.assert_month_open(cur, row["effective_date"])
    cur.execute("DELETE FROM hrm_salary_adjustments WHERE id=?", (adj_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


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
    dec_d = _date_or_none(a.decision_date, "Ngày quyết định") if a.decision_date else d
    if not d or (a.base_delta == 0 and a.allowance_delta == 0):
        raise HTTPException(400, "Cần ngày áp dụng và số tiền điều chỉnh")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("INSERT INTO hrm_salary_adjustments (staff_id, decision_date, effective_date, adjustment_type, base_delta, allowance_delta, reason, created_by) VALUES (?,?,?,?,?,?,?,?)",
                (staff_id, dec_d, d, a.adjustment_type or "salary", a.base_delta, a.allowance_delta, a.reason or "", _uname(user)))
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
    punches: Optional[List[str]] = None
    leave_type: Optional[str] = None
    code: Optional[str] = None
    waive: bool = False
    note: Optional[str] = ""


@router.put("/attendance")
def upsert_attendance(a: AttendanceIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(a.work_date, "Ngày")
    lt = a.leave_type or a.code
    punches_raw = a.punches

    if lt in ("TV/2", "X/2", "off_morning", "off_afternoon"):
        if lt == "off_morning":
            leave_type = "off_morning"
            if not punches_raw:
                punches_raw = ["13:30", "18:00"]
        else:
            leave_type = "off_afternoon"
            if not punches_raw:
                punches_raw = ["08:00", "12:00"]
    elif lt in ("X", "TV"):
        leave_type = None
        if not punches_raw:
            punches_raw = ["08:00", "17:30"]
    elif lt == "OFF" or lt == "off":
        leave_type = "off"
        punches_raw = []
    elif lt == "V":
        leave_type = None
        punches_raw = []
    elif lt is None or lt == "":
        leave_type = None
    else:
        raise HTTPException(400, f"Loại công/nghỉ không hợp lệ: {lt}")

    punches = sorted({to_min(p) for p in (punches_raw or []) if to_min(p) is not None})
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(staff_id, work_date) DO UPDATE SET punches=excluded.punches, leave_type=excluded.leave_type,
                   waive=excluded.waive, note=excluded.note, source='manual', updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP""",
                (a.staff_id, d, json.dumps([f"{p // 60:02d}:{p % 60:02d}" for p in punches]), leave_type,
                 int(a.waive), a.note or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


class WaiveIn(BaseModel):
    staff_id: int
    work_date: str
    waive: bool
    note: Optional[str] = None


@router.post("/attendance/toggle-waive")
def toggle_waive(w: WaiveIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(w.work_date, "Ngày")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("SELECT punches, leave_type, note FROM staff_attendance WHERE staff_id=? AND work_date=?", (w.staff_id, d))
    row = cur.fetchone()
    note_val = w.note if w.note is not None else (row["note"] if row else "")
    if row:
        cur.execute("""UPDATE staff_attendance
                       SET waive=?, note=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
                       WHERE staff_id=? AND work_date=?""",
                    (int(w.waive), note_val, _uname(user), w.staff_id, d))
    else:
        cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
                       VALUES (?, ?, '[]', NULL, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)""",
                    (w.staff_id, d, int(w.waive), note_val, _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok", "waive": w.waive, "note": note_val}


# ── Kỳ tính lương & Danh sách tháng ──
@router.get("/periods")
def list_periods(year: Optional[int] = None, user=Depends(require_permission(PERM))):
    year = year or date.today().year
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT month, status, locked_at, locked_by FROM payroll_periods WHERE month LIKE ?", (f"{year}-%",))
    by_month = {r["month"]: dict(r) for r in cur.fetchall()}
    conn.close()
    result = []
    for m in range(1, 13):
        m_str = f"{year}-{m:02d}"
        item = by_month.get(m_str)
        result.append({
            "month": m_str,
            "year": year,
            "month_num": m,
            "status": item["status"] if item else "draft",
            "has_record": bool(item),
            "locked_at": item.get("locked_at") if item else None
        })
    return result


# ── Xin Off ──
class LeaveIn(BaseModel):
    id: Optional[int] = None
    staff_id: int
    work_date: str
    leave_type: str  # 'off', 'off_morning', 'off_afternoon'
    reason: Optional[str] = ""
    approved_by: Optional[str] = None


@router.get("/leaves")
def list_leaves(month: Optional[str] = None, staff_id: Optional[int] = None, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    query = """
        SELECT l.*, s.name AS staff_name, s.employee_code AS staff_code, s.department, s.position
        FROM staff_leaves l
        JOIN staff s ON s.id = l.staff_id
        WHERE 1=1
    """
    params = []
    if month:
        y, m, first, last = ps.parse_month(month)
        query += " AND l.work_date BETWEEN ? AND ?"
        params.extend([first.isoformat(), last.isoformat()])
    if staff_id:
        query += " AND l.staff_id = ?"
        params.append(staff_id)
    query += " ORDER BY l.work_date DESC, l.id DESC"
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/leaves")
def create_or_update_leave(l: LeaveIn, user=Depends(require_permission(PERM))):
    if l.leave_type not in ("off", "off_morning", "off_afternoon"):
        raise HTTPException(400, "Hình thức nghỉ không hợp lệ ('off', 'off_morning', 'off_afternoon')")
    d = _date_or_none(l.work_date, "Ngày nghỉ")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)

    cur.execute("SELECT id FROM staff WHERE id = ?", (l.staff_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")

    approver = l.approved_by or _uname(user)

    cur.execute("""
        INSERT INTO staff_leaves (staff_id, work_date, leave_type, reason, approved_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(staff_id, work_date) DO UPDATE SET
            leave_type = excluded.leave_type,
            reason = excluded.reason,
            approved_by = excluded.approved_by
    """, (l.staff_id, d, l.leave_type, l.reason or "", approver))

    # Đồng bộ sang staff_attendance (leave_type, waive=1, note=reason)
    cur.execute("SELECT id, note FROM staff_attendance WHERE staff_id = ? AND work_date = ?", (l.staff_id, d))
    att_row = cur.fetchone()
    if att_row:
        cur.execute("""
            UPDATE staff_attendance
            SET leave_type = ?, waive = 1,
                note = CASE WHEN (note IS NULL OR note = '') THEN ? ELSE note END,
                updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE staff_id = ? AND work_date = ?
        """, (l.leave_type, l.reason or "", _uname(user), l.staff_id, d))
    else:
        cur.execute("""
            INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
            VALUES (?, ?, '[]', ?, 1, ?, 'manual', ?, CURRENT_TIMESTAMP)
        """, (l.staff_id, d, l.leave_type, l.reason or "", _uname(user)))

    conn.commit()
    cur.execute("""
        SELECT l.*, s.name AS staff_name, s.employee_code AS staff_code, s.department, s.position
        FROM staff_leaves l
        JOIN staff s ON s.id = l.staff_id
        WHERE l.staff_id = ? AND l.work_date = ?
    """, (l.staff_id, d))
    res = dict(cur.fetchone())
    conn.close()
    return res


@router.delete("/leaves/{leave_id}")
def delete_leave(leave_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT staff_id, work_date FROM staff_leaves WHERE id = ?", (leave_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Không tìm thấy đơn xin off")
    ps.assert_month_open(cur, row["work_date"])

    cur.execute("DELETE FROM staff_leaves WHERE id = ?", (leave_id,))
    cur.execute("""
        UPDATE staff_attendance
        SET leave_type = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE staff_id = ? AND work_date = ?
    """, (_uname(user), row["staff_id"], row["work_date"]))

    conn.commit()
    conn.close()
    return {"status": "ok"}


@router.post("/leaves/sync-sheets")
def sync_leaves_from_sheets(user=Depends(require_permission(PERM))):
    import csv, io, urllib.request, re
    url = "https://docs.google.com/spreadsheets/d/1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak/export?format=csv&gid=1879481422"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(502, f"Không thể kết nối đến Google Sheets: {e}")

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        return {"ok": True, "synced_count": 0, "message": "Google Sheet rỗng"}

    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, employee_code, name FROM staff")
    staff_rows = cur.fetchall()
    staff_by_code = {r["employee_code"].strip().upper(): r for r in staff_rows if r["employee_code"]}
    staff_by_name = {r["name"].strip().lower(): r for r in staff_rows if r["name"]}

    def parse_d(s: str) -> Optional[str]:
        s = (s or "").strip()
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            return f"{y:04d}-{mo:02d}-{d:02d}"
        try:
            return date.fromisoformat(s).isoformat()
        except ValueError:
            return None

    synced_count = 0
    for r in rows:
        if len(r) < 4:
            continue
        code_str, name_str, d_str, off_raw = r[0].strip().upper(), r[1].strip(), r[2].strip(), r[3].strip()
        if not code_str and not name_str:
            continue
        st = staff_by_code.get(code_str) or staff_by_name.get(name_str.lower())
        if not st:
            continue
        work_date = parse_d(d_str)
        if not work_date:
            continue

        off_lower = off_raw.lower()
        if "sáng" in off_lower:
            leave_type = "off_morning"
        elif "chiều" in off_lower:
            leave_type = "off_afternoon"
        else:
            leave_type = "off"

        reason = f"Google Sheet - {off_raw}" if off_raw else "Google Sheet"
        approver = "Google Sheet"

        cur.execute("""
            INSERT INTO staff_leaves (staff_id, work_date, leave_type, reason, approved_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(staff_id, work_date) DO UPDATE SET
                leave_type = excluded.leave_type,
                reason = excluded.reason,
                approved_by = excluded.approved_by
        """, (st["id"], work_date, leave_type, reason, approver))

        cur.execute("""
            INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
            VALUES (?, ?, '[]', ?, 1, ?, 'manual', 'Google Sheet', CURRENT_TIMESTAMP)
            ON CONFLICT(staff_id, work_date) DO UPDATE SET
                leave_type = excluded.leave_type,
                waive = 1,
                note = CASE WHEN (staff_attendance.note IS NULL OR staff_attendance.note = '') THEN excluded.note ELSE staff_attendance.note END,
                updated_at = CURRENT_TIMESTAMP
        """, (st["id"], work_date, leave_type, reason))
        synced_count += 1

    conn.commit()
    conn.close()
    return {"ok": True, "synced_count": synced_count, "message": f"Đã đồng bộ {synced_count} đơn xin off từ Google Sheets"}


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


@router.get("/my-payslip")
def get_my_payslip(month: Optional[str] = None, staff_id: Optional[int] = None, user=Depends(get_current_user)):
    target_staff_id = user["id"]
    if staff_id and user.get("role") in ("owner", "accountant", "manager"):
        target_staff_id = staff_id

    if not month:
        month = date.today().strftime("%Y-%m")
    try:
        y, m, first, last = ps.parse_month(month)
    except Exception:
        raise HTTPException(400, "Tháng không hợp lệ (YYYY-MM)")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT s.id, s.name, s.employee_code, s.role, s.phone, s.base_salary, s.allowance, s.work_block_id,
               b.name AS block_name
        FROM staff s
        LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
        WHERE s.id = ?
    """, (target_staff_id,))
    staff = cur.fetchone()
    if not staff:
        conn.close()
        raise HTTPException(404, "Không tìm thấy thông tin nhân viên")

    cur.execute("SELECT * FROM payroll_periods WHERE month = ?", (month,))
    period = cur.fetchone()
    if not period:
        conn.close()
        return {
            "status": "not_found",
            "month": month,
            "period_status": "none",
            "staff": dict(staff),
            "message": f"Chưa có dữ liệu bảng lương tháng {month[5:]}/{month[:4]}"
        }

    cur.execute("""
        SELECT pl.*, c.code AS cashbook_code
        FROM payroll_lines pl
        LEFT JOIN cashbook c ON c.id = pl.cashbook_id
        WHERE pl.period_id = ? AND pl.staff_id = ?
    """, (period["id"], target_staff_id))
    line = cur.fetchone()
    conn.close()

    if not line:
        return {
            "status": "not_found",
            "month": month,
            "period_status": period["status"],
            "staff": dict(staff),
            "message": f"Chưa có dòng lương cho nhân viên {staff['name']} trong tháng {month[5:]}/{month[:4]}"
        }

    data = json.loads(line["data_json"] or "{}")
    for k in ps.MANUAL_FIELDS:
        data[k] = float(line[k] or 0)
    data["net_pay"] = float(line["net_pay"] or 0)
    data["manual_note"] = line["manual_note"] or ""
    data["cashbook_code"] = line["cashbook_code"] or ""
    data["paid_at"] = line["paid_at"]

    return {
        "status": "ok",
        "month": month,
        "period_status": period["status"],
        "staff": dict(staff),
        "payslip": data
    }


@router.get("/payroll/{month}/export-mobile-sheets")
def export_mobile_sheets(month: str, user=Depends(require_permission(PERM))):
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    conn = get_db(); cur = conn.cursor()
    data = ps.get_period(cur, month)
    conn.close()

    wb = openpyxl.Workbook()

    # 1. Sheet DU_LIEU_LUONG
    ws_data = wb.active
    ws_data.title = "DU_LIEU_LUONG"

    cols = [
        ("Mã NV", "employee_code"),
        ("Họ và Tên", "name"),
        ("Khối / Vị Trí", "block"),
        ("Công Chuẩn", "std_days"),
        ("Công Chính Thức", "days_official"),
        ("Công Thử Việc", "days_probation"),
        ("Lương Cơ Bản", "base_salary"),
        ("Lương Theo Công", "pay_days"),
        ("Phụ Cấp", "allowance"),
        ("Phụ Cấp Khác/Xăng", "fuel_other"),
        ("Lương Lễ", "holiday_pay"),
        ("Hoa Hồng Bán Lẻ", "commission"),
        ("Hoa Hồng Spa", "spa_commission"),
        ("Tiền Tip", "tips"),
        ("Thưởng Chuyên Cần", "attendance_bonus"),
        ("Thưởng Sinh Nhật", "birthday_bonus"),
        ("Thưởng Khác", "bonus_other"),
        ("Tiền Tăng Ca OT", "ot_pay"),
        ("Phạt Trễ & Quẹt Thẻ", "penalties"),
        ("Tạm Ứng Trong Tháng", "advances"),
        ("Giảm Trừ Khác", "deduction_other"),
        ("THỰC LÃNH NET", "net_pay"),
        ("Phiếu Chi Sổ Quỹ", "cashbook_code"),
        ("Ghi Chú Giải Trình", "manual_note")
    ]

    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    border_thin = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    ws_data.append([c[0] for c in cols])
    for col_idx in range(1, len(cols) + 1):
        cell = ws_data.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border_thin

    row_num = 2
    for line in data["lines"]:
        row_vals = []
        for _, k in cols:
            val = line.get(k)
            if val is None:
                val = ""
            row_vals.append(val)
        ws_data.append(row_vals)
        for col_idx in range(1, len(cols) + 1):
            cell = ws_data.cell(row=row_num, column=col_idx)
            cell.font = Font(name="Arial", size=10)
            cell.border = border_thin
            if isinstance(cell.value, (int, float)):
                cell.number_format = '#,##0'
        row_num += 1

    for i in range(1, len(cols) + 1):
        ws_data.column_dimensions[get_column_letter(i)].width = 18

    # 2. Sheet PHIEU_LUONG_MOBILE (Dạng Card dọc tối ưu xem trên điện thoại Google Sheets)
    ws_mob = wb.create_sheet("PHIEU_LUONG_MOBILE")
    ws_mob.column_dimensions['A'].width = 2
    ws_mob.column_dimensions['B'].width = 28
    ws_mob.column_dimensions['C'].width = 24
    ws_mob.column_dimensions['D'].width = 2

    title_font = Font(name="Arial", size=13, bold=True, color="0F172A")
    sec_font = Font(name="Arial", size=10, bold=True, color="1E293B")
    sec_fill_income = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
    sec_fill_deduct = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    net_font = Font(name="Arial", size=14, bold=True, color="065F46")
    net_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    lbl_font = Font(name="Arial", size=10, color="334155")
    val_font = Font(name="Arial", size=10, bold=True, color="0F172A")

    ws_mob['B2'] = f"PHIẾU LƯƠNG THÁNG {month[5:]}/{month[:4]}"
    ws_mob['B2'].font = title_font

    ws_mob['B4'] = "👉 Nhập/Chọn Mã Nhân Viên:"
    ws_mob['B4'].font = Font(name="Arial", size=10, bold=True, color="4338CA")
    first_code = data["lines"][0].get("employee_code") if data["lines"] else "NV01"
    ws_mob['C4'] = first_code or "NV01"
    ws_mob['C4'].font = Font(name="Arial", size=11, bold=True, color="4338CA")
    ws_mob['C4'].fill = PatternFill(start_color="EEF2FF", end_color="EEF2FF", fill_type="solid")
    ws_mob['C4'].alignment = Alignment(horizontal="center")
    ws_mob['C4'].border = border_thin

    ws_mob['B5'] = "Họ và tên nhân viên:"
    ws_mob['B5'].font = lbl_font
    ws_mob['C5'] = '=IFERROR(VLOOKUP(C4, DU_LIEU_LUONG!A2:X200, 2, FALSE), "Không tìm thấy")'
    ws_mob['C5'].font = val_font

    ws_mob['B6'] = "Khối / Bộ phận:"
    ws_mob['B6'].font = lbl_font
    ws_mob['C6'] = '=IFERROR(VLOOKUP(C4, DU_LIEU_LUONG!A2:X200, 3, FALSE), "--")'
    ws_mob['C6'].font = val_font

    # I. THU NHẬP
    ws_mob['B8'] = "I. CÁC KHOẢN THU NHẬP"
    ws_mob['C8'] = "SỐ TIỀN (VNĐ)"
    for col in ('B8', 'C8'):
        ws_mob[col].font = sec_font
        ws_mob[col].fill = sec_fill_income
        ws_mob[col].border = border_thin

    income_items = [
        (9, "1. Lương cơ bản", 7),
        (10, "2. Công chuẩn tháng", 4),
        (11, "3. Công làm việc thực tế", 5),
        (12, "4. Lương theo ngày công", 8),
        (13, "5. Phụ cấp ăn trưa / xăng", 9),
        (14, "6. Phụ cấp khác", 10),
        (15, "7. Lương ngày lễ", 11),
        (16, "8. Hoa hồng bán lẻ", 12),
        (17, "9. Hoa hồng Spa & Dịch vụ", 13),
        (18, "10. Tiền Tip khách tặng", 14),
        (19, "11. Thưởng chuyên cần", 15),
        (20, "12. Thưởng sinh nhật", 16),
        (21, "13. Thưởng khác", 17),
        (22, "14. Tiền tăng ca OT", 18),
    ]

    for r_idx, label, col_idx in income_items:
        ws_mob[f'B{r_idx}'] = label
        ws_mob[f'B{r_idx}'].font = lbl_font
        ws_mob[f'B{r_idx}'].border = border_thin
        ws_mob[f'C{r_idx}'] = f'=IFERROR(VLOOKUP(C$4, DU_LIEU_LUONG!A$2:X$200, {col_idx}, FALSE), 0)'
        ws_mob[f'C{r_idx}'].font = val_font
        ws_mob[f'C{r_idx}'].alignment = Alignment(horizontal="right")
        ws_mob[f'C{r_idx}'].border = border_thin
        if col_idx not in (4, 5):
            ws_mob[f'C{r_idx}'].number_format = '#,##0'
        else:
            ws_mob[f'C{r_idx}'].number_format = '0.0'

    # II. GIẢM TRỪ
    ws_mob['B24'] = "II. CÁC KHOẢN GIẢM TRỪ"
    ws_mob['C24'] = "SỐ TIỀN (VNĐ)"
    for col in ('B24', 'C24'):
        ws_mob[col].font = sec_font
        ws_mob[col].fill = sec_fill_deduct
        ws_mob[col].border = border_thin

    deduct_items = [
        (25, "1. Phạt trễ & Quẹt thẻ", 19),
        (26, "2. Tạm ứng trong tháng", 20),
        (27, "3. Giảm trừ khác", 21),
    ]

    for r_idx, label, col_idx in deduct_items:
        ws_mob[f'B{r_idx}'] = label
        ws_mob[f'B{r_idx}'].font = lbl_font
        ws_mob[f'B{r_idx}'].border = border_thin
        ws_mob[f'C{r_idx}'] = f'=IFERROR(VLOOKUP(C$4, DU_LIEU_LUONG!A$2:X$200, {col_idx}, FALSE), 0)'
        ws_mob[f'C{r_idx}'].font = val_font
        ws_mob[f'C{r_idx}'].alignment = Alignment(horizontal="right")
        ws_mob[f'C{r_idx}'].border = border_thin
        ws_mob[f'C{r_idx}'].number_format = '#,##0'

    # III. THỰC LÃNH NET
    ws_mob['B29'] = "III. THỰC LÃNH NET:"
    ws_mob['B29'].font = net_font
    ws_mob['B29'].fill = net_fill
    ws_mob['B29'].border = border_thin

    ws_mob['C29'] = '=IFERROR(VLOOKUP(C$4, DU_LIEU_LUONG!A$2:X$200, 22, FALSE), 0)'
    ws_mob['C29'].font = net_font
    ws_mob['C29'].fill = net_fill
    ws_mob['C29'].alignment = Alignment(horizontal="right")
    ws_mob['C29'].border = border_thin
    ws_mob['C29'].number_format = '#,##0'

    ws_mob['B31'] = "Mã Phiếu Chi Sổ Quỹ:"
    ws_mob['B31'].font = lbl_font
    ws_mob['C31'] = '=IFERROR(VLOOKUP(C$4, DU_LIEU_LUONG!A$2:X$200, 23, FALSE), "--")'
    ws_mob['C31'].font = val_font

    ws_mob['B32'] = "Ghi chú giải trình:"
    ws_mob['B32'].font = lbl_font
    ws_mob['C32'] = '=IFERROR(VLOOKUP(C$4, DU_LIEU_LUONG!A$2:X$200, 24, FALSE), "")'
    ws_mob['C32'].font = val_font

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Phieu_Luong_Mobile_GoogleSheets_{month}.xlsx"'}
    )
