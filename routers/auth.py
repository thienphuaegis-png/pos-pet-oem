import os
import jwt
import datetime
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import Optional
from database import get_db
from dependencies import get_current_user, require_role, get_user_effective_permissions, oauth2_scheme, SECRET, ALGO

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _make_token(staff_id: int, token_version: int = 0, hours: int = 8, typ: str = "access") -> str:
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)
    return jwt.encode({"sub": str(staff_id), "tv": token_version, "exp": exp, "typ": typ}, SECRET, algorithm=ALGO)


@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    db = get_db()
    cur = db.cursor()
    client_ip = request.client.host if request.client else "unknown"

    # Chong brute-force: dem so lan sai lien tiep trong LOCKOUT_MINUTES gan nhat
    cur.execute(
        f"SELECT COUNT(*) c FROM login_attempts WHERE username=? AND success=0 "
        f"AND created_at >= datetime('now', '-{LOCKOUT_MINUTES} minutes')",
        (form.username,)
    )
    fail_count = cur.fetchone()["c"]
    if fail_count >= MAX_FAILED_ATTEMPTS:
        db.close()
        raise HTTPException(status_code=429, detail=f"Đăng nhập sai quá {MAX_FAILED_ATTEMPTS} lần, thử lại sau {LOCKOUT_MINUTES} phút")

    cur.execute(
        "SELECT id, password_hash, role, name, is_active, must_change_password, token_version, username FROM staff WHERE username=?",
        (form.username,)
    )
    user = cur.fetchone()
    ok = bool(user and user["username"] and user["password_hash"] and pwd_ctx.verify(form.password, user["password_hash"]) and user["is_active"])

    cur.execute("INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)",
                (form.username, client_ip, 1 if ok else 0))
    db.commit()

    if not user or not user["username"] or not user["password_hash"] or not pwd_ctx.verify(form.password, user["password_hash"]):
        db.close()
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
    if not user["is_active"]:
        db.close()
        raise HTTPException(status_code=401, detail="Tài khoản đã bị khóa")
    db.close()

    tv = user["token_version"] or 0
    access = _make_token(user["id"], tv, hours=8, typ="access")
    refresh = _make_token(user["id"], tv, hours=24 * 7, typ="refresh")
    perms = get_user_effective_permissions(user["id"], user["role"])
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "role": user["role"], "permissions": perms},
        "must_change_password": bool(user["must_change_password"]) if "must_change_password" in user.keys() else False
    }


@router.post("/refresh")
def refresh(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token hết hạn, vui lòng đăng nhập lại")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

    if payload.get("typ") != "refresh":
        raise HTTPException(status_code=401, detail="Token cung cấp không phải là refresh token")

    staff_id = payload.get("sub")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, name, role, is_active, must_change_password, token_version FROM staff WHERE id=?", (staff_id,))
    user = cur.fetchone()
    db.close()
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc bị khóa")
    if (user["token_version"] or 0) != payload.get("tv", 0):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại")

    return {
        "access_token": _make_token(user["id"], user["token_version"] or 0, hours=8, typ="access"),
        "token_type": "bearer"
    }


@router.get("/me")
def me(current: dict = Depends(get_current_user)):
    perms = get_user_effective_permissions(current["id"], current.get("role", ""))
    res = dict(current)
    res["permissions"] = perms
    return res


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
def change_password(body: ChangePasswordIn, current: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT password_hash FROM staff WHERE id=?", (current["id"],))
    row = cur.fetchone()
    if not row or not pwd_ctx.verify(body.old_password, row["password_hash"]):
        db.close()
        raise HTTPException(status_code=400, detail="Mật khẩu cũ không đúng")
    cur.execute(
        "UPDATE staff SET password_hash=?, token_version=token_version+1 WHERE id=?",
        (pwd_ctx.hash(body.new_password), current["id"])
    )
    cur.execute("UPDATE staff SET must_change_password=0 WHERE id=?", (current["id"],))
    db.commit()
    db.close()
    return {"message": "Đổi mật khẩu thành công"}


# ── Cấu hình AI cá nhân (Bring Your Own Key - BYOK) ──

class StaffAIConfigIn(BaseModel):
    ai_api_key: Optional[str] = ""
    ai_model: Optional[str] = "gemini-2.5-flash"


@router.get("/my-ai-config")
def get_my_ai_config(current: dict = Depends(get_current_user)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT ai_api_key, ai_model FROM staff WHERE id=?", (current["id"],))
    row = cur.fetchone()
    
    cur.execute("SELECT value FROM settings WHERE key='gemini_api_key'")
    shop_key_row = cur.fetchone()
    shop_has_key = bool(shop_key_row and shop_key_row[0] and shop_key_row[0].strip())
    db.close()

    key = (row["ai_api_key"] or "").strip() if row else ""
    model = (row["ai_model"] or "gemini-2.5-flash") if row else "gemini-2.5-flash"
    masked_key = ""
    if key:
        masked_key = key[:4] + "*" * max(0, len(key) - 8) + key[-4:] if len(key) > 8 else "***"

    return {
        "user_has_key": bool(key),
        "masked_key": masked_key,
        "ai_model": model,
        "shop_has_key": shop_has_key,
        "active_source": "personal" if bool(key) else ("shop" if shop_has_key else "none")
    }


@router.post("/my-ai-config")
def update_my_ai_config(body: StaffAIConfigIn, current: dict = Depends(get_current_user)):
    key = (body.ai_api_key or "").strip()
    model = (body.ai_model or "gemini-2.5-flash").strip()
    db = get_db()
    cur = db.cursor()
    cur.execute("UPDATE staff SET ai_api_key=?, ai_model=? WHERE id=?", (key, model, current["id"]))
    db.commit()
    db.close()
    return {
        "message": "Đã cập nhật cấu hình AI cá nhân",
        "user_has_key": bool(key),
        "ai_model": model
    }


# ── Staff Management (owner only) ──

class StaffCreate(BaseModel):
    name: str
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = "staff"  # cashier, accountant, warehouse, owner, staff
    phone: Optional[str] = ""
    commission_rate: Optional[float] = 0.0
    device_code: Optional[str] = None
    employee_code: Optional[str] = None
    base_salary: Optional[float] = 0.0
    allowance: Optional[float] = 0.0
    work_block_id: Optional[int] = None
    hire_date: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = "gemini-2.5-flash"
    is_payroll_staff: Optional[int] = 1


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    commission_rate: Optional[float] = None
    is_active: Optional[int] = None
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    device_code: Optional[str] = None
    employee_code: Optional[str] = None
    base_salary: Optional[float] = None
    allowance: Optional[float] = None
    work_block_id: Optional[int] = None
    hire_date: Optional[str] = None
    leave_date: Optional[str] = None
    revoke_account: Optional[bool] = False
    is_payroll_staff: Optional[int] = None


@router.get("/staff")
def list_staff(current: dict = Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    cur.execute("""
        SELECT id, name, username, role, phone, commission_rate, is_active, created_at,
               (CASE WHEN ai_api_key IS NOT NULL AND TRIM(ai_api_key) != '' THEN 1 ELSE 0 END) as has_ai_key,
               ai_model,
               (CASE WHEN username IS NOT NULL AND TRIM(username) != '' AND password_hash IS NOT NULL THEN 1 ELSE 0 END) as has_account,
               device_code, employee_code, base_salary, allowance, work_block_id, hire_date, leave_date,
               COALESCE(is_payroll_staff, 1) as is_payroll_staff
        FROM staff ORDER BY id
    """)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows


@router.get("/login-log")
def login_log(current: dict = Depends(require_role("owner")), limit: int = 100):
    """Nhật ký đăng nhập gần đây (owner only) — audit ai đăng nhập/sai mật khẩu, từ IP nào, khi nào."""
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT username, ip, success, created_at FROM login_attempts ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows


@router.post("/staff")
def create_staff(body: StaffCreate, current: dict = Depends(require_role("owner"))):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Họ tên nhân viên không được để trống")

    username_raw = (body.username or "").strip()
    has_account = bool(username_raw)

    username_val = None
    password_hash = None
    must_change = 0
    role_val = body.role or "staff"

    if has_account:
        username_val = username_raw
        if not body.password or len(body.password.strip()) < 6:
            raise HTTPException(status_code=400, detail="Mật khẩu tài khoản phải có ít nhất 6 ký tự")
        password_hash = pwd_ctx.hash(body.password.strip())
        must_change = 1
        if role_val == "staff":
            role_val = "cashier"
    else:
        role_val = body.role or "staff"

    db = get_db(); cur = db.cursor()
    try:
        if username_val:
            cur.execute("SELECT id FROM staff WHERE LOWER(username) = LOWER(?)", (username_val,))
            if cur.fetchone():
                db.close()
                raise HTTPException(status_code=400, detail=f"Tên đăng nhập '{username_val}' đã tồn tại")

        device_code = (body.device_code or "").strip() or None
        if device_code:
            cur.execute("SELECT id FROM staff WHERE device_code = ?", (device_code,))
            if cur.fetchone():
                db.close()
                raise HTTPException(status_code=400, detail=f"Mã chấm công '{device_code}' đã được gán cho nhân viên khác")

        cur.execute(
            """INSERT INTO staff (
                name, username, password_hash, role, phone, commission_rate,
                is_active, must_change_password, ai_api_key, ai_model,
                device_code, employee_code, base_salary, allowance, work_block_id, hire_date,
                is_payroll_staff
            ) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)""",
            (
                name, username_val, password_hash, role_val, (body.phone or "").strip(),
                float(body.commission_rate or 0.0), must_change,
                (body.ai_api_key or "").strip() or None, body.ai_model or "gemini-2.5-flash",
                device_code, (body.employee_code or "").strip() or None,
                float(body.base_salary or 0.0), float(body.allowance or 0.0),
                body.work_block_id, (body.hire_date or "").strip() or None,
                int(body.is_payroll_staff if body.is_payroll_staff is not None else 1)
            )
        )
        db.commit()
        new_id = cur.lastrowid
        db.close()
        return {"id": new_id, "message": "Tạo nhân viên thành công", "has_account": has_account}
    except HTTPException:
        raise
    except Exception as e:
        db.close()
        raise HTTPException(400, f"Lỗi tạo nhân viên: {str(e)}")


@router.put("/staff/{staff_id}")
def update_staff(staff_id: int, body: StaffUpdate, current: dict = Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id, name, username, password_hash, role FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

    fields, vals = [], []
    if body.name is not None:            fields.append("name=?");            vals.append(body.name.strip())
    if body.phone is not None:           fields.append("phone=?");           vals.append(body.phone.strip())
    if body.commission_rate is not None: fields.append("commission_rate=?"); vals.append(float(body.commission_rate))
    if body.is_active is not None:
        fields.append("is_active=?"); vals.append(int(body.is_active))
        if body.is_active == 0:
            fields.append("token_version=token_version+1")
    if body.ai_api_key is not None:      fields.append("ai_api_key=?");      vals.append(body.ai_api_key.strip() or None)
    if body.ai_model is not None:        fields.append("ai_model=?");        vals.append(body.ai_model.strip() or "gemini-2.5-flash")
    if body.device_code is not None:
        dev_code = body.device_code.strip() or None
        if dev_code:
            cur.execute("SELECT id FROM staff WHERE device_code=? AND id != ?", (dev_code, staff_id))
            if cur.fetchone():
                db.close()
                raise HTTPException(status_code=400, detail=f"Mã chấm công '{dev_code}' đã được gán cho nhân viên khác")
        fields.append("device_code=?"); vals.append(dev_code)
    if body.employee_code is not None:
        fields.append("employee_code=?"); vals.append(body.employee_code.strip() or None)
    if body.base_salary is not None:
        fields.append("base_salary=?"); vals.append(float(body.base_salary or 0.0))
    if body.allowance is not None:
        fields.append("allowance=?"); vals.append(float(body.allowance or 0.0))
    if body.work_block_id is not None:
        fields.append("work_block_id=?"); vals.append(body.work_block_id or None)
    if body.hire_date is not None:
        fields.append("hire_date=?"); vals.append(body.hire_date.strip() or None)
    if body.leave_date is not None:
        fields.append("leave_date=?"); vals.append(body.leave_date.strip() or None)
    if body.is_payroll_staff is not None:
        fields.append("is_payroll_staff=?"); vals.append(int(body.is_payroll_staff))

    if body.revoke_account:
        fields.append("username=NULL")
        fields.append("password_hash=NULL")
        fields.append("role='staff'")
        fields.append("token_version=token_version+1")
    else:
        if body.username is not None:
            uname = body.username.strip()
            if uname:
                cur.execute("SELECT id FROM staff WHERE LOWER(username) = LOWER(?) AND id != ?", (uname, staff_id))
                if cur.fetchone():
                    db.close()
                    raise HTTPException(status_code=400, detail=f"Tên đăng nhập '{uname}' đã tồn tại")
                fields.append("username=?"); vals.append(uname)
                if body.password and len(body.password.strip()) >= 6:
                    fields.append("password_hash=?"); vals.append(pwd_ctx.hash(body.password.strip()))
                    fields.append("must_change_password=1")
                    fields.append("token_version=token_version+1")
                elif not staff["password_hash"] and (not body.password or len(body.password.strip()) < 6):
                    db.close()
                    raise HTTPException(status_code=400, detail="Khi cấp tài khoản đăng nhập mới, mật khẩu phải có ít nhất 6 ký tự")
                if body.role is not None:
                    fields.append("role=?"); vals.append(body.role)
                elif staff["role"] == "staff":
                    fields.append("role=?"); vals.append("cashier")
        elif body.password is not None and len(body.password.strip()) >= 6:
            fields.append("password_hash=?"); vals.append(pwd_ctx.hash(body.password.strip()))
            fields.append("must_change_password=1")
            fields.append("token_version=token_version+1")

        if body.role is not None and body.username is None and not body.revoke_account:
            fields.append("role=?"); vals.append(body.role)

    if not fields:
        db.close()
        raise HTTPException(400, "Không có trường nào để cập nhật")

    vals.append(staff_id)
    cur.execute(f"UPDATE staff SET {', '.join(fields)} WHERE id=?", vals)
    db.commit()
    db.close()
    return {"message": "Cập nhật nhân viên thành công"}


class StaffAssignAIKeyIn(BaseModel):
    ai_api_key: Optional[str] = ""
    ai_model: Optional[str] = "gemini-2.5-flash"


@router.get("/staff/{staff_id}/ai-config")
def get_staff_ai_config(staff_id: int, current: dict = Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id, name, ai_api_key, ai_model FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    db.close()
    if not staff:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    key = (staff["ai_api_key"] or "").strip()
    masked = key[:4] + "*" * max(0, len(key) - 8) + key[-4:] if len(key) > 8 else ("***" if key else "")
    return {
        "staff_id": staff_id,
        "staff_name": staff["name"],
        "has_ai_key": bool(key),
        "masked_key": masked,
        "ai_model": staff["ai_model"] or "gemini-2.5-flash"
    }


@router.post("/staff/{staff_id}/ai-config")
def assign_staff_ai_config(staff_id: int, body: StaffAssignAIKeyIn, current: dict = Depends(require_role("owner"))):
    key = (body.ai_api_key or "").strip()
    model = (body.ai_model or "gemini-2.5-flash").strip()
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id, name FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        db.close()
        raise HTTPException(404, "Không tìm thấy nhân viên")
    cur.execute("UPDATE staff SET ai_api_key=?, ai_model=? WHERE id=?", (key or None, model, staff_id))
    db.commit(); db.close()
    return {
        "message": f"Đã gán cấu hình AI cho nhân viên {staff['name']}",
        "has_ai_key": bool(key),
        "ai_model": model
    }


@router.post("/staff/{staff_id}/reset-password")
def reset_staff_password(staff_id: int, body: ChangePasswordIn, current: dict = Depends(require_role("owner"))):
    """Owner reset mật khẩu bất kỳ nhân viên nào (không cần old_password)."""
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự")
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id, username, password_hash FROM staff WHERE id=?", (staff_id,))
    staff = cur.fetchone()
    if not staff:
        db.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")
    if not staff["username"]:
        db.close()
        raise HTTPException(status_code=400, detail="Nhân viên này chưa có tài khoản đăng nhập. Hãy bấm 'Cấp tài khoản' trước.")
    cur.execute("UPDATE staff SET password_hash=?, must_change_password=1, token_version=token_version+1 WHERE id=?", (pwd_ctx.hash(body.new_password), staff_id))
    db.commit(); db.close()
    return {"message": "Reset mật khẩu thành công"}
