# Server-side Injection Logo và Tên Ứng Dụng Màn Hình Đăng Nhập Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Hiển thị tức thì 0ms Logo (`shop_logo`) và Tên ứng dụng (`app_name`) do người dùng cài đặt ngay trên màn hình đăng nhập lúc mở trang, không chớp nháy FOUC.

**Architecture:** Route `GET /` trong `server.py` đọc cấu hình `app_name` và `shop_logo` từ SQLite, inject trực tiếp vào HTML template trước khi trả về trình duyệt. Cập nhật `auth.js` và `productions.js` để đồng bộ khi sửa cài đặt hoặc logout mà không cần F5 trang.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, HTML5/CSS3, Pytest.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `server.py` | Modify: Hàm `index()` đọc settings, inject `app_name` và `shop_logo` vào HTML response |
| `routers/settings.py` | Modify: Hàm `update_company_settings()` invalidate cache trong `server.py` |
| `static/js/auth.js` | Modify: Hàm `loadLoginStoreBranding()` ưu tiên `settings.app_name` |
| `static/js/modules/productions.js` | Modify: Hàm `saveCompanySettings()` cập nhật ngay DOM `#login-store-name` và `#login-store-logo` |
| `tests/test_login_branding_injection.py` | Create: Test kiểm tra endpoint `GET /` inject đúng Tên app và Logo |

---

### Task 1: Backend Server-side Injection & Test

**Files:**
- Create: `tests/test_login_branding_injection.py`
- Modify: `server.py`
- Modify: `routers/settings.py`

- [ ] **Step 1: Write the failing test in `tests/test_login_branding_injection.py`**
```python
from fastapi.testclient import TestClient
import sqlite3
from server import app

client = TestClient(app)

def test_login_page_injects_app_name_and_logo():
    # Setup test branding
    conn = sqlite3.connect("data/pos.db")
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_name', 'PetCare VIP')")
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('shop_logo', 'data:image/png;base64,TESTLOGO')")
    conn.commit()
    conn.close()

    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    # Kiểm tra tên ứng dụng đã được inject vào tag login-store-name
    assert '<div id="login-store-name"' in html
    assert 'PetCare VIP</div>' in html
    # Kiểm tra logo đã được inject vào tag login-store-logo
    assert 'id="login-store-logo" src="data:image/png;base64,TESTLOGO"' in html
    assert 'id="login-store-icon" style="display:none;' in html
```

- [ ] **Step 2: Run test to verify it fails**
Chạy `pytest tests/test_login_branding_injection.py` và xác nhận test FAIL.

- [ ] **Step 3: Update `server.py` & `routers/settings.py`**
Trong `server.py`:
Viết hàm `get_branding_settings()` có cache memory.
Trong `index()`:
Thay thế nội dung `#login-store-name` thành `{app_name}`.
Nếu có `shop_logo`: thay thế `#login-store-icon` thành `style="display:none;"`, `#login-store-logo` thành `src="{shop_logo}" style="display:block;max-height:64px;max-width:200px;object-fit:contain"`.
Trong `routers/settings.py`:
Import hàm reset cache từ `server.py` và gọi khi update company settings.

- [ ] **Step 4: Run test to verify it passes**
Chạy `pytest tests/test_login_branding_injection.py` và xác nhận PASS.

---

### Task 2: Frontend Sync & Dynamic Update

**Files:**
- Modify: `static/js/auth.js:93-112`
- Modify: `static/js/modules/productions.js:1735-1770`

- [ ] **Step 1: Cập nhật `loadLoginStoreBranding()` trong `static/js/auth.js`**
Đổi sang đọc `settings.app_name || settings.shop_name || '⚡ POS Offline'`.

- [ ] **Step 2: Cập nhật `saveCompanySettings()` trong `static/js/modules/productions.js`**
Sau khi lưu thành công, cập nhật trực tiếp:
```javascript
const loginNameEl = document.getElementById('login-store-name');
if (loginNameEl) loginNameEl.textContent = appName;
if (payload.shop_logo) {
    const loginLogoEl = document.getElementById('login-store-logo');
    const loginIconEl = document.getElementById('login-store-icon');
    if (loginLogoEl && loginIconEl) {
        loginLogoEl.src = payload.shop_logo;
        loginLogoEl.style.display = 'block';
        loginIconEl.style.display = 'none';
    }
}
```

- [ ] **Step 3: Kiểm tra cú pháp JavaScript**
Chạy `node -c static/js/auth.js && node -c static/js/modules/productions.js`.

---

### Task 3: Full Verification & Checkpoint Update

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `PROJECT_MAP.html`

- [ ] **Step 1: Chạy toàn bộ test suite pytest**
Chạy `pytest tests/` để đảm bảo 100% tests pass.

- [ ] **Step 2: Cập nhật `PROJECT_STATE.md` & `PROJECT_MAP.html`**
Cập nhật task vào `PROJECT_STATE.md` và `PROJECT_MAP.html`.
