# Khóa API Bắt Buộc Đăng Nhập (Hướng C — Giai đoạn 1) Implementation Plan

> **For the implementer:** Execute this plan task-by-task with the test-driven-development skill; run requesting-code-review after each task.

**Goal:** Mọi endpoint `/api/*` (trừ login, ping, version) trả 401 khi không có token; bịt rò rỉ bí mật (Gemini key, Telegram token) qua API và log; sửa 2 lỗi crash nhỏ — mà không làm hỏng màn hình nào đang dùng.

**Architecture:** Gắn `dependencies=[Depends(get_current_user)]` ở chỗ `app.include_router(...)` trong `server.py` (1 chỗ, phủ ~206 endpoint đang hở). Các nút tải Excel / in phiếu đang điều hướng thẳng tới `/api` (trình duyệt không gửi header Bearer) được chuyển sang 2 helper mới trong `static/js/auth.js` dùng `fetch` (đi qua interceptor gắn token sẵn có). Phân quyền chi tiết theo từng endpoint (`require_permission`) để **Giai đoạn 2**.

**Tech Stack:** FastAPI 0.141 / Starlette 1.6, PyJWT, SQLite, pytest + TestClient, JS thuần.

**Quyết định đã chốt với anh:**
- Hướng C: khóa cấp router ngay, phân quyền chi tiết làm dần sau.
- Bookmarklet Shopee/TikTok: **bỏ**, chỉ dùng import Excel.

---

## Bối cảnh & bằng chứng (đã kiểm chứng 2026-10-16 trên bản sao DB trong sandbox)

| Hạng mục | Hiện trạng |
|---|---|
| Test mới `test_api_requires_auth.py` trên code gốc | **206 failed / 108 passed** (206 endpoint trả 200/4xx thay vì 401) |
| Cùng test sau khi gắn dependency cấp router (spike) | **314 passed** |
| Suite cũ sau khi khóa, chưa sửa test | 29 test đỏ (gọi API không token) |
| Suite cũ sau khi thêm `owner_auth_headers()` cho 12 file test (spike) | **581 passed**, 1 đỏ có sẵn từ trước (`test_offline_tailwind_configured`) |
| `GET /api/settings` không token | 200, trả nguyên văn `gemini_api_key`, `telegram_bot_token` |
| `pos_debug.log`, `logs/pos_app.log` | chứa URL `api.telegram.org/bot<TOKEN>/getUpdates` (httpx log INFO) |
| `database.py:1991` | `logger.warning(...)` nhưng `logger` chưa định nghĩa → `init_db()` crash nếu sync sổ quỹ lỗi |
| `server.py:267` | dùng `datetime.datetime.now()` nhưng không `import datetime` |
| `tests/conftest.py` | chép DB thật (có token Telegram) và không tắt luồng nền → **mỗi lần chạy pytest bật thêm 1 bot poll** → góp phần gây 409 Conflict |

**Frontend đã rà:**
- `auth.js` có interceptor `window.fetch` tự gắn `Authorization` cho URL bắt đầu bằng `/api` → mọi `fetch('/api…')` và `fetch(url)` (url tương đối) đều an toàn.
- **14 chỗ** điều hướng thẳng tới `/api` (không qua fetch) sẽ hỏng sau khi khóa → Task 9–10.
- Bookmarklet chạy trên domain Shopee, không có token → bỏ (Task 11).

**Ràng buộc thực thi:** phiên này **không có shell trên máy anh**. Em sửa file trên bản sao trong sandbox, chạy test ở đó, rồi chép file đã sửa về `D:\Projects_Hermes\pos-offline-petcare2`. Lệnh `git` / build exe ở dưới là lệnh **anh chạy** trên máy (Git Bash hoặc CMD).

---

## Task 0: Tạo nhánh

**Objective:** Cô lập thay đổi để dễ revert.

```bash
cd /d/Projects_Hermes/pos-offline-petcare2
git status            # phải sạch; nếu không, commit/stash trước
git checkout -b fix/api-auth-lockdown
```

---

## Task 1: Pytest không được bật Telegram poller / backup thật

**Objective:** Chạy test không còn chiếm `getUpdates` của bot thật (một nguồn gây 409) và không chạy backup scheduler.

**Files:**
- Modify: `server.py:141` (khối `if not os.environ.get("VERCEL"):` khởi động backup + telegram)
- Modify: `tests/conftest.py` (đầu file)
- Test: `tests/test_background_disabled_in_tests.py`

**Step 1: Write failing test**

```python
# tests/test_background_disabled_in_tests.py
def test_pytest_does_not_start_telegram_poller():
    import server  # noqa: F401  (import để chạy khối khởi động)
    from services import telegram_bot
    assert telegram_bot._polling_thread is None
```

**Step 2: Run — expect FAIL**

Run: `python -m pytest tests/test_background_disabled_in_tests.py -v`
Expected: FAIL — `assert <Thread(TelegramBotPoll...)> is None`

**Step 3: Minimal implementation**

`server.py` dòng 141, đổi:
```python
if not os.environ.get("VERCEL"):
```
thành:
```python
if not os.environ.get("VERCEL") and not os.environ.get("POS_DISABLE_BACKGROUND"):
```

`tests/conftest.py`, ngay sau `import pytest`:
```python
# Không bật Telegram poller / backup scheduler thật khi chạy test (tránh 409 Conflict với bot đang chạy)
os.environ.setdefault("POS_DISABLE_BACKGROUND", "1")
```

**Step 4: Run — expect PASS**

Run: `python -m pytest tests/test_background_disabled_in_tests.py -v` → 1 passed

**Step 5: Commit**
```bash
git add server.py tests/conftest.py tests/test_background_disabled_in_tests.py
git commit -m "test: disable telegram poller and backup scheduler during pytest"
```

---

## Task 2: Test "mọi /api phải 401 khi không token" (RED)

**Objective:** Lưới an toàn tự động: endpoint mới nào quên khóa sẽ làm test đỏ.

**Files:**
- Create: `tests/test_api_requires_auth.py`

**Step 1: Write failing test**

```python
# tests/test_api_requires_auth.py
import re
import pytest
from fastapi.testclient import TestClient
from server import app

PUBLIC = {
    ("POST", "/api/auth/login"),
    ("GET", "/api/ping"),
    ("GET", "/api/version"),
}


def _api_routes():
    # Lấy từ OpenAPI schema: ổn định qua các bản FastAPI (app.routes đã đổi cấu trúc ở 0.14x)
    out = set()
    for path, ops in app.openapi()["paths"].items():
        if not path.startswith("/api"):
            continue
        for method in ops:
            m = method.upper()
            if m in {"GET", "POST", "PUT", "PATCH", "DELETE"} and (m, path) not in PUBLIC:
                out.add((m, path))
    return sorted(out)


ROUTES = _api_routes()


def _fill(path):
    return re.sub(r"\{[^}]+\}", "1", path)


@pytest.fixture
def anon_client():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.update(saved)


def test_route_inventory_is_not_empty():
    assert len(ROUTES) > 150


@pytest.mark.parametrize("method,path", ROUTES, ids=[f"{m} {p}" for m, p in ROUTES])
def test_api_rejects_anonymous(anon_client, method, path):
    res = anon_client.request(method, _fill(path))
    assert res.status_code == 401, f"{method} {path} trả {res.status_code} khi không có token"


def test_login_stays_open(anon_client):
    res = anon_client.post("/api/auth/login", data={"username": "khong_ton_tai", "password": "x"})
    assert res.status_code in (401, 429)
    assert res.json()["detail"] != "Not authenticated"


@pytest.mark.parametrize("path", ["/api/ping", "/api/version"])
def test_public_get_stays_open(anon_client, path):
    assert anon_client.get(path).status_code == 200
```

**Step 2: Run — expect FAIL**

Run: `python -m pytest tests/test_api_requires_auth.py -q`
Expected: `206 failed, 108 passed` (con số đã đo trên sandbox)

**Step 3: KHÔNG sửa code ở task này** — giữ đỏ, sang Task 3 trước để suite cũ không vỡ khi khóa.

**Step 4: Commit (test đỏ có chủ đích)**
```bash
git add tests/test_api_requires_auth.py
git commit -m "test: require 401 for every /api endpoint without token (red)"
```

---

## Task 3: Helper đăng nhập cho test cũ

**Objective:** 12 file test đang gọi API không token phải dùng client có token owner, để chúng vẫn xanh sau khi khóa.

**Files:**
- Create: `tests/auth_helpers.py`
- Modify (mỗi file: thêm 1 import + đổi `TestClient(app)` → `TestClient(app, headers=owner_auth_headers())`):
  - `tests/test_cashbook_categories_crud.py` (1 chỗ)
  - `tests/test_expense_requests.py` (2 chỗ)
  - `tests/test_hotel_system.py` (3 chỗ)
  - `tests/test_k80_discount.py` (1)
  - `tests/test_marketplace_api.py` (1)
  - `tests/test_oem_bom_cost_calculation.py` (1)
  - `tests/test_oem_order_discount_modes.py` (1)
  - `tests/test_order_advanced_filters.py` (1)
  - `tests/test_order_return_exchange.py` (1)
  - `tests/test_pet_pricing_table.py` (1)
  - `tests/test_spa_wallet_tracking.py` (1)
  - `tests/test_wholesale_print_logic.py` (1)

**Step 1: Tạo helper**

```python
# tests/auth_helpers.py
"""Helper cho test: header Bearer của tài khoản owner thật trong DB test (sau khi /api/* bắt buộc đăng nhập)."""
from database import get_db
from routers.auth import _make_token


def owner_auth_headers() -> dict:
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT id, token_version FROM staff WHERE role IN ('owner', 'admin') AND is_active = 1 ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()
    db.close()
    assert row, "DB test chưa có tài khoản owner/admin đang hoạt động"
    return {"Authorization": f"Bearer {_make_token(row['id'], row['token_version'] or 0)}"}
```

**Step 2: Sửa 12 file** — thêm sau khối import đầu file:
```python
from tests.auth_helpers import owner_auth_headers
```
và thay mọi `TestClient(app)` bằng `TestClient(app, headers=owner_auth_headers())`. Header truyền tường minh trong từng request (vd. token giả 9999/8888) vẫn ghi đè header mặc định → không đổi hành vi các test đó.

**Step 3: Verify (vẫn trên code CHƯA khóa)**

Run: `python -m pytest tests/test_cashbook_categories_crud.py tests/test_expense_requests.py tests/test_hotel_system.py tests/test_k80_discount.py tests/test_marketplace_api.py tests/test_oem_bom_cost_calculation.py tests/test_oem_order_discount_modes.py tests/test_order_advanced_filters.py tests/test_order_return_exchange.py tests/test_pet_pricing_table.py tests/test_spa_wallet_tracking.py tests/test_wholesale_print_logic.py -q`
Expected: tất cả passed (thêm header không làm hỏng gì).

**Step 4: Commit**
```bash
git add tests/auth_helpers.py tests/test_*.py
git commit -m "test: use authenticated owner client in API tests"
```

---

## Task 4: Khóa toàn bộ router (GREEN cho Task 2)

**Objective:** Mọi router (trừ `auth_router`, vốn đã tự khóa từng endpoint trừ `/login`) bắt buộc token hợp lệ.

**Files:**
- Modify: `server.py` — khối `app.include_router(...)` cuối file (khoảng dòng 393–416)

**Step 1: Test đỏ đã có từ Task 2.**

**Step 2: Implementation** — thay toàn bộ khối đăng ký router bằng:

```python
# Đăng ký toàn bộ các sub-routers
# auth_router tự quản lý quyền từng endpoint (/login phải mở) -> không gắn dependency chung.
app.include_router(auth_router)

# Mọi router nghiệp vụ: BẮT BUỘC đăng nhập. Phân quyền chi tiết (require_permission) nằm trong từng endpoint.
_LOGIN_REQUIRED = [Depends(get_current_user)]
for _r in (
    shifts_router, combos_router, settings_router, categories_router, spa_cat_router,
    products_router, pos_router, inventory_router, bom_router, partners_router,
    pets_router, service_router, purchases_router, production_router, cashbook_router,
    price_lists_router, router_segments, promotions_router, oem_router, topup_router,
    hotel_router, ai_assistant_router, marketplace_router,
):
    app.include_router(_r, dependencies=_LOGIN_REQUIRED)
```

(`Depends` và `get_current_user` đã được import ở đầu `server.py`. FastAPI cache dependency trong 1 request nên endpoint nào cũng dùng `get_current_user` thì không tốn thêm query.)

**Step 3: Run**

Run: `python -m pytest tests/test_api_requires_auth.py -q` → Expected: `314 passed` (±, tùy số route)
Run: `python -m pytest -q` → Expected: không có test đỏ mới so với baseline (baseline đỏ sẵn: `test_offline_tailwind_configured`).

**Step 4: Commit**
```bash
git add server.py
git commit -m "fix(security): require login for all business API routers"
```

---

## Task 5: `GET /api/settings` không trả bí mật

**Objective:** Kể cả người đã đăng nhập (nhân viên) cũng không đọc được Gemini key / Telegram token. Frontend không dùng 2 key này từ endpoint này (đã grep: AI dùng `/api/ai/config` có mask; Telegram dùng `/api/settings/telegram` owner-only).

**Files:**
- Modify: `routers/settings.py` — hàm `get_settings()` (khoảng dòng 144)
- Test: `tests/test_settings_hide_secrets.py`

**Step 1: Failing test**

```python
# tests/test_settings_hide_secrets.py
from fastapi.testclient import TestClient
from database import get_db
from server import app
from tests.auth_helpers import owner_auth_headers

SECRET_KEYS = ("gemini_api_key", "telegram_bot_token")


def test_get_settings_never_returns_secret_keys():
    db = get_db()
    cur = db.cursor()
    for k in SECRET_KEYS:  # đảm bảo key tồn tại trong DB test, không ghi đè giá trị thật
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'secret-test')", (k,))
    db.commit()
    db.close()

    data = TestClient(app, headers=owner_auth_headers()).get("/api/settings").json()
    for k in SECRET_KEYS:
        assert k not in data
    assert "shop_name" in data
```

**Step 2: Run** `python -m pytest tests/test_settings_hide_secrets.py -v` → FAIL (`'gemini_api_key' in data`)

**Step 3: Implementation** — trong `routers/settings.py`, trên `@router.get("")`:
```python
# Không bao giờ trả qua API đọc chung; có endpoint riêng (mask / owner-only)
SECRET_SETTING_KEYS = {"gemini_api_key", "telegram_bot_token"}
```
và trong `get_settings()` đổi dòng dựng dict thành:
```python
    settings = {r["key"]: r["value"] for r in cur.fetchall() if r["key"] not in SECRET_SETTING_KEYS}
```

**Step 4: Run** → PASS. Chạy thêm `python -m pytest tests/test_telegram_layout_and_cashbook_linkage.py tests/test_settings_and_ai_agent_tab.py -q` → passed.

**Step 5: Commit**
```bash
git add routers/settings.py tests/test_settings_hide_secrets.py
git commit -m "fix(security): never expose gemini/telegram secrets via GET /api/settings"
```

---

## Task 6: Token Telegram không lọt vào log

**Objective:** httpx không ghi URL request (chứa token) ở mức INFO.

**Files:**
- Modify: `server.py` — ngay sau `logger = logging.getLogger("pos_server")` (khoảng dòng 44)
- Test: `tests/test_no_secret_in_logs.py`

**Step 1: Failing test**
```python
# tests/test_no_secret_in_logs.py
import logging


def test_httpx_request_logs_suppressed():
    import server  # noqa: F401
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
```

**Step 2: Run** → FAIL (effective level = INFO)

**Step 3: Implementation**
```python
# httpx log mỗi request kèm full URL — URL Telegram chứa bot token -> chỉ log WARNING trở lên
logging.getLogger("httpx").setLevel(logging.WARNING)
```

**Step 4: Run** → PASS

**Step 5: Commit**
```bash
git add server.py tests/test_no_secret_in_logs.py
git commit -m "fix(security): stop httpx from logging telegram bot token URLs"
```

---

## Task 7: `init_db()` không crash khi sync sổ quỹ lỗi

**Files:**
- Modify: `database.py` — khối import đầu file (dòng 1–5)
- Test: `tests/test_init_db_resilience.py`

**Step 1: Failing test**
```python
# tests/test_init_db_resilience.py
def test_init_db_survives_cashbook_sync_failure(monkeypatch):
    import scripts.migrate_cashbook_sync as m

    def boom(conn):
        raise RuntimeError("sync lỗi giả lập")

    monkeypatch.setattr(m, "sync_missing_cashbook_entries", boom)
    from database import init_db
    init_db()  # trước khi sửa: NameError: name 'logger' is not defined
```

**Step 2: Run** → FAIL `NameError: name 'logger' is not defined`

**Step 3: Implementation** — `database.py`, thêm sau `from collections.abc import Mapping`:
```python
import logging

logger = logging.getLogger("database")
```
(Kiểm tra trước: `grep -n "^logger\|logger =" database.py` không có định nghĩa nào khác.)

**Step 4: Run** → PASS

**Step 5: Commit**
```bash
git add database.py tests/test_init_db_resilience.py
git commit -m "fix(db): define logger so init_db survives cashbook sync failure"
```

---

## Task 8: `apply-update` nhánh Linux thiếu `import datetime`

**Files:**
- Modify: `server.py` — khối import đầu file
- Test: `tests/test_server_imports.py`

**Step 1: Failing test**
```python
# tests/test_server_imports.py
def test_server_has_datetime_for_linux_update_path():
    import datetime
    import server
    assert server.datetime is datetime
```

**Step 2: Run** → FAIL `AttributeError: module 'server' has no attribute 'datetime'`

**Step 3:** thêm `import datetime` cạnh `import logging` ở đầu `server.py`.

**Step 4: Run** → PASS

**Step 5: Commit**
```bash
git add server.py tests/test_server_imports.py
git commit -m "fix(update): import datetime for linux apply-update backup stamp"
```

---

## Task 9: Helper tải file / mở trang in có token

**Objective:** Cung cấp `downloadWithAuth(url, tênMặcĐịnh)` và `openWithAuth(url)` dùng `fetch` (interceptor tự gắn Bearer).

**Files:**
- Modify: `static/js/auth.js` — ngay sau khối `window.fetch = async (...) => {...};` (khoảng dòng 134)
- Test: `tests/test_authed_downloads.py`

**Step 1: Failing test**
```python
# tests/test_authed_downloads.py
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = {"tailwind.js", "chart.umd.min.js"}
JS_FILES = [p for p in (ROOT / "static" / "js").rglob("*.js") if p.name not in VENDOR]
HTML = ROOT / "templates" / "index.html"
DIRECT_API_NAV = re.compile(r"""(window\.open\(|location\.href\s*=|href\s*=)\s*['"`]/api/""")
LOCATION_URL_VAR = re.compile(r"location\.href\s*=\s*url\b")


def test_auth_js_exposes_download_helpers():
    src = (ROOT / "static" / "js" / "auth.js").read_text(encoding="utf-8")
    assert "async function downloadWithAuth(" in src
    assert "async function openWithAuth(" in src
    assert "window.downloadWithAuth = downloadWithAuth" in src
    assert "window.openWithAuth = openWithAuth" in src


def test_no_direct_browser_navigation_to_api():
    offenders = []
    for p in JS_FILES + [HTML]:
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if DIRECT_API_NAV.search(line) or LOCATION_URL_VAR.search(line):
                offenders.append(f"{p.relative_to(ROOT)}:{i}")
    assert not offenders, "Điều hướng thẳng tới /api không gửi được token: " + ", ".join(offenders)
```

**Step 2: Run** `python -m pytest tests/test_authed_downloads.py -v` → cả 2 FAIL (test thứ 2 liệt kê 14 chỗ — sẽ xanh ở Task 10).

**Step 3: Implementation** — chèn vào `static/js/auth.js`:
```javascript
// ── Tải file / mở trang in KÈM TOKEN ──
// Link trực tiếp (<a href>, window.open, location.href) không gửi header Authorization,
// nên mọi file/trang lấy từ /api phải đi qua fetch (interceptor ở trên tự gắn Bearer).
async function downloadWithAuth(url, fallbackName = 'download.xlsx') {
  const res = await fetch(url);
  if (!res.ok) {
    if (window.showToast) window.showToast(`Không tải được file (lỗi ${res.status})`, 'error');
    return;
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const name = m ? decodeURIComponent(m[1] || m[2]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function openWithAuth(url) {
  const win = window.open('', '_blank'); // mở ngay trong cú click để không bị chặn popup
  const res = await fetch(url);
  const html = await res.text();
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
window.downloadWithAuth = downloadWithAuth;
window.openWithAuth = openWithAuth;
```

**Step 4: Run** → `test_auth_js_exposes_download_helpers` PASS; `node --check static/js/auth.js` → không lỗi.

**Step 5: Commit**
```bash
git add static/js/auth.js tests/test_authed_downloads.py
git commit -m "feat(auth): add downloadWithAuth/openWithAuth helpers"
```

---

## Task 10: Chuyển 14 chỗ tải/in sang helper

**Objective:** `test_no_direct_browser_navigation_to_api` xanh; mọi nút Excel / in phiếu vẫn chạy sau khi khóa.

**Files & thay thế chính xác:**

| # | File:dòng | Hiện tại | Thay bằng |
|---|---|---|---|
| 1 | `static/js/modules/purchases.js:916` | ``window.open(`/api/purchases/${currentViewingPurchase.code}/print-checklist`, '_blank');`` | ``openWithAuth(`/api/purchases/${currentViewingPurchase.code}/print-checklist`);`` |
| 2 | `static/js/modules/purchases.js:994` | `onclick="window.open('/api/purchases/${p.code}/print-checklist', '_blank')"` | `onclick="openWithAuth('/api/purchases/${p.code}/print-checklist')"` |
| 3 | `static/js/modules/purchases.js:1000` | (giống #2) | (giống #2) |
| 4 | `static/js/modules/reports_analytics.js:409` | ``window.location.href = `/api/reports/export-excel?from_date=…&to_date=…`;`` | ``downloadWithAuth(`/api/reports/export-excel?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}`, 'Bao_Cao_Tong_Hop.xlsx');`` |
| 5 | `static/js/modules/contacts.js:638` | ``window.location.href = `/api/contacts/template-excel?type=…&_t=…`;`` | ``downloadWithAuth(`/api/contacts/template-excel?type=${encodeURIComponent(type)}&_t=${Date.now()}`, type === 'customer' ? 'Mau_Khach_Hang.xlsx' : 'Mau_Nha_Cung_Cap.xlsx');`` |
| 6 | `static/js/modules/contacts.js:641–648` | hàm `updateDownloadTemplateLink()` — trỏ tới element `btn-download-contact-template` **không tồn tại** (code chết) | Xóa hàm; xóa lời gọi ở `contacts.js:627`; xóa `onchange="updateDownloadTemplateLink()"` ở `templates/index.html:9451`. Kiểm tra: `grep -rn updateDownloadTemplateLink static templates` → rỗng |
| 7 | `static/js/modules/contacts.js:694` | ``window.location.href = `/api/contacts/export-excel?type=${type}`;`` | ``downloadWithAuth(`/api/contacts/export-excel?type=${type}`, `Danh_Ba_${type}.xlsx`);`` |
| 8 | `static/js/modules/productions.js:3595` | `window.location.href = url;` (xuất nguyên liệu) | `downloadWithAuth(url, 'Nguyen_Lieu.xlsx');` |
| 9 | `static/js/modules/productions.js:3678` | `window.location.href = url;` (xuất BOM) | `downloadWithAuth(url, 'Dinh_Luong_BOM.xlsx');` |
| 10 | `static/js/app.js:2682` | `window.location.href = url;` (xuất hàng hóa) | `downloadWithAuth(url, 'Hang_Hoa.xlsx');` |
| 11 | `templates/index.html:12868` | ``window.location.href = `/api/price-lists/${plId}/export-excel`;`` | ``downloadWithAuth(`/api/price-lists/${plId}/export-excel`, 'Bang_Gia.xlsx');`` |
| 12 | `templates/index.html:6518` | `<a href="/api/ingredients/template-excel" download="Mau_Import_Nguyen_Lieu.xlsx" class="…">` | `<a href="#" onclick="downloadWithAuth('/api/ingredients/template-excel', 'Mau_Import_Nguyen_Lieu.xlsx'); return false;" class="…">` |
| 13 | `templates/index.html:6560` | `<a href="/api/bom/template-excel" download="Mau_Import_BOM.xlsx" …>` | `<a href="#" onclick="downloadWithAuth('/api/bom/template-excel', 'Mau_Import_BOM.xlsx'); return false;" …>` |
| 14 | `templates/index.html:7267` | `<a href="/api/products/template-excel" download="Mau_Import_Hang_Hoa.xlsx" …>` | `<a href="#" onclick="downloadWithAuth('/api/products/template-excel', 'Mau_Import_Hang_Hoa.xlsx'); return false;" …>` |

(Giữ nguyên `class` và nội dung bên trong thẻ `<a>`.)

**Lợi ích phụ:** xuất Excel hàng hóa (`/api/products/export-excel`, dùng `get_optional_user`) trước nay **luôn ẩn cột giá vốn kể cả với owner** vì link trực tiếp không gửi token → sau task này owner sẽ thấy đúng giá vốn.

**Verify:**
- `python -m pytest tests/test_authed_downloads.py tests/test_html_integrity.py -q` → passed
- `node --check` cho `purchases.js`, `reports_analytics.js`, `contacts.js`, `productions.js`, `app.js` → không lỗi

**Commit**
```bash
git add static/js templates/index.html
git commit -m "fix(auth): route excel downloads and print pages through authenticated fetch"
```

---

## Task 11: Gỡ bookmarklet Shopee/TikTok

**Files:**
- Modify: `templates/index.html` — khối từ `<!-- 1-Click Bookmarklet Tool -->` (khoảng dòng 13773) đến `</div>` đóng của nó, ngay trước `<div>` chứa nhãn "Tên gian hàng / Shop"
- Modify: `static/js/modules/marketplace.js` — xóa: khối `const bLink = …` (dòng ~206–210); hàm `generateBookmarkletCode` + `window.generateBookmarkletCode = …` (dòng ~226–321); hàm `copyBookmarkletCode` + export (dòng ~323–334)
- Test: `tests/test_marketplace_no_bookmarklet.py`

**Step 1: Failing test**
```python
# tests/test_marketplace_no_bookmarklet.py
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_bookmarklet_removed():
    js = (ROOT / "static/js/modules/marketplace.js").read_text(encoding="utf-8")
    html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    assert "generateBookmarkletCode" not in js
    assert "copyBookmarkletCode" not in js
    assert "mkt-bookmarklet-link" not in html
    assert "copyBookmarkletCode" not in html
```

**Step 2: Run** → FAIL. **Step 3:** xóa như trên. **Step 4:** test PASS; `node --check static/js/modules/marketplace.js`; `python -m pytest tests/test_marketplace_api.py tests/test_html_integrity.py -q` → passed.

**Step 5: Commit**
```bash
git add templates/index.html static/js/modules/marketplace.js tests/test_marketplace_no_bookmarklet.py
git commit -m "chore(marketplace): remove bookmarklet (cannot authenticate cross-site)"
```

---

## Task 12: Kiểm thử toàn bộ + chạy thật trên máy anh

**Step 1: Full suite** — `python -m pytest -q` → không có test đỏ mới so với baseline.

**Step 2: Chạy server thử ở cổng phụ** (không đụng bản đang chạy 8998):
```bat
cd /d D:\Projects_Hermes\pos-offline-petcare2
.venv\Scripts\python -m uvicorn server:app --port 8997
```

**Step 3: Kiểm từ ngoài, chưa đăng nhập** (CMD khác):
```bat
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8997/api/settings
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8997/api/contacts
curl -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8997/api/ping
```
Expected: `401`, `401`, `200`.

**Step 4: Checklist trình duyệt** (`http://127.0.0.1:8997`, Ctrl+F5, đăng nhập owner):
- [ ] Bán 1 đơn POS, in hóa đơn
- [ ] Tab Hàng hóa: Xuất Excel (mở file → **có cột giá vốn**), tải file mẫu import
- [ ] Nguyên liệu: xuất Excel + tải mẫu; BOM: xuất + tải mẫu
- [ ] Đối tác: tải mẫu khách hàng / NCC, xuất danh bạ
- [ ] Bảng giá: xuất Excel
- [ ] Nhập hàng: nút "🖨️ Phiếu Kiểm" mở tab in đúng nội dung
- [ ] Báo cáo: xuất Excel
- [ ] Spa, Hotel, Sổ quỹ, Sàn TMĐT (import Excel), Cài đặt: mở được, không bị đá ra màn đăng nhập
- [ ] Đăng nhập bằng tài khoản **nhân viên**: các tab được phép vẫn chạy
- [ ] Modal cấu hình sàn: không còn khối bookmarklet

**Step 5:** `pos_debug.log` / `logs/pos_app.log` sau vài phút: **không còn** dòng `api.telegram.org/bot`.

---

## Task 13: Review, build, triển khai

1. Chạy skill `requesting-code-review` trên diff của nhánh.
2. Cập nhật `PROJECT_STATE.md` (mục Phiên Hiện Tại + Bằng Chứng Kiểm Thử).
3. Merge & push:
   ```bash
   git checkout main && git merge --no-ff fix/api-auth-lockdown && git push
   ```
4. Build lại exe: `deploy\build_exe.bat`.
5. Máy chủ tiệm: chạy `CAP_NHAT.bat`, Ctrl+F5 trên mọi máy con.

---

## Việc anh làm tay (không cần code) — làm NGAY, không chờ plan

- [ ] **BotFather → /revoke** token bot hiện tại → nhập token mới trong Cài đặt → Telegram.
- [ ] **Google AI Studio**: xóa Gemini API key cũ, tạo key mới, nhập lại trong tab AI.
- [ ] Tìm **tiến trình thứ 2 đang poll bot** (gây 409): exe trên máy chủ + bản dev đang chạy, hoặc máy phụ `F:\New folder`, hoặc pytest (sẽ hết sau Task 1). Chỉ để **một** nơi chạy bot.
- [ ] Đặt mật khẩu mạnh cho `admin` và `thanhtuan` (đã có trong PROJECT_STATE).

---

## Rủi ro & lưu ý

- **Trang `/pos` và `/pos/m` (độc lập)** không nạp `auth.js` → hiện **đã không tạo được đơn** (`POST /api/orders` yêu cầu `pos.sell` từ trước). Sau khi khóa, các thao tác đọc ở 2 trang này cũng 401. QR máy con trỏ về `/` (app chính, đã responsive) nên nhiều khả năng không ai dùng. **Ngoài phạm vi plan này** — đề xuất plan sau: chuyển hướng `/pos`, `/pos/m` về `/`.
- **`/api/marketplace/accounts/auto-cookie`** chỉ bookmarklet gọi; sau Task 4 nó bị khóa, sau Task 11 không còn ai gọi. Để nguyên, dọn ở Giai đoạn 2.
- **`google_drive_webhook_url`** vẫn trả qua `GET /api/settings` (cho mọi người đã đăng nhập) vì form Cài đặt công ty đọc/ghi nó; nếu ẩn đi thì lần lưu sau sẽ xóa mất URL. Xử lý đúng ở Giai đoạn 2 (owner-only cho cả đọc lẫn ghi).
- Interceptor 401 sẽ `Auth.clear()` + hiện màn đăng nhập. Nếu có màn nào gọi API trước khi đăng nhập (ngoài login/version) nó sẽ chỉ thấy 401 im lặng — đã rà: không có.
- CORS `allow_origins=["*"]` + `allow_credentials=True`: ít rủi ro hơn sau khi khóa (token nằm ở header, không phải cookie). Siết ở Giai đoạn 2.

## Giai đoạn 2 (plan riêng, làm dần — phần "B" của hướng C)

Gắn `require_permission` / `require_role("owner")` theo thứ tự rủi ro:
1. Xóa hàng loạt: `DELETE /api/products/clear/all-products`, `POST /api/products/bulk-delete`, `DELETE /api/marketplace/orders-clear-all`, `POST /api/marketplace/orders/bulk-delete`
2. Cài đặt: `POST /api/settings/company|template|print-bold-configs|backup-drive-now`, `POST /api/ai/config|test-key`
3. Tiền: `POST /api/expense-requests/{id}/approve`, các endpoint ghi sổ quỹ, topup
4. Danh mục, giá, BOM, nhân viên spa, bảng giá dịch vụ
5. Còn lại: các GET dữ liệu nhạy cảm (giá vốn, công nợ, báo cáo) theo ma trận quyền hiện có
