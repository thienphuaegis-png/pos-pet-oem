import os
import jwt
import datetime
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from pydantic import BaseModel
from database import get_db
from dependencies import get_current_user, require_role, get_user_effective_permissions, SECRET, ALGO

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _make_token(staff_id: int, token_version: int = 0, hours: int = 8) -> str:
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)
    return jwt.encode({"sub": str(staff_id), "tv": token_version, "exp": exp}, SECRET, algorithm=ALGO)


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
        "SELECT id, password_hash, role, name, is_active, must_change_password, token_version FROM staff WHERE username=?",
        (form.username,)
    )
    user = cur.fetchone()
    ok = bool(user and user["password_hash"] and pwd_ctx.verify(form.password, user["password_hash"]) and user["is_active"])

    cur.execute("INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)",
                (form.username, client_ip, 1 if ok else 0))
    db.commit()

    if not user or not user["password_hash"] or not pwd_ctx.verify(form.password, user["password_hash"]):
        db.close()
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
    if not user["is_active"]:
        db.close()
        raise HTTPException(status_code=401, detail="Tài khoản đã bị khóa")
    db.close()

    tv = user["token_version"] or 0
    access = _make_token(user["id"], tv, hours=8)
    refresh = _make_token(user["id"], tv, hours=24 * 7)
    perms = get_user_effective_permissions(user["id"], user["role"])
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "role": user["role"], "permissions": perms},
        "must_change_password": bool(user["must_change_password"]) if "must_change_password" in user.keys() else False
    }


@router.post("/refresh")
def refresh(current: dict = Depends(get_current_user)):
    # ponytail: reuse get_current_user để validate, không pool refresh token riêng
    # Upgrade: thêm bảng refresh_tokens + revoke khi cần multi-device logout
    return {"access_token": _make_token(current["id"], current.get("token_version", 0), hours=8), "token_type": "bearer"}


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


# ── Staff Management (owner only) ──

class StaffCreate(BaseModel):
    name: str
    username: str
    password: str
    role: str  # cashier, accountant, warehouse, owner
    phone: str = ""
    commission_rate: float = 0


class StaffUpdate(BaseModel):
    name: str = None
    role: str = None
    phone: str = None
    commission_rate: float = None
    is_active: int = None


@router.get("/staff")
def list_staff(current: dict = Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id, name, username, role, phone, commission_rate, is_active, created_at FROM staff ORDER BY id")
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
    db = get_db(); cur = db.cursor()
    try:
        cur.execute(
            "INSERT INTO staff (name, username, password_hash, role, phone, commission_rate, is_active, must_change_password) VALUES (?,?,?,?,?,?,1,1)",
            (body.name, body.username, pwd_ctx.hash(body.password), body.role, body.phone, body.commission_rate)
        )
        db.commit()
        new_id = cur.lastrowid
        db.close()
        return {"id": new_id, "message": "Tạo nhân viên thành công"}
    except Exception as e:
        db.close()
        raise HTTPException(400, f"Lỗi tạo nhân viên: {str(e)}")


@router.put("/staff/{staff_id}")
def update_staff(staff_id: int, body: StaffUpdate, current: dict = Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    fields, vals = [], []
    if body.name is not None:            fields.append("name=?");            vals.append(body.name)
    if body.role is not None:            fields.append("role=?");            vals.append(body.role)
    if body.phone is not None:           fields.append("phone=?");           vals.append(body.phone)
    if body.commission_rate is not None: fields.append("commission_rate=?"); vals.append(body.commission_rate)
    if body.is_active is not None:       fields.append("is_active=?");       vals.append(body.is_active)
    if body.is_active == 0:              fields.append("token_version=token_version+1")
    if not fields:
        db.close(); raise HTTPException(400, "Không có trường nào để cập nhật")
    vals.append(staff_id)
    cur.execute(f"UPDATE staff SET {', '.join(fields)} WHERE id=?", vals)
    db.commit(); db.close()
    return {"message": "Cập nhật nhân viên thành công"}


@router.post("/staff/{staff_id}/reset-password")
def reset_staff_password(staff_id: int, body: ChangePasswordIn, current: dict = Depends(require_role("owner"))):
    """Owner reset mật khẩu bất kỳ nhân viên nào (không cần old_password)."""
    db = get_db(); cur = db.cursor()
    cur.execute("UPDATE staff SET password_hash=?, must_change_password=1, token_version=token_version+1 WHERE id=?", (pwd_ctx.hash(body.new_password), staff_id))
    db.commit(); db.close()
    return {"message": "Reset mật khẩu thành công"}
