# Auth + RBAC + Shift Implementation Plan

**Goal:** Thêm đăng nhập JWT, phân quyền 4 role, quản lý ca làm việc vào POS FastAPI + SQLite.

**Architecture:** JWT stateless (access 8h, refresh 7d), enforce ở FastAPI dependency layer, frontend ẩn tab theo role từ JWT payload. Ca làm việc gắn `shift_id` vào `orders` và `cashbook`.

**Tech Stack:** `passlib[bcrypt]`, `pyjwt`, FastAPI `OAuth2PasswordBearer`, SQLite, vanilla JS.

## Global Constraints

- Không thêm dependency nào ngoài `passlib[bcrypt]` và `pyjwt`
- Bảng `staff` hiện có — ALTER để thêm cột `username`, `password_hash`, `is_active`; KHÔNG xóa lại
- `PRAGMA foreign_keys = ON` đã bật — mọi FK phải hợp lệ
- Seed admin: username=`admin`, password=`admin123` (owner, buộc đổi pass lần đầu)
- Access token 8h = 1 ca đủ dùng, tự hết hạn cuối ca
- Backend enforce quyền — frontend chỉ ẩn UI, không thay thế

---

## File Map

| File | Action | Trách nhiệm |
|---|---|---|
| `database.py` | Modify | ALTER staff + tạo bảng `shifts` + thêm cột `shift_id` vào `orders`/`cashbook` + seed admin |
| `dependencies.py` | **Create** | `get_current_user()`, `require_role(*roles)` |
| `routers/auth.py` | **Create** | `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| `routers/shifts.py` | **Create** | Open/close/approve shift, list shifts |
| `server.py` | Modify | include auth + shifts router, CORS nếu cần |
| `routers/pos.py` | Modify | Gắn `shift_id` khi tạo đơn, require role cashier/owner |
| `routers/cashbook.py` | Modify | Gắn `shift_id`, require role accountant/owner |
| `routers/purchases.py` | Modify | require role warehouse/owner |
| `routers/partners.py` | Modify | require role accountant/owner |
| `routers/products.py` | Modify | GET public, POST/PUT/DELETE require owner/warehouse |
| `routers/settings.py` | Modify | require owner |
| `templates/index.html` | Modify | Thêm màn login, header ca/user, ẩn tab theo role |
| `static/js/auth.js` | **Create** | JWT localStorage, auto-refresh, gắn header, redirect 401 |
| `static/js/shifts.js` | **Create** | Mở ca, kết ca, màn hình đối soát |
| `tests/test_auth.py` | **Create** | Login, token, role guard, shift flow |

---

## Task 1: Cài Dependencies

**Files:** `requirements.txt` (hoặc install trực tiếp)

- [ ] Chạy: `pip install "passlib[bcrypt]" pyjwt`
- [ ] Verify: `python -c "from passlib.context import CryptContext; import jwt; print('OK')"`

---

## Task 2: Migrate DB — Staff + Shifts + shift_id columns

**Files:** `database.py`

**Việc cần làm:**

- [ ] Thêm migration block vào `init_db()` — dùng `ALTER TABLE IF NOT EXISTS column` pattern (SQLite không có IF NOT EXISTS cho ALTER → bắt exception `OperationalError`):

```python
# Migrate staff table
for col_sql in [
    "ALTER TABLE staff ADD COLUMN username TEXT",
    "ALTER TABLE staff ADD COLUMN password_hash TEXT",
    "ALTER TABLE staff ADD COLUMN is_active INTEGER DEFAULT 1",
]:
    try:
        cur.execute(col_sql)
    except Exception:
        pass  # column already exists

# Tạo UNIQUE index username
cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username ON staff(username)")

# Bảng shifts
cur.execute('''
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_id INTEGER NOT NULL REFERENCES staff(id),
    open_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    close_at DATETIME,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','approved')),
    opening_cash REAL DEFAULT 0,
    closing_cash REAL,
    expected_cash REAL,
    difference REAL,
    note TEXT,
    approved_by INTEGER REFERENCES staff(id),
    approved_at DATETIME
)''')

# Thêm shift_id vào orders và cashbook
for col_sql in [
    "ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)",
    "ALTER TABLE cashbook ADD COLUMN shift_id INTEGER REFERENCES shifts(id)",
]:
    try:
        cur.execute(col_sql)
    except Exception:
        pass
```

- [ ] Seed admin — thêm vào block seed hiện có:

```python
from passlib.context import CryptContext
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

cur.execute("SELECT COUNT(*) FROM staff WHERE username='admin'")
if cur.fetchone()[0] == 0:
    # Upsert staff id=1 hoặc insert mới
    cur.execute("SELECT id FROM staff WHERE role='admin' OR role='owner' LIMIT 1")
    row = cur.fetchone()
    if row:
        cur.execute(
            "UPDATE staff SET username=?, password_hash=?, is_active=1 WHERE id=?",
            ("admin", _pwd.hash("admin123"), row[0])
        )
    else:
        cur.execute(
            "INSERT INTO staff (name, username, password_hash, role, is_active) VALUES (?,?,?,?,1)",
            ("Quản Lý", "admin", _pwd.hash("admin123"), "owner")
        )
```

- [ ] `conn.commit()` sau migrate
- [ ] Verify: `python -c "from database import init_db; init_db(); print('OK')"`

---

## Task 3: dependencies.py — Auth Guards

**Files:** `dependencies.py` (tạo mới root)

```python
import os, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from database import get_db

SECRET = os.environ.get("POS_JWT_SECRET", "pos-secret-change-me")
ALGO = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token hết hạn")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
    
    staff_id = payload.get("sub")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, name, role, is_active FROM staff WHERE id=?", (staff_id,))
    user = cur.fetchone()
    db.close()
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc bị khóa")
    return dict(user)

def require_role(*roles):
    def checker(user=Depends(get_current_user)):
        if user["role"] not in roles and "owner" not in roles:
            # owner luôn pass mọi role check
            if user["role"] != "owner":
                raise HTTPException(status_code=403, detail="Không có quyền truy cập")
        return user
    return checker
```

- [ ] Viết file trên
- [ ] Verify syntax: `python -c "import dependencies; print('OK')"`

---

## Task 4: routers/auth.py

**Files:** `routers/auth.py` (tạo mới)

```python
import os, jwt, datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from database import get_db
from dependencies import get_current_user, SECRET, ALGO

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _make_token(staff_id: int, hours: int = 8) -> str:
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)
    return jwt.encode({"sub": str(staff_id), "exp": exp}, SECRET, algorithm=ALGO)

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT id, password_hash, role, name, is_active FROM staff WHERE username=?",
        (form.username,)
    )
    user = cur.fetchone()
    db.close()
    if not user or not pwd.verify(form.password, user["password_hash"]) or not user["is_active"]:
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
    
    access = _make_token(user["id"], hours=8)
    refresh = _make_token(user["id"], hours=24*7)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "role": user["role"]}
    }

@router.post("/refresh")
def refresh(current: dict = Depends(get_current_user)):
    # ponytail: dùng lại get_current_user để validate, không verify refresh riêng
    # Upgrade: tách refresh token pool khi cần revoke
    return {"access_token": _make_token(current["id"], hours=8), "token_type": "bearer"}

@router.get("/me")
def me(current: dict = Depends(get_current_user)):
    return current
```

- [ ] Viết file trên
- [ ] Thêm vào `server.py`: `from routers.auth import router as auth_router` + `app.include_router(auth_router)`
- [ ] Test: `curl -X POST http://localhost:8999/api/auth/login -d "username=admin&password=admin123" -H "Content-Type: application/x-www-form-urlencoded"`

---

## Task 5: routers/shifts.py

**Files:** `routers/shifts.py` (tạo mới)

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from database import get_db
from dependencies import get_current_user, require_role

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
    # Kiểm tra cashier đang có ca mở chưa
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
        "SELECT s.*, st.name as cashier_name FROM shifts s JOIN staff st ON st.id=s.cashier_id WHERE s.cashier_id=? AND s.status='open'",
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

    # Tính tiền lý thuyết: opening_cash + thu tiền mặt POS trong ca
    cur.execute("""
        SELECT COALESCE(SUM(CASE WHEN cb.type='in' THEN cb.amount ELSE -cb.amount END),0)
        FROM cashbook cb WHERE cb.shift_id=?
    """, (shift_id,))
    net_cash = cur.fetchone()[0]
    expected = shift["opening_cash"] + net_cash
    diff = body.closing_cash - expected

    cur.execute("""
        UPDATE shifts SET status='closed', close_at=CURRENT_TIMESTAMP,
        closing_cash=?, expected_cash=?, difference=?, note=? WHERE id=?
    """, (body.closing_cash, expected, diff, body.note, shift_id))
    db.commit()
    db.close()
    return {"expected_cash": expected, "closing_cash": body.closing_cash, "difference": diff}

@router.post("/{shift_id}/approve")
def approve_shift(shift_id: int, user=Depends(require_role("accountant", "owner"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM shifts WHERE id=?", (shift_id,))
    row = cur.fetchone()
    if not row: db.close(); raise HTTPException(404, "Không tìm thấy ca")
    if row["status"] != "closed": db.close(); raise HTTPException(400, "Ca chưa được kết")
    cur.execute(
        "UPDATE shifts SET status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=?",
        (user["id"], shift_id)
    )
    db.commit(); db.close()
    return {"message": "Duyệt ca thành công"}

@router.get("/")
def list_shifts(user=Depends(require_role("accountant", "owner"))):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT s.*, st.name as cashier_name,
               (SELECT name FROM staff WHERE id=s.approved_by) as approver_name
        FROM shifts s JOIN staff st ON st.id=s.cashier_id
        ORDER BY s.open_at DESC LIMIT 100
    """)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows
```

- [ ] Viết file trên
- [ ] Thêm vào `server.py`: `from routers.shifts import router as shifts_router` + `app.include_router(shifts_router)`

---

## Task 6: Gắn require_role vào các Router Hiện Có

**Files:** `routers/pos.py`, `routers/cashbook.py`, `routers/purchases.py`, `routers/partners.py`, `routers/products.py`, `routers/settings.py`

**Pattern chung — thêm vào endpoint:**
```python
from dependencies import require_role, get_current_user

# POS endpoints → require cashier/owner + gắn shift_id
# Cashbook → require accountant/owner
# Purchases → require warehouse/owner
# Partners write → require accountant/owner
# Products write → require warehouse/owner
# Settings → require owner
```

**`routers/pos.py` — gắn shift_id khi tạo đơn:**
```python
# Trong endpoint POST /api/pos/checkout (hoặc tương đương):
# Thêm param: user=Depends(require_role("cashier","owner"))
# Lấy shift đang mở:
cur.execute("SELECT id FROM shifts WHERE cashier_id=? AND status='open'", (user["id"],))
shift_row = cur.fetchone()
shift_id = shift_row["id"] if shift_row else None
# Truyền shift_id vào INSERT orders
```

- [ ] Xác định tên endpoint checkout trong `routers/pos.py`
- [ ] Thêm `user=Depends(require_role("cashier","owner"))` + logic lấy shift_id
- [ ] Cashbook POST → thêm `user=Depends(require_role("accountant","owner"))`, gắn `shift_id` từ body hoặc current shift
- [ ] Purchases POST → `require_role("warehouse","owner")`
- [ ] Partners write → `require_role("accountant","owner")`
- [ ] Products POST/PUT/DELETE → `require_role("warehouse","owner")`
- [ ] Settings → `require_role("owner")`

---

## Task 7: Staff Management API

**Files:** `routers/settings.py` hoặc tạo `routers/staff.py`

```python
# GET  /api/staff          → list (owner only)
# POST /api/staff          → tạo nhân viên mới (owner only)
# PUT  /api/staff/{id}     → sửa info / đổi role (owner only)
# PUT  /api/staff/{id}/password → đổi mật khẩu (owner hoặc chính mình)
# DELETE /api/staff/{id}   → is_active=0, không xóa vật lý (owner only)
```

```python
class StaffCreate(BaseModel):
    name: str
    username: str
    password: str
    role: str  # cashier, accountant, warehouse, owner
    commission_rate: float = 0

@router.post("/api/staff")
def create_staff(body: StaffCreate, user=Depends(require_role("owner"))):
    db = get_db(); cur = db.cursor()
    cur.execute(
        "INSERT INTO staff (name,username,password_hash,role,commission_rate,is_active) VALUES (?,?,?,?,?,1)",
        (body.name, body.username, pwd.hash(body.password), body.role, body.commission_rate)
    )
    db.commit(); db.close()
    return {"message": "Tạo nhân viên thành công"}
```

- [ ] Implement 5 endpoints trên
- [ ] Đổi mật khẩu: verify old_password trước khi hash new_password

---

## Task 8: Frontend — auth.js

**Files:** `static/js/auth.js` (tạo mới)

```js
// Token storage
const Auth = {
  getToken: () => localStorage.getItem('pos_token'),
  getUser:  () => JSON.parse(localStorage.getItem('pos_user') || 'null'),
  setSession: (data) => {
    localStorage.setItem('pos_token', data.access_token);
    localStorage.setItem('pos_refresh', data.refresh_token || '');
    localStorage.setItem('pos_user', JSON.stringify(data.user));
  },
  clear: () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_refresh');
    localStorage.removeItem('pos_user');
  },
  hasRole: (...roles) => {
    const u = Auth.getUser();
    return u && (u.role === 'owner' || roles.includes(u.role));
  }
};

// Gắn Authorization header vào mọi fetch
const _fetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const token = Auth.getToken();
  if (token && typeof url === 'string' && url.startsWith('/api')) {
    opts.headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
  }
  const res = await _fetch(url, opts);
  if (res.status === 401) {
    Auth.clear();
    showLoginScreen();
  }
  return res;
};

async function doLogin(username, password) {
  const res = await _fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Sai thông tin đăng nhập');
  const data = await res.json();
  Auth.setSession(data);
  return data;
}

function showLoginScreen() { /* toggle login overlay */ }
function hideLoginScreen() { /* toggle login overlay */ }
function applyRoleUI() {
  const user = Auth.getUser();
  if (!user) return;
  // Ẩn tab theo role
  document.querySelectorAll('[data-role]').forEach(el => {
    const allowed = el.dataset.role.split(',');
    el.style.display = (user.role === 'owner' || allowed.includes(user.role)) ? '' : 'none';
  });
  document.getElementById('header-username').textContent = user.name;
  document.getElementById('header-role-badge').textContent = {
    owner: '👑 Chủ Shop', cashier: '🏷 Thu Ngân',
    accountant: '📒 Kế Toán', warehouse: '📦 Thủ Kho'
  }[user.role] || user.role;
}
```

- [ ] Viết file trên
- [ ] Load trong `index.html` trước `app.js`

---

## Task 9: Frontend — Màn Hình Login + Header Ca

**Files:** `templates/index.html`

- [ ] Thêm login overlay (z-index cao, ẩn khi đã auth):
```html
<div id="login-overlay" style="position:fixed;inset:0;z-index:9999;background:#fff;display:flex;align-items:center;justify-content:center">
  <div style="width:320px">
    <h2>🐾 POS Đăng Nhập</h2>
    <input id="login-username" placeholder="Tên đăng nhập" class="form-control mb-2">
    <input id="login-password" type="password" placeholder="Mật khẩu" class="form-control mb-2">
    <button onclick="handleLogin()" class="btn btn-primary w-100">Đăng Nhập</button>
    <p id="login-error" class="text-danger mt-2"></p>
  </div>
</div>
```

- [ ] Thêm header bar (trên main content):
```html
<div id="pos-header" style="display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid #eee">
  <span id="header-username"></span>
  <span id="header-role-badge"></span>
  <span id="header-shift-status"></span>
  <button id="btn-open-shift" onclick="openShiftModal()" class="btn btn-sm btn-success">Mở Ca</button>
  <button id="btn-close-shift" onclick="closeShiftModal()" class="btn btn-sm btn-warning" style="display:none">Kết Ca</button>
  <button onclick="handleLogout()" class="btn btn-sm btn-outline-secondary ms-auto">Đăng Xuất</button>
</div>
```

- [ ] Thêm `data-role` attribute vào các tab nav:
```html
<!-- Ví dụ: -->
<li data-role="cashier,owner">Bán Hàng</li>
<li data-role="accountant,owner">Sổ Quỹ</li>
<li data-role="warehouse,owner">Nhập Hàng</li>
<li data-role="owner">Cài Đặt</li>
```

- [ ] Khi load app: nếu không có token → show login overlay; có token → `applyRoleUI()` + load current shift

---

## Task 10: Frontend — shifts.js

**Files:** `static/js/shifts.js` (tạo mới)

```js
let currentShift = null;

async function loadCurrentShift() {
  const res = await fetch('/api/shifts/current');
  if (res.ok) {
    currentShift = await res.json();
    updateShiftUI();
  }
}

function updateShiftUI() {
  const hasShift = !!currentShift;
  document.getElementById('btn-open-shift').style.display = hasShift ? 'none' : '';
  document.getElementById('btn-close-shift').style.display = hasShift ? '' : 'none';
  document.getElementById('header-shift-status').textContent = hasShift
    ? `Ca: ${new Date(currentShift.open_at).toLocaleTimeString('vi-VN')} | Đầu: ${currentShift.opening_cash?.toLocaleString('vi-VN')}đ`
    : 'Chưa mở ca';
}

async function openShiftModal() {
  const cash = prompt('Tiền mặt đầu ca (đếm thực tế):');
  if (cash === null) return;
  const res = await fetch('/api/shifts/open', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ opening_cash: parseFloat(cash) || 0 })
  });
  const data = await res.json();
  if (res.ok) { await loadCurrentShift(); showToast('Mở ca thành công'); }
  else showToast(data.detail, 'error');
}

async function closeShiftModal() {
  if (!currentShift) return;
  const cash = prompt('Tiền mặt cuối ca (đếm thực tế):');
  if (cash === null) return;
  const note = prompt('Ghi chú (tuỳ chọn):') || '';
  const res = await fetch(`/api/shifts/${currentShift.id}/close`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ closing_cash: parseFloat(cash) || 0, note })
  });
  const data = await res.json();
  if (res.ok) {
    const diff = data.difference;
    alert(`Kết ca hoàn tất!\nLý thuyết: ${data.expected_cash?.toLocaleString('vi-VN')}đ\nThực tế: ${data.closing_cash?.toLocaleString('vi-VN')}đ\nChênh lệch: ${diff >= 0 ? '+' : ''}${diff?.toLocaleString('vi-VN')}đ`);
    currentShift = null;
    updateShiftUI();
  } else showToast(data.detail, 'error');
}
```

- [ ] Viết file trên, load trong `index.html` sau `auth.js`

---

## Task 11: Tests

**Files:** `tests/test_auth.py`

```python
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from passlib.context import CryptContext
import jwt, datetime

init_db()
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def test_admin_exists():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT username, role FROM staff WHERE username='admin'")
    row = cur.fetchone()
    db.close()
    assert row, "Admin chưa được seed"
    assert row["role"] == "owner"

def test_password_hash():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT password_hash FROM staff WHERE username='admin'")
    row = cur.fetchone(); db.close()
    assert _pwd.verify("admin123", row["password_hash"]), "Hash mật khẩu admin sai"

def test_shifts_table():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='shifts'")
    assert cur.fetchone(), "Bảng shifts chưa tồn tại"
    db.close()

def test_orders_has_shift_id():
    db = get_db(); cur = db.cursor()
    cur.execute("PRAGMA table_info(orders)")
    cols = [r["name"] for r in cur.fetchall()]; db.close()
    assert "shift_id" in cols, "orders thiếu cột shift_id"

if __name__ == "__main__":
    test_admin_exists(); print("✓ admin exists")
    test_password_hash(); print("✓ password hash OK")
    test_shifts_table(); print("✓ shifts table OK")
    test_orders_has_shift_id(); print("✓ orders.shift_id OK")
    print("ALL PASS")
```

- [ ] Viết file trên
- [ ] Chạy: `python tests/test_auth.py`

---

## Thứ Tự Thực Thi

1. Task 1 (deps) → Task 2 (DB migrate) → Task 11 (test DB)
2. Task 3 (dependencies.py) → Task 4 (auth router) → test login curl
3. Task 5 (shifts router) → Task 6 (gắn role vào routers cũ)
4. Task 7 (staff API)
5. Task 8–10 (frontend)
6. E2E smoke test: login → mở ca → bán hàng → kết ca → duyệt ca

## Rollback

Nếu auth break toàn bộ app: comment `require_role` deps tạm thời, app vẫn chạy bình thường — không mất data.
