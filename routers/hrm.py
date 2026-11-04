"""HRM: hồ sơ lương, chấm công (import máy vân tay), tăng ca, tạm ứng, hoa hồng spa, bảng lương."""
import json
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import get_db
from dependencies import require_permission, get_current_user, check_permission
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
    "is_spa_worker", "commission_rate", "is_payroll_staff", "is_attendance_exempt",
    "allow_remote_checkin"
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
    is_payroll_staff: Optional[int] = 1
    is_attendance_exempt: Optional[int] = None
    allow_remote_checkin: Optional[int] = None
    is_active: Optional[int] = None


@router.get("/employees")
def list_employees(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute(f"""SELECT s.id, s.name, s.phone, s.role, s.is_active, s.username,
                   (CASE WHEN s.username IS NOT NULL AND TRIM(s.username) != '' AND s.password_hash IS NOT NULL THEN 1 ELSE 0 END) AS has_account,
                   {', '.join('s.' + f for f in PROFILE_FIELDS)},
                   b.name AS block_name FROM staff s LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
                   WHERE COALESCE(s.is_payroll_staff, 1) = 1
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
    cur.execute("INSERT INTO staff (name, phone, role, is_active, commission_rate, is_payroll_staff) VALUES (?, ?, 'staff', 1, 0, 1)", (body.name.strip(), body.phone or ""))
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
    if "is_active" in data and data["is_active"] is None:
        data.pop("is_active")
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


class ResignIn(BaseModel):
    leave_date: Optional[str] = None
    note: Optional[str] = None


@router.post("/employees/{staff_id}/resign")
def resign_employee(staff_id: int, body: ResignIn = None, user=Depends(require_permission(PERM))):
    """Đánh dấu nhân viên nghỉ việc: gán is_active=0, leave_date, hủy token phiên đăng nhập."""
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM staff WHERE id=?", (staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")

    leave_d = None
    if body and body.leave_date:
        leave_d = _date_or_none(body.leave_date, "leave_date")
    if not leave_d:
        leave_d = date.today().isoformat()

    cur.execute("""
        UPDATE staff
        SET is_active = 0, leave_date = ?, token_version = token_version + 1
        WHERE id = ?
    """, (leave_d, staff_id))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã chuyển nhân viên {st['name']} sang trạng thái nghỉ việc (ngày {leave_d})"}


@router.post("/employees/{staff_id}/rehire")
def rehire_employee(staff_id: int, user=Depends(require_permission(PERM))):
    """Khôi phục nhân viên đi làm lại: gán is_active=1, xóa leave_date."""
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM staff WHERE id=?", (staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")

    cur.execute("""
        UPDATE staff
        SET is_active = 1, leave_date = NULL
        WHERE id = ?
    """, (staff_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã khôi phục nhân viên {st['name']} đi làm lại"}


@router.delete("/employees/{staff_id}")
def delete_hrm_employee(staff_id: int, user=Depends(require_permission(PERM))):
    """Xóa vĩnh viễn nhân sự khỏi hệ thống."""
    if staff_id == 1 or (user and staff_id == user.get("id")):
        raise HTTPException(400, "Không thể xóa tài khoản quản trị gốc hoặc tài khoản đang đăng nhập")
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name, username FROM staff WHERE id=?", (staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")
    if (st["username"] or "").lower() == "admin":
        conn.close()
        raise HTTPException(400, "Không thể xóa tài khoản admin hệ thống")

    from routers.auth import purge_staff_safely
    purge_staff_safely(cur, staff_id)
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Đã xóa nhân viên {st['name']}"}


class QuickAccountIn(BaseModel):
    username: str
    password: str
    role: Optional[str] = "staff"


class BatchAccountItemIn(BaseModel):
    staff_id: int
    username: str
    password: Optional[str] = "123456"
    role: Optional[str] = "staff"


class BatchAccountsIn(BaseModel):
    accounts: List[BatchAccountItemIn]


class ImportStaffSheetIn(BaseModel):
    sheet_url: Optional[str] = None


@router.get("/employees/sheet-config")
def get_staff_sheet_config(user=Depends(require_permission(PERM))):
    from scripts.import_hrm_from_sheets import DEFAULT_SHEET_URL
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'hrm_staff_sheet_url'")
    row = cur.fetchone()
    conn.close()
    url = (row["value"].strip() if row and row["value"] and row["value"].strip() else DEFAULT_SHEET_URL)
    return {"sheet_url": url}


@router.post("/employees/import-sheet")
def import_employees_from_sheet(body: ImportStaffSheetIn = None, user=Depends(require_permission(PERM))):
    """Import danh sách nhân sự, điều chỉnh lương & mã máy chấm công từ Google Sheet."""
    from scripts.import_hrm_from_sheets import DEFAULT_SHEET_URL, fetch_and_import_from_google_sheet
    conn = get_db(); cur = conn.cursor()
    sheet_url = (body.sheet_url.strip() if body and body.sheet_url and body.sheet_url.strip() else None)
    if not sheet_url:
        cur.execute("SELECT value FROM settings WHERE key = 'hrm_staff_sheet_url'")
        row = cur.fetchone()
        sheet_url = (row["value"].strip() if row and row["value"] and row["value"].strip() else DEFAULT_SHEET_URL)
    else:
        cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('hrm_staff_sheet_url', ?)", (sheet_url,))

    try:
        res = fetch_and_import_from_google_sheet(cur, sheet_url)
    except Exception as e:
        conn.close()
        raise HTTPException(400, f"Lỗi đồng bộ Google Sheet: {e}")

    # Lấy danh sách nhân sự đang làm việc nhưng chưa có tài khoản đăng nhập để gợi ý cấp TK nhanh
    cur.execute("""
        SELECT s.id, s.name, s.phone, s.employee_code, s.device_code, s.department, s.position,
               s.work_block_id, b.name AS block_name, s.base_salary, s.allowance, s.is_active,
               (CASE WHEN s.username IS NOT NULL AND TRIM(s.username) != '' AND s.password_hash IS NOT NULL THEN 1 ELSE 0 END) AS has_account
        FROM staff s
        LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
        WHERE COALESCE(s.is_payroll_staff, 1) = 1
          AND COALESCE(s.is_active, 1) = 1
          AND (s.username IS NULL OR TRIM(s.username) = '' OR s.password_hash IS NULL)
        ORDER BY COALESCE(s.employee_code, 'zz'), s.id
    """)
    unlinked = [dict(r) for r in cur.fetchall()]
    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "imported_staff": res["imported_staff"],
        "updated_staff": res["updated_staff"],
        "imported_adjustments": res["imported_adjustments"],
        "pending_accounts": unlinked,
        "message": (
            f"Đã đồng bộ Google Sheet: thêm mới {res['imported_staff']} NV, "
            f"cập nhật {res['updated_staff']} NV, nạp {res['imported_adjustments']} quyết định điều chỉnh lương."
        ),
    }


@router.post("/employees/batch-accounts")
def batch_grant_accounts(body: BatchAccountsIn, user=Depends(require_permission(PERM))):
    """Cấp tài khoản đăng nhập hàng loạt cho danh sách nhân viên được chọn."""
    if not body.accounts:
        raise HTTPException(400, "Danh sách nhân viên cấp tài khoản trống")

    from routers.auth import pwd_ctx
    conn = get_db(); cur = conn.cursor()
    created_count = 0
    errors = []

    for item in body.accounts:
        uname = (item.username or "").strip()
        pwd = (item.password or "123456").strip()
        role = (item.role or "staff").strip()
        if role not in ("owner", "cashier", "accountant", "warehouse", "staff"):
            role = "staff"
        if not uname:
            errors.append(f"NV ID #{item.staff_id}: thiếu tên đăng nhập")
            continue
        if len(pwd) < 6:
            errors.append(f"'{uname}': mật khẩu phải từ 6 ký tự")
            continue

        cur.execute("SELECT id, name FROM staff WHERE id = ?", (item.staff_id,))
        st = cur.fetchone()
        if not st:
            errors.append(f"NV ID #{item.staff_id}: không tồn tại")
            continue

        cur.execute("SELECT id, name FROM staff WHERE LOWER(username) = LOWER(?) AND id != ?", (uname, item.staff_id))
        dup = cur.fetchone()
        if dup:
            errors.append(f"Username '{uname}' ({st['name']}) đã trùng với {dup['name']}")
            continue

        pwd_hash = pwd_ctx.hash(pwd)
        cur.execute("""
            UPDATE staff
            SET username = ?, password_hash = ?, role = ?, must_change_password = 1, token_version = COALESCE(token_version, 0) + 1
            WHERE id = ?
        """, (uname, pwd_hash, role, item.staff_id))
        created_count += 1

    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "created_count": created_count,
        "errors": errors,
        "message": f"Đã tạo thành công {created_count} tài khoản đăng nhập POS.",
    }


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
    if not parsed["rows"]:
        raise HTTPException(400, "; ".join(parsed["errors"][:3]) or "File không có dòng chấm công nào")
    from services.attendance_import import _code, _norm
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, name, device_code FROM staff WHERE COALESCE(is_payroll_staff, 1) = 1")
    staff_rows = cur.fetchall()
    by_code = {_code(r["device_code"]): r["id"] for r in staff_rows if (r["device_code"] or "").strip()}
    # Dự phòng: NV CHƯA có mã máy thì khớp theo họ tên (chỉ khi tên là duy nhất).
    # NV đã có mã mà lệch -> báo không khớp, không âm thầm gán theo tên (mã là nguồn chuẩn).
    name_ids = {}
    for r in staff_rows:
        name_ids.setdefault(_norm(r["name"]), []).append(r)
    imported, skipped_manual, locked = 0, 0, 0
    unknown, matched_by_name = {}, {}
    for row in parsed["rows"]:
        sid = by_code.get(row["device_code"])
        if not sid:
            cands = name_ids.get(_norm(row["name"])) or []
            if len(cands) == 1 and not (cands[0]["device_code"] or "").strip():
                sid = cands[0]["id"]
                matched_by_name[row["device_code"]] = row["name"]
                # Lưu luôn mã máy (lần sau khớp theo mã, hết cảnh báo "Chưa có mã máy")
                cur.execute("UPDATE staff SET device_code = ? WHERE id = ? AND COALESCE(device_code, '') = ''",
                            (row["device_code"], sid))
                by_code[row["device_code"]] = sid
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
            "unknown_codes": [{"device_code": k, "name": v} for k, v in unknown.items()],
            "matched_by_name": [{"device_code": k, "name": v} for k, v in matched_by_name.items()],
            "errors": parsed["errors"]}


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
    return {
        "month": month,
        "status": status,
        "days_in_month": last.day,
        "rules": {
            "late_per_min": rules.late_per_min,
            "late_flat": rules.late_flat,
            "late_flat_threshold_min": rules.late_flat_threshold_min,
            "missing_punch": rules.missing_punch,
            "absent": rules.absent,
        },
        "employees": out,
    }


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


# ── Chấm công làm ở nhà (WFH / Remote Self Check-in & Check-out) ──
def get_self_attendance_status(cur, staff_id: int, ref_today: Optional[date] = None) -> dict:
    today = ref_today or date.today()
    cur.execute("""
        SELECT s.*, b.name AS block_name, b.start_time, b.end_time
        FROM staff s
        LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
        WHERE s.id = ?
    """, (staff_id,))
    row = cur.fetchone()
    if not row:
        return {"allow_remote_checkin": False, "work_date": today.isoformat(), "punches": []}
    s = dict(row)
    allow_remote = bool(s.get("allow_remote_checkin"))
    cur.execute("SELECT punches, leave_type, note, source FROM staff_attendance WHERE staff_id = ? AND work_date = ?",
                (staff_id, today.isoformat()))
    att_row = cur.fetchone()
    punches = json.loads(att_row["punches"] or "[]") if att_row and att_row["punches"] else []

    rules = ps.load_rules(cur)
    blocks = ps.load_blocks(cur)
    block = blocks.get(s.get("work_block_id"))
    first = date(today.year, today.month, 1)
    import calendar
    last = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    today_res = {"check_in": punches[0] if punches else "", "check_out": punches[-1] if len(punches) >= 2 else "",
                 "code": "", "credit": 0.0, "worked_min": 0, "late_min": 0}
    month_credit = 0.0
    if block:
        days = ps.build_days(cur, s, block, rules, first, last, today)
        month_credit = round(sum(float(d.credit) for d in days), 2)
        for d in days:
            if d.work_date == today:
                today_res = ps.day_to_dict(d)
                break

    shift_label = f"{s.get('start_time')} - {s.get('end_time')}" if s.get("start_time") and s.get("end_time") else ""
    actual_in = punches[0] if len(punches) >= 1 else ""
    actual_out = punches[-1] if len(punches) >= 2 else ""
    return {
        "allow_remote_checkin": allow_remote,
        "work_date": today.isoformat(),
        "block_name": s.get("block_name") or "",
        "shift_label": shift_label,
        "punches": punches,
        "check_in": actual_in,
        "check_out": actual_out,
        "code": today_res.get("code") if len(punches) >= 2 else "",
        "credit": float(today_res.get("credit") or 0) if len(punches) >= 2 else 0.0,
        "worked_min": int(today_res.get("worked_min") or 0) if len(punches) >= 2 else 0,
        "late_min": int(today_res.get("late_min") or 0),
        "month_days_credit": month_credit,
        "source": att_row["source"] if att_row else "",
    }


class SelfPunchIn(BaseModel):
    note: Optional[str] = ""


@router.get("/self-attendance/today")
def api_get_self_attendance_today(user=Depends(get_current_user)):
    conn = get_db(); cur = conn.cursor()
    try:
        return get_self_attendance_status(cur, user["id"])
    finally:
        conn.close()


@router.post("/self-attendance/punch")
def api_punch_self_attendance(body: SelfPunchIn = None, user=Depends(get_current_user)):
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("SELECT id, name, role, allow_remote_checkin FROM staff WHERE id = ?", (user["id"],))
        st = cur.fetchone()
        if not st:
            raise HTTPException(404, "Không tìm thấy hồ sơ nhân viên")
        if not st["allow_remote_checkin"] and user.get("role") not in ("owner", "admin"):
            raise HTTPException(403, "Tài khoản chưa được bật chế độ Chấm công làm ở nhà (WFH). Vui lòng nhờ Quản lý bật trong Hồ sơ Nhân sự.")

        now_dt = datetime.now()
        today_iso = now_dt.date().isoformat()
        now_hm = now_dt.strftime("%H:%M")
        ps.assert_month_open(cur, today_iso)

        cur.execute("SELECT punches, note FROM staff_attendance WHERE staff_id = ? AND work_date = ?", (user["id"], today_iso))
        existing = cur.fetchone()
        old_punches = json.loads(existing["punches"] or "[]") if existing and existing["punches"] else []
        valid_mins = sorted({to_min(p) for p in old_punches if to_min(p) is not None})
        now_min = to_min(now_hm)

        if not valid_mins:
            new_mins = [now_min]
            action_done = "check_in"
            msg = f"Đã chấm công VÀO CA lúc {now_hm} (Làm tại nhà)"
        elif len(valid_mins) == 1:
            if valid_mins[0] == now_min:
                new_mins = valid_mins
                action_done = "already_checked_in"
                msg = f"Đã ghi nhận giờ vào ca {now_hm}. Cuối giờ bạn bấm lại để chấm Tan Ca nhé!"
            else:
                new_mins = sorted({valid_mins[0], now_min})
                action_done = "check_out"
                msg = f"Đã chấm công TAN CA lúc {now_hm} (Vào {new_mins[0]//60:02d}:{new_mins[0]%60:02d} - Ra {new_mins[-1]//60:02d}:{new_mins[-1]%60:02d})"
        else:
            first_m = valid_mins[0]
            last_m = max(valid_mins[-1], now_min) if now_min >= first_m else now_min
            new_mins = sorted({first_m, last_m})
            action_done = "update_check_out"
            msg = f"Đã cập nhật giờ TAN CA lúc {now_hm} (Vào {new_mins[0]//60:02d}:{new_mins[0]%60:02d} - Ra {new_mins[-1]//60:02d}:{new_mins[-1]%60:02d})"

        note_in = (body.note or "").strip() if body else ""
        old_note = (existing["note"] or "").strip() if existing else ""
        final_note = note_in or old_note or "Chấm công Online (WFH)"
        punches_json = json.dumps([f"{m // 60:02d}:{m % 60:02d}" for m in new_mins])

        cur.execute("""
            INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
            VALUES (?, ?, ?, NULL, 0, ?, 'manual', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(staff_id, work_date) DO UPDATE SET
                punches = excluded.punches,
                note = excluded.note,
                source = 'manual',
                updated_by = excluded.updated_by,
                updated_at = CURRENT_TIMESTAMP
        """, (user["id"], today_iso, punches_json, final_note, _uname(user)))
        conn.commit()
        return {
            "status": "ok",
            "action_done": action_done,
            "message": msg,
            "attendance": get_self_attendance_status(cur, user["id"], now_dt.date()),
        }
    finally:
        conn.close()


@router.get("/payroll-columns")
def get_payroll_visible_columns(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'hrm_payroll_visible_cols'")
    row = cur.fetchone()
    conn.close()
    cols = json.loads(row["value"]) if row and row["value"] else None
    return {"columns": cols}


@router.put("/payroll-columns")
def save_payroll_visible_columns(body: dict, user=Depends(require_permission(PERM))):
    cols = body.get("columns")
    if not isinstance(cols, dict):
        raise HTTPException(400, "columns phải là object {col_key: bool}")
    clean = {str(k): bool(v) for k, v in cols.items()}
    conn = get_db(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO settings (key, value) VALUES ('hrm_payroll_visible_cols', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, (json.dumps(clean),))
    conn.commit(); conn.close()
    return {"status": "ok", "columns": clean}


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
    cur.execute("SELECT id, employee_code, name FROM staff WHERE COALESCE(is_payroll_staff, 1) = 1")
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


DEFAULT_DEPT_COMM_POLICIES = [
    {
        "dept": "Bán Lẻ POS",
        "icon": "🛒",
        "color": "sky",
        "pos_rate": 3.0,
        "spa_on": 0,
        "tmdt_on": 0,
        "desc": "Hưởng % trên Doanh số POS thuần (sau chiết khấu & trả hàng)."
    },
    {
        "dept": "Spa & Grooming",
        "icon": "✂️",
        "color": "purple",
        "pos_rate": 1.5,
        "spa_on": 1,
        "tmdt_on": 0,
        "desc": "Hưởng hoa hồng theo vai trò trên phiếu Spa + 100% Tip + % bán kèm POS."
    },
    {
        "dept": "Sales Online & TMĐT",
        "icon": "🛍️",
        "color": "amber",
        "pos_rate": 2.0,
        "spa_on": 0,
        "tmdt_on": 1,
        "desc": "Hưởng bậc thang đơn Sàn/POSCAKE + Thưởng video KOC/TikTok + % POS."
    },
    {
        "dept": "Kho & Khách Sạn",
        "icon": "🏨",
        "color": "emerald",
        "pos_rate": 1.0,
        "spa_on": 0,
        "tmdt_on": 0,
        "desc": "Phụ trách lưu trú Khách sạn thú cưng & quản lý kho hàng."
    },
]


def _load_dept_comm_policies(cur):
    cur.execute("SELECT value FROM settings WHERE key = 'hrm_dept_commission_policies'")
    row = cur.fetchone()
    if row and row["value"]:
        try:
            data = json.loads(row["value"])
            if isinstance(data, list) and len(data) > 0:
                return data
        except Exception:
            pass
    cur.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('hrm_dept_commission_policies', ?)",
        (json.dumps(DEFAULT_DEPT_COMM_POLICIES, ensure_ascii=False),)
    )
    return DEFAULT_DEPT_COMM_POLICIES


def _ensure_staff_comm_cols(cur):
    cur.execute("PRAGMA table_info(staff)")
    cols = {r[1] for r in cur.fetchall()}
    if "commission_policy_mode" not in cols:
        cur.execute("ALTER TABLE staff ADD COLUMN commission_policy_mode TEXT DEFAULT 'dept'")
    if "enable_spa_commission" not in cols:
        cur.execute("ALTER TABLE staff ADD COLUMN enable_spa_commission INTEGER DEFAULT 1")
    if "enable_tmdt_commission" not in cols:
        cur.execute("ALTER TABLE staff ADD COLUMN enable_tmdt_commission INTEGER DEFAULT 1")
    if "spa_commission_tier" not in cols:
        cur.execute("ALTER TABLE staff ADD COLUMN spa_commission_tier TEXT DEFAULT 'official'")
    if "spa_commission_profile_id" not in cols:
        cur.execute("ALTER TABLE staff ADD COLUMN spa_commission_profile_id TEXT DEFAULT ''")


# ── Xem & Tính Hoa Hồng Tổng Hợp (POS + Spa + Sàn TMĐT + KOC) ──
@router.get("/commissions/{month}")
def get_commissions_breakdown(month: str, user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    from_dt = f"{first.isoformat()} 00:00:00"
    to_dt = f"{last.isoformat()} 23:59:59"

    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    dept_policies = _load_dept_comm_policies(cur)
    dept_policy_map = {p["dept"]: p for p in dept_policies}

    # Tự động khởi tạo quy tắc hoa hồng Spa mặc định nếu bảng đang trống để tính ngay được
    cur.execute("SELECT COUNT(*) FROM spa_commission_rules")
    if cur.fetchone()[0] == 0:
        default_spa_rules = [
            ("receiver", None, "percent", 2.0, 1),
            ("worker_1", None, "percent", 10.0, 1),
            ("worker_2", None, "percent", 8.0, 1),
            ("cutter", None, "percent", 12.0, 1),
            ("dyer", None, "percent", 10.0, 1),
        ]
        cur.executemany(
            "INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value, is_active) VALUES (?,?,?,?,?)",
            default_spa_rules
        )
    conn.commit()

    cur.execute("SELECT * FROM spa_commission_rules ORDER BY role_key, id")
    spa_rules = [dict(r) for r in cur.fetchall()]

    from services.commission import (
        sales_commission_by_staff,
        spa_commission_by_name,
        load_spa_commission_config,
        EXCLUDED_ORDER_STATUSES,
    )
    from services.pancake import commission_by_staff as pancake_commission_by_staff
    from services.koc_service import commission_by_staff as koc_commission_by_staff

    spa_matrix_config = load_spa_commission_config(cur)
    conn.commit()
    pos_sales = sales_commission_by_staff(cur, from_dt, to_dt)
    try:
        pancake_sales = pancake_commission_by_staff(cur, first.isoformat(), last.isoformat())
    except Exception:
        pancake_sales = {}
    try:
        koc_sales = koc_commission_by_staff(cur, month)
    except Exception:
        koc_sales = {}
    spa_map = spa_commission_by_name(cur, first.isoformat(), last.isoformat())

    # Đếm số đơn POS theo nhân viên
    ph = ",".join("?" for _ in EXCLUDED_ORDER_STATUSES)
    cur.execute(f"""
        SELECT staff_id, COUNT(*) as cnt
        FROM orders
        WHERE staff_id IS NOT NULL
          AND COALESCE(status, '') NOT IN ({ph})
          AND datetime(created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY staff_id
    """, (*EXCLUDED_ORDER_STATUSES, from_dt, to_dt))
    pos_order_counts = {r["staff_id"]: r["cnt"] for r in cur.fetchall()}

    # Danh sách nhân viên
    cur.execute("""
        SELECT s.id, s.name, s.employee_code, s.department, s.position, s.role, s.commission_rate,
               s.is_spa_worker, s.is_active,
               COALESCE(s.commission_policy_mode, 'dept') as commission_policy_mode,
               COALESCE(s.enable_spa_commission, 1) as enable_spa_commission,
               COALESCE(s.enable_tmdt_commission, 1) as enable_tmdt_commission,
               COALESCE(s.spa_commission_tier, 'official') as spa_commission_tier,
               COALESCE(s.spa_commission_profile_id, '') as spa_commission_profile_id,
               b.name as block_name
        FROM staff s
        LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
        WHERE COALESCE(s.is_active, 1) = 1
          AND COALESCE(s.is_payroll_staff, 1) = 1
        ORDER BY COALESCE(s.employee_code, 'zz'), s.id ASC
    """)
    staff_rows = [dict(r) for r in cur.fetchall()]

    matched_spa_keys = set()
    items = []

    for st in staff_rows:
        sid = st["id"]
        sname_low = (st["name"] or "").strip().lower()
        p_info = pos_sales.get(sid, {})
        pk_info = pancake_sales.get(sid, {})
        kc_info = koc_sales.get(sid, {})
        sp_info = spa_map.get(sname_low, {})
        if sname_low in spa_map:
            matched_spa_keys.add(sname_low)

        dept = (st.get("department") or "").strip()
        if not dept:
            dept = "Spa & Grooming" if st.get("is_spa_worker") else "Bán Lẻ POS"

        spa_on = int(st.get("enable_spa_commission", 1) or 0)
        tmdt_on = int(st.get("enable_tmdt_commission", 1) or 0)

        pos_rev = round(float(p_info.get("revenue") or 0))
        pos_ret = round(float(p_info.get("returns") or 0))
        pos_net = round(float(p_info.get("net") or 0))
        pos_rate = float(st.get("commission_rate") or 0)
        pos_comm = round(float(p_info.get("commission") or 0))

        pk_rev = round(float(pk_info.get("revenue") or 0))
        pk_comm = round(float(pk_info.get("commission") or 0)) if tmdt_on else 0
        kc_comm = round(float(kc_info.get("commission") or 0)) if tmdt_on else 0

        spa_tickets = int(sp_info.get("tickets") or 0)
        spa_rev = round(float(sp_info.get("service_revenue") or 0))
        spa_comm = round(float(sp_info.get("commission") or 0)) if spa_on else 0
        spa_tips = round(float(sp_info.get("tips") or 0)) if spa_on else 0
        role_counts = sp_info.get("role_counts") or {}

        total_income_comm = pos_comm + pk_comm + kc_comm + spa_comm + spa_tips

        items.append({
            "staff_id": sid,
            "employee_code": st.get("employee_code") or "",
            "name": st["name"],
            "department": dept,
            "position": st.get("position") or st.get("role") or "Nhân viên",
            "block_name": st.get("block_name") or "",
            "is_unlinked_spa": False,
            "policy_mode": st.get("commission_policy_mode") or "dept",
            "commission_rate": pos_rate,
            "enable_spa_commission": spa_on,
            "enable_tmdt_commission": tmdt_on,
            "spa_commission_tier": st.get("spa_commission_tier") or "official",
            "spa_commission_profile_id": st.get("spa_commission_profile_id") or "",
            "pos_orders": pos_order_counts.get(sid, 0),
            "pos_revenue": pos_rev,
            "pos_returns": pos_ret,
            "pos_net": pos_net,
            "pos_commission": pos_comm,
            "pancake_revenue": pk_rev,
            "pancake_commission": pk_comm,
            "koc_commission": kc_comm,
            "spa_tickets": spa_tickets,
            "spa_revenue": spa_rev,
            "spa_commission": spa_comm,
            "spa_tips": spa_tips,
            "spa_role_counts": role_counts,
            "spa_breakdown": sp_info.get("breakdown") or {"bath": 0, "cut": 0, "dye": 0, "surcharge": 0, "receiver": 0},
            "total_commission": total_income_comm
        })

    # Bổ sung những tên thợ Spa có trên phiếu dịch vụ nhưng chưa tạo hồ sơ nhân sự trong bảng `staff`
    for k_low, sp_info in spa_map.items():
        if k_low in matched_spa_keys:
            continue
        spa_comm = round(float(sp_info.get("commission") or 0))
        spa_tips = round(float(sp_info.get("tips") or 0))
        spa_pol = dept_policy_map.get("Spa & Grooming", {"pos_rate": 1.5})
        items.append({
            "staff_id": None,
            "employee_code": "THO-SPA",
            "name": sp_info.get("display_name") or k_low.title(),
            "department": "Spa & Grooming",
            "position": "Thợ Spa (Chưa tạo hồ sơ NV)",
            "block_name": "Khối Spa",
            "is_unlinked_spa": True,
            "policy_mode": "dept",
            "commission_rate": float(spa_pol.get("pos_rate") or 0),
            "enable_spa_commission": 1,
            "enable_tmdt_commission": 0,
            "pos_orders": 0,
            "pos_revenue": 0,
            "pos_returns": 0,
            "pos_net": 0,
            "pos_commission": 0,
            "pancake_revenue": 0,
            "pancake_commission": 0,
            "koc_commission": 0,
            "spa_tickets": int(sp_info.get("tickets") or 0),
            "spa_revenue": round(float(sp_info.get("service_revenue") or 0)),
            "spa_commission": spa_comm,
            "spa_tips": spa_tips,
            "spa_commission_tier": "official",
            "spa_commission_profile_id": "",
            "spa_role_counts": sp_info.get("role_counts") or {},
            "spa_breakdown": sp_info.get("breakdown") or {"bath": 0, "cut": 0, "dye": 0, "surcharge": 0, "receiver": 0},
            "total_commission": spa_comm + spa_tips
        })

    items.sort(key=lambda x: (x["total_commission"], x["pos_net"], x["spa_revenue"]), reverse=True)

    summary = {
        "pos_net_total": sum(x["pos_net"] for x in items),
        "pos_commission_total": sum(x["pos_commission"] for x in items),
        "tmdt_commission_total": sum(x["pancake_commission"] + x["koc_commission"] for x in items),
        "spa_revenue_total": sum(x["spa_revenue"] for x in items),
        "spa_commission_total": sum(x["spa_commission"] for x in items),
        "spa_tips_total": sum(x["spa_tips"] for x in items),
        "grand_total": sum(x["total_commission"] for x in items)
    }

    conn.close()
    return {
        "month": month,
        "summary": summary,
        "dept_policies": dept_policies,
        "spa_rules": spa_rules,
        "spa_matrix_config": spa_matrix_config,
        "items": items
    }


def _recalc_staff_orders_comm(cur, staff_id: int, rate: float, month: str | None):
    if not month:
        return
    try:
        _, _, first, last = ps.parse_month(month)
        cur.execute("""
            UPDATE orders
            SET commission_amount = ROUND(MAX(0, COALESCE(total_amount,0) - COALESCE(discount,0)) * ? / 100.0)
            WHERE staff_id = ?
              AND datetime(created_at, '+7 hours') BETWEEN ? AND ?
        """, (rate, staff_id, f"{first.isoformat()} 00:00:00", f"{last.isoformat()} 23:59:59"))
    except Exception:
        pass


@router.put("/commissions/dept-policies")
def update_dept_comm_policies(body: dict, user=Depends(require_permission(PERM))):
    """Lưu quy định hoa hồng của Bộ phận và (tuỳ chọn) áp dụng cho toàn bộ nhân viên thuộc bộ phận đó."""
    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    policies = _load_dept_comm_policies(cur)

    target_dept = (body.get("dept") or "").strip()
    pos_rate = float(body.get("pos_rate") or 0.0)
    spa_on = 1 if body.get("spa_on") else 0
    tmdt_on = 1 if body.get("tmdt_on") else 0
    apply_to_staff = bool(body.get("apply_to_staff", True))
    month = body.get("month")

    found = False
    for p in policies:
        if p["dept"] == target_dept:
            p["pos_rate"] = pos_rate
            p["spa_on"] = spa_on
            p["tmdt_on"] = tmdt_on
            found = True
            break
    if not found and target_dept:
        policies.append({
            "dept": target_dept,
            "icon": "🏢",
            "color": "sky",
            "pos_rate": pos_rate,
            "spa_on": spa_on,
            "tmdt_on": tmdt_on,
            "desc": "Quy định hoa hồng theo bộ phận"
        })

    cur.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('hrm_dept_commission_policies', ?)",
        (json.dumps(policies, ensure_ascii=False),)
    )

    updated_count = 0
    if apply_to_staff and target_dept:
        # Áp dụng cho tất cả nhân viên thuộc bộ phận này (trừ những người đang khóa 'custom' nếu force_all=False)
        force_all = bool(body.get("force_all", True))
        if force_all:
            cur.execute("""
                SELECT id FROM staff
                WHERE COALESCE(is_active, 1) = 1
                  AND (department = ? OR ((department IS NULL OR department = '') AND ? = CASE WHEN is_spa_worker = 1 THEN 'Spa & Grooming' ELSE 'Bán Lẻ POS' END))
            """, (target_dept, target_dept))
        else:
            cur.execute("""
                SELECT id FROM staff
                WHERE COALESCE(is_active, 1) = 1
                  AND COALESCE(commission_policy_mode, 'dept') = 'dept'
                  AND (department = ? OR ((department IS NULL OR department = '') AND ? = CASE WHEN is_spa_worker = 1 THEN 'Spa & Grooming' ELSE 'Bán Lẻ POS' END))
            """, (target_dept, target_dept))
        staff_ids = [r["id"] for r in cur.fetchall()]
        for sid in staff_ids:
            cur.execute("""
                UPDATE staff
                SET department = ?,
                    commission_policy_mode = 'dept',
                    commission_rate = ?,
                    enable_spa_commission = ?,
                    enable_tmdt_commission = ?
                WHERE id = ?
            """, (target_dept, pos_rate, spa_on, tmdt_on, sid))
            _recalc_staff_orders_comm(cur, sid, pos_rate, month)
            updated_count += 1

    conn.commit()
    conn.close()
    return {"status": "ok", "updated_staff": updated_count, "dept_policies": policies}


@router.put("/commissions/staff-policy/{staff_id}")
def update_staff_commission_policy(staff_id: int, body: dict, user=Depends(require_permission(PERM))):
    """Gán Bộ phận, Chế độ quy định ('dept'|'custom'), % POS, bật/tắt Hoa hồng Spa & TMĐT cho 1 nhân viên."""
    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    policies = {p["dept"]: p for p in _load_dept_comm_policies(cur)}

    cur.execute("SELECT * FROM staff WHERE id = ?", (staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")
    st = dict(st)

    dept = (body.get("department") if "department" in body else st.get("department")) or "Bán Lẻ POS"
    mode = (body.get("policy_mode") if "policy_mode" in body else st.get("commission_policy_mode")) or "dept"
    month = body.get("month")

    if mode == "dept" and dept in policies and not body.get("manual_override"):
        pol = policies[dept]
        pos_rate = float(pol.get("pos_rate") or 0.0)
        spa_on = int(pol.get("spa_on") or 0)
        tmdt_on = int(pol.get("tmdt_on") or 0)
    else:
        pos_rate = float(body.get("commission_rate") if "commission_rate" in body else (st.get("commission_rate") or 0.0))
        spa_on = int(body.get("enable_spa_commission") if "enable_spa_commission" in body else st.get("enable_spa_commission", 1))
        tmdt_on = int(body.get("enable_tmdt_commission") if "enable_tmdt_commission" in body else st.get("enable_tmdt_commission", 1))

    is_spa_worker = 1 if dept == "Spa & Grooming" else int(st.get("is_spa_worker") or 0)
    spa_tier = (body.get("spa_commission_tier") if "spa_commission_tier" in body else st.get("spa_commission_tier")) or "official"
    if spa_tier not in ("official", "probation"):
        spa_tier = "official"
    spa_prof_id = (body.get("spa_commission_profile_id") if "spa_commission_profile_id" in body else st.get("spa_commission_profile_id")) or ""

    cur.execute("""
        UPDATE staff
        SET department = ?,
            commission_policy_mode = ?,
            commission_rate = ?,
            enable_spa_commission = ?,
            enable_tmdt_commission = ?,
            is_spa_worker = ?,
            spa_commission_tier = ?,
            spa_commission_profile_id = ?
        WHERE id = ?
    """, (dept, mode, pos_rate, spa_on, tmdt_on, is_spa_worker, spa_tier, spa_prof_id, staff_id))

    _recalc_staff_orders_comm(cur, staff_id, pos_rate, month)
    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "staff_id": staff_id,
        "department": dept,
        "policy_mode": mode,
        "commission_rate": pos_rate,
        "enable_spa_commission": spa_on,
        "enable_tmdt_commission": tmdt_on,
        "spa_commission_tier": spa_tier,
        "spa_commission_profile_id": spa_prof_id
    }


@router.put("/commissions/spa-matrix")
def update_spa_commission_matrix(body: dict, user=Depends(require_permission(PERM))):
    """Lưu cấu hình Ma trận Hoa hồng Spa Đa Cơ sở (Multi-Branch Profiles: Bậc cân nặng, Chính thức / Thử việc, 7 cột Phụ thu)."""
    from services.commission import save_spa_commission_config
    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    saved = save_spa_commission_config(cur, body)
    conn.commit()
    conn.close()
    return {"status": "ok", "spa_matrix_config": saved}


@router.put("/commissions/staff-rate/{staff_id}")
def update_staff_commission_rate(staff_id: int, body: dict, user=Depends(require_permission(PERM))):
    try:
        rate = float(body.get("commission_rate") or 0.0)
    except Exception:
        raise HTTPException(400, "Tỷ lệ hoa hồng không hợp lệ")
    if rate < 0 or rate > 100:
        raise HTTPException(400, "Tỷ lệ hoa hồng phải từ 0% đến 100%")
    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    cur.execute("UPDATE staff SET commission_rate = ?, commission_policy_mode = 'custom' WHERE id = ?", (rate, staff_id))
    _recalc_staff_orders_comm(cur, staff_id, rate, body.get("month"))
    conn.commit()
    conn.close()
    return {"status": "ok", "commission_rate": rate}


@router.post("/commissions/sync-spa-workers")
def sync_unlinked_spa_workers(body: dict, user=Depends(require_permission(PERM))):
    """Tự động tạo hồ sơ nhân sự trong bảng `staff` cho các thợ Spa có tên trên phiếu nhưng chưa có hồ sơ."""
    month = body.get("month") or date.today().strftime("%Y-%m")
    _, _, first, last = ps.parse_month(month)
    conn = get_db()
    cur = conn.cursor()
    _ensure_staff_comm_cols(cur)
    policies = {p["dept"]: p for p in _load_dept_comm_policies(cur)}
    spa_pol = policies.get("Spa & Grooming", {"pos_rate": 1.5, "spa_on": 1, "tmdt_on": 0})

    from services.commission import spa_commission_by_name
    spa_map = spa_commission_by_name(cur, first.isoformat(), last.isoformat())
    cur.execute("SELECT LOWER(TRIM(name)) as n FROM staff")
    existing_names = {r["n"] for r in cur.fetchall() if r["n"]}
    cur.execute("SELECT id FROM hrm_work_blocks ORDER BY id ASC LIMIT 1")
    blk_row = cur.fetchone()
    blk_id = blk_row["id"] if blk_row else None

    created = 0
    for k_low, sp_info in spa_map.items():
        if k_low not in existing_names:
            disp_name = sp_info.get("display_name") or k_low.title()
            cur.execute("""
                INSERT INTO staff (
                    name, role, department, position, work_block_id,
                    is_spa_worker, is_payroll_staff, is_active,
                    commission_policy_mode, commission_rate,
                    enable_spa_commission, enable_tmdt_commission, base_salary
                )
                VALUES (?, 'staff', 'Spa & Grooming', 'Chuyên viên Spa', ?, 1, 1, 1, 'dept', ?, ?, ?, 6000000)
            """, (
                disp_name, blk_id,
                float(spa_pol.get("pos_rate") or 1.5),
                int(spa_pol.get("spa_on", 1)),
                int(spa_pol.get("tmdt_on", 0))
            ))
            sid = cur.lastrowid
            cur.execute("UPDATE staff SET employee_code = ? WHERE id = ?", (f"SPA{sid:02d}", sid))
            created += 1
            existing_names.add(k_low)

    conn.commit()
    conn.close()
    return {"status": "ok", "created": created, "message": f"Đã đồng bộ {created} thợ Spa vào Bộ phận Spa & Grooming!"}


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
    if staff_id and (
        user.get("role") in ("owner", "admin", "accountant", "manager")
        or check_permission(user["id"], user.get("role", ""), PERM)
    ):
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
