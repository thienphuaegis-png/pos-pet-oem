import os
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from database import get_db

# Bảo đảm .env được nạp dù module này bị import trực tiếp (vd: pytest) không qua server.py
if not os.environ.get("POS_JWT_SECRET"):
    import secrets
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(_env_path):
        with open(_env_path, "w") as f:
            f.write(f"POS_JWT_SECRET={secrets.token_hex(32)}\n")
    from dotenv import load_dotenv
    load_dotenv(_env_path)

SECRET = os.environ.get("POS_JWT_SECRET")
if not SECRET:
    raise RuntimeError("POS_JWT_SECRET chưa được set — chạy qua main.py để tự sinh .env")
ALGO = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(request: Request = None, token: str = Depends(oauth2_scheme)):
    if request is not None and hasattr(request.state, "_authenticated_user") and request.state._authenticated_user:
        return dict(request.state._authenticated_user)

    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token hết hạn, vui lòng đăng nhập lại")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

    if payload.get("typ") and payload.get("typ") != "access":
        raise HTTPException(status_code=401, detail="Token không hợp lệ (yêu cầu access token)")

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
    user_dict = dict(user)
    if request is not None:
        request.state._authenticated_user = user_dict
    return user_dict


def get_optional_user(request: Request = None, token: str = Depends(oauth2_scheme_optional)):
    if request is not None and hasattr(request.state, "_authenticated_user") and request.state._authenticated_user:
        return dict(request.state._authenticated_user)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        if payload.get("typ") and payload.get("typ") != "access":
            return None
        staff_id = payload.get("sub")
        db = get_db()
        cur = db.cursor()
        cur.execute("SELECT id, name, role, is_active, must_change_password, token_version FROM staff WHERE id=?", (staff_id,))
        user = cur.fetchone()
        db.close()
        if user and user["is_active"] and (user["token_version"] or 0) == payload.get("tv", 0):
            user_dict = dict(user)
            if request is not None:
                request.state._authenticated_user = user_dict
            return user_dict
    except Exception:
        pass
    return None


def check_permission(staff_id: int, role: str, perm_key: str) -> bool:
    """Kiểm tra 1 quyền cụ thể cho user (staff_id, role). Owner/admin luôn có full quyền."""
    if role in ("owner", "admin"):
        return True
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT allowed FROM staff_permissions WHERE staff_id=? AND perm_key=?", (staff_id, perm_key))
    row = cur.fetchone()
    if row is None:
        cur.execute("SELECT allowed FROM role_permissions WHERE role=? AND perm_key=?", (role, perm_key))
        row = cur.fetchone()
    db.close()
    return bool(row and row["allowed"])


def get_user_effective_permissions(staff_id: int, role: str) -> list:
    """Trả về danh sách tất cả perm_keys được phép của user."""
    from routers.settings import PERM_KEYS
    if role in ("owner", "admin"):
        return list(PERM_KEYS)
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT perm_key, allowed FROM role_permissions WHERE role=?", (role,))
    role_map = {r["perm_key"]: bool(r["allowed"]) for r in cur.fetchall()}
    cur.execute("SELECT perm_key, allowed FROM staff_permissions WHERE staff_id=?", (staff_id,))
    staff_map = {r["perm_key"]: bool(r["allowed"]) for r in cur.fetchall()}
    db.close()

    result = []
    for pk in PERM_KEYS:
        if pk in staff_map:
            if staff_map[pk]:
                result.append(pk)
        elif role_map.get(pk, False):
            result.append(pk)
    return result


def require_role(*roles):
    """Trả về FastAPI dependency kiểm tra role. owner luôn pass."""
    def checker(user=Depends(get_current_user)):
        if user["role"] not in ("owner", "admin") and user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập")
        return user
    return checker


def require_permission(perm_key: str):
    """Kiểm tra quyền theo tick-box. Uu tien quyen rieng cua tung nhan vien (staff_permissions),
    khong co thi fallback ve quyen mac dinh theo role (role_permissions). owner luon pass."""
    def checker(user=Depends(get_current_user)):
        if user.get("role") in ("owner", "admin"):
            return user
        if not check_permission(user["id"], user.get("role", ""), perm_key):
            raise HTTPException(status_code=403, detail="Không có quyền truy cập")
        return user
    return checker


def require_any_permission(*perm_keys: str):
    """Kiểm tra user có ít nhất 1 trong các quyền perm_keys. Owner/admin luôn pass."""
    def checker(user=Depends(get_current_user)):
        if user.get("role") in ("owner", "admin"):
            return user
        for pk in perm_keys:
            if check_permission(user["id"], user.get("role", ""), pk):
                return user
        raise HTTPException(status_code=403, detail="Không có quyền truy cập")
    return checker


def can_view_cost(user) -> bool:
    """User có được xem giá vốn / giá trị tồn / lợi nhuận không. user=None (chưa login) -> False."""
    if not user:
        return False
    if user.get("role") in ("owner", "admin"):
        return True
    return check_permission(user["id"], user.get("role", ""), "inventory.view_cost")


# ── Tài khoản nhận tiền dùng chung cho mọi luồng thanh toán ──
# cash -> két (account_type 'cash'); transfer -> 'bank'/'ewallet'; card -> 'pos_card' (Máy POS thẻ)
METHOD_ACCOUNT_TYPES = {
    "cash": ("cash",),
    "transfer": ("bank", "ewallet"),
    "bank": ("bank", "ewallet"),
    "card": ("pos_card",),
    "wallet": ("bank", "ewallet"),
}


def resolve_payment_account(cur, payment_method, account_id=None):
    """Trả về account_id hợp lệ cho `payment_method`.

    - Client gửi account_id: kiểm tra tồn tại + đang hoạt động + đúng loại với hình thức
      (chuyển khoản không được vào két tiền mặt, thẻ phải vào Máy POS thẻ...). Sai -> 400.
    - Không gửi: tiền mặt -> két mặc định. Chuyển khoản/thẻ -> HTTP 400 (bắt buộc chọn tài khoản),
      để không ghi nhầm tiền vào tài khoản mặc định.
    """
    from fastapi import HTTPException
    m = (payment_method or "cash").lower()
    types = METHOD_ACCOUNT_TYPES.get(m, ("cash",))
    if account_id:
        cur.execute("SELECT id, account_type, name FROM payment_accounts WHERE id = ? AND is_active = 1", (account_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Tài khoản nhận tiền không tồn tại hoặc đã ngừng hoạt động")
        if m != "any" and row["account_type"] not in types:
            label = {"cash": "tiền mặt", "transfer": "chuyển khoản", "bank": "chuyển khoản", "card": "quẹt thẻ", "wallet": "ví điện tử"}.get(m, m)
            raise HTTPException(status_code=400, detail=f"Tài khoản \"{row['name']}\" không dùng được cho hình thức {label}")
        return row["id"]
    if m in ("transfer", "bank", "card", "wallet"):
        label = {"card": "quẹt thẻ", "wallet": "ví điện tử"}.get(m, "chuyển khoản")
        raise HTTPException(status_code=400, detail=f"Vui lòng chọn tài khoản nhận tiền cho hình thức {label}")
    cur.execute("SELECT id FROM payment_accounts WHERE account_type = 'cash' AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1")
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute("SELECT id FROM payment_accounts WHERE is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1")
    row = cur.fetchone()
    return row["id"] if row else None
