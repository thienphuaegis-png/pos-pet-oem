# Cập nhật máy chủ từ xa + Tự rollback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Anh Phú mở POS qua link Funnel, bấm **⚡ Cập Nhật Ngay** → máy chủ tiệm tự cập nhật; bản mới không chạy được thì **tự quay về bản cũ + DB cũ**, anh xem kết quả ngay trên web.

**Architecture:** Nút web gọi `POST /api/system/apply-update` → server spawn **tách rời** `deploy\CAP_NHAT.bat /auto` (sống sót khi server bị tắt). Script: tắt server → backup DB (SQLite backup API) → nhớ commit cũ → pull → pip → `init_db()` → chạy lại → ping. Lỗi ở bất kỳ bước nào sau pull → `reset --hard` commit cũ + khôi phục DB backup + chạy lại. Kết quả ghi `logs\update_status.txt`; web poll `GET /api/system/update-status` để hiện kết quả.

**Tech Stack:** Windows batch, PowerShell, FastAPI, SQLite, vanilla JS.

## Global Constraints

- Không bao giờ để `data/pos.db` vào git; `git rm` luôn kèm `--cached`.
- `init_db()` phải idempotent — không phá.
- Dòng `echo` trong `.bat` chỉ ASCII (test `test_echo_lines_are_ascii`).
- Không dùng `timeout` trong `.bat`, không gọi `winget`/`git` trần (test đã canh).
- File `.bat` giữ **CRLF**. Sửa bằng `patch` tool hoặc Python `newline=''`, **không dùng `sed`**.
- Token không được lọt vào log: giữ nguyên lớp `findstr /v /c:"!TOKEN!"`.
- Sửa `server.py` ⇒ phải rebuild `POS_Mastercare.exe` trước push (`.venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec --clean -y`, rồi `cp dist/POS_Mastercare.exe POS_Mastercare.exe`).

## Scope Boundary & Anti-Drift Guards (Strict)

1. **Chạm đúng biên:** chỉ sửa file/hàm/dòng chỉ định. Không refactor, reformat lân cận.
2. **Bằng chứng test thực tế:** paste nguyên văn output `pytest`. Cấm tự nhận PASS.
3. **Tuần tự theo nấc:** xong 1 task → in log test → dừng chờ xác nhận.

**Ngoài phạm vi (KHÔNG làm trong plan này):**
- `CAP_NHAT.bat` ở thư mục gốc (bản cũ, `reset --hard` + import sheets) — để nguyên, endpoint không gọi nó nữa.
- Lệch cổng 8998 (server) vs 8999 (installer/QR/quét LAN) — plan riêng.
- Nhánh Linux/Docker trong `apply_system_update` — để nguyên.
- Tự động cập nhật theo lịch, nhánh `stable`.

---

## Hiện trạng (đã đọc code 2026-10-17)

| Thành phần | Vị trí | Vấn đề |
|---|---|---|
| Endpoint cập nhật | `server.py:240-260` | Gọi `CAP_NHAT.bat` **gốc** (`root_dir / "CAP_NHAT.bat"`), `Popen(shell=True)` không tách tiến trình |
| Script gốc | `CAP_NHAT.bat:103,135` | Chạy `import_full_google_sheets_history.py` (ghi `DELETE/INSERT` vào DB thật) mỗi lần; `pause` cuối → treo |
| Script deploy | `deploy/CAP_NHAT.bat` | Tốt hơn nhưng: **backup (dòng 69) TRƯỚC khi tắt server (dòng 84)** → `copy` file đang mở WAL có thể thiếu dữ liệu; 7 chỗ `pause`; **không rollback** |
| Ping health | `server.py:307`, `deploy/CAP_NHAT.bat:160-167` | Đã ping cả 8998 & 8999, 15s |
| Nút web | `static/js/app.js:5062` | Luôn hiện nút kể cả khi không có bản mới; reload cứng sau 6s (cập nhật thật mất 1-3 phút) |
| Shortcut Desktop | `deploy/CAI_DAT_MAY_CHU.bat:218-219` | "CAP NHAT POS" → `deploy\CAP_NHAT.bat` (không tham số → vẫn có `pause` cho người ở tiệm) |
| Test cũ phụ thuộc | `tests/test_deploy_scripts.py:85-93` | `test_update_backs_up_before_pull` tìm chuỗi `copy ` → **phải sửa** khi đổi sang backup API |

## File Structure

| File | Responsibility |
|---|---|
| `deploy/CAP_NHAT.bat` | Modify — chế độ `/auto`, tắt server trước backup, backup API, nhớ commit cũ, rollback, ghi status, xóa lock |
| `server.py:240-260` | Modify — nhánh Windows: lock chống bấm 2 lần, spawn tách rời `deploy\CAP_NHAT.bat /auto`, log ra `logs\` |
| `server.py` (sau endpoint apply) | Create — `GET /api/system/update-status` |
| `static/js/app.js:5054-5143` | Modify — ẩn nút khi không có bản mới; poll status thay vì reload 6s; hiện kết quả lần cập nhật cuối |
| `tests/test_deploy_scripts.py` | Modify — sửa test backup cũ; thêm test `/auto`, rollback, thứ tự tắt→backup |
| `tests/test_remote_update.py` | Create — test endpoint apply/status/lock/quyền |
| `tests/manual/e2e_remote_update.md` | Create — kịch bản E2E chạy thật (repo bare giả GitHub) |

---

### Task 1: `deploy/CAP_NHAT.bat` — chế độ `/auto` + backup đúng thứ tự

**Files:**
- Modify: `deploy/CAP_NHAT.bat:1-90`
- Test: `tests/test_deploy_scripts.py`

**Interfaces:**
- Produces: `deploy\CAP_NHAT.bat /auto` không bao giờ dừng chờ phím; biến `!BACKUP!` là bản sao nhất quán (gồm cả WAL).

- [ ] **Step 1: Viết test (fail)** — thêm vào `tests/test_deploy_scripts.py`, và **sửa** `test_update_backs_up_before_pull`:

```python
def test_update_backs_up_before_pull():
    src = _read("CAP_NHAT.bat")
    i_backup = src.find(".backup(")
    i_pull = src.find("pull --ff-only")
    assert i_backup != -1, "CAP_NHAT.bat phải backup bằng sqlite3 backup API (an toàn với WAL)"
    assert i_pull != -1, "CAP_NHAT.bat không có bước pull"
    assert i_backup < i_pull, "Sao lưu PHẢI nằm trước pull"


def test_update_stops_server_before_backup():
    """copy pos.db khi server đang chạy chế độ WAL → bản sao thiếu giao dịch gần nhất."""
    src = _read("CAP_NHAT.bat")
    i_stop = src.find("Stop-Process")
    i_backup = src.find(".backup(")
    assert -1 < i_stop < i_backup, "Phải tắt server TRƯỚC khi backup DB"


def test_update_auto_mode_never_pauses():
    """Chạy từ nút web (/auto) không có ai bấm phím — `pause` trần làm treo vĩnh viễn."""
    src = _read("CAP_NHAT.bat")
    assert '"%~1"=="/auto"' in src, "CAP_NHAT.bat phải nhận tham số /auto"
    for i, line in enumerate(src.splitlines(), 1):
        s = line.strip().lower()
        if s.startswith(("rem", "::", "echo")):
            continue
        assert not re.search(r"(^|&|\()\s*pause\b", s), \
            f"CAP_NHAT.bat:{i} dùng pause trần — đổi thành %PAUSE%: {line.strip()}"
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests/test_deploy_scripts.py
```
Kỳ vọng: 3 test trên FAIL.

- [ ] **Step 3: Sửa `deploy/CAP_NHAT.bat`**

3a. Ngay sau `set "ROOT=%CD%"` (dòng 6) thêm:

```bat
REM /auto = chay tu nut web: khong pause, ghi ket qua ra logs\update_status.txt
set "PAUSE=pause"
if /i "%~1"=="/auto" set "PAUSE=rem"
if not exist "logs" mkdir "logs"
set "OLD=" & set "NEW=" & set "BACKUP="
```

3b. Thay **mọi** `pause` trần bằng `%PAUSE%` (dòng 22, 42, 49, 56, 72, 78, 130, 146, 181 — đếm lại bằng `grep -n pause deploy/CAP_NHAT.bat` trước khi sửa). Ví dụ `pause & exit /b 1` → `%PAUSE% & exit /b 1`. Lỗi trước bước pull dùng `call :write_status FAILED_PRECHECK "<lý do>"` trước khi exit.

3c. Đổi thứ tự: chuyển khối `REM --- 2/5 Tat server dang chay ---` (dòng 82-89) lên **trước** khối `REM --- 1/5 Sao luu` (dòng 51).

3d. Thay `copy /y "data\pos.db" "!BACKUP!" >nul` + khối kiểm tra (dòng 69-79) bằng:

```bat
"%VPY%" -c "import sqlite3,sys; s=sqlite3.connect(r'data\pos.db'); d=sqlite3.connect(r'!BACKUP!'); s.backup(d); n=d.execute('select count(*) from sqlite_master where type=\"table\"').fetchone()[0]; d.close(); s.close(); sys.exit(0 if n>5 else 1)"
if !errorlevel! neq 0 (
    echo [LOI] Sao luu that bai - DUNG LAI, khong cap nhat.
    call :write_status FAILED_BACKUP "Sao luu DB that bai"
    start "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    %PAUSE% & exit /b 1
)
```

3e. Cuối file (sau `pause` cuối, giờ là `%PAUSE%`) thêm `exit /b 0` rồi label:

```bat
:write_status
(
    echo result=%~1
    echo message=%~2
    echo old=!OLD!
    echo new=!NEW!
    echo backup=!BACKUP!
    echo at=!STAMP!
) > "%ROOT%\logs\update_status.txt"
del "%ROOT%\logs\update.lock" >nul 2>&1
exit /b 0
```

- [ ] **Step 4: Chạy test, xác nhận PASS** (toàn bộ `tests/test_deploy_scripts.py`, paste output)
- [ ] **Step 5: Commit** — `fix(deploy): CAP_NHAT /auto mode, stop server before WAL-safe backup`

---

### Task 2: `deploy/CAP_NHAT.bat` — Rollback

**Files:**
- Modify: `deploy/CAP_NHAT.bat` (khối 3/5 pull, 4/5 init_db, 5/5 ping)
- Test: `tests/test_deploy_scripts.py`

**Interfaces:**
- Consumes: `%PAUSE%`, `:write_status`, `!BACKUP!` từ Task 1.
- Produces: `logs\update_status.txt` với `result=` một trong `OK | NO_CHANGE | FAILED_PRECHECK | FAILED_BACKUP | FAILED_PULL | ROLLED_BACK | ROLLBACK_FAILED`.

- [ ] **Step 1: Viết test (fail)**

```python
def test_update_rolls_back_on_failure():
    """Bản mới hỏng (init_db lỗi / server không lên) → quay về commit cũ + DB cũ.
    Thiếu cái này, anh cập nhật từ xa mà bản mới crash là mất luôn đường vào."""
    src = _read("CAP_NHAT.bat")
    assert "rev-parse HEAD" in src, "Phải nhớ commit cũ TRƯỚC khi pull"
    assert "reset --hard !OLD!" in src, "Rollback phải về đúng commit cũ"
    rb = src[src.find(":rollback"):]
    assert ":rollback" in src and ".backup(" in rb, "Rollback phải khôi phục DB từ bản backup"
    assert "pos.db-wal" in rb, "Phải xóa pos.db-wal cũ trước khi khôi phục DB"
    i_init = src.find("database.init_db()")
    i_ping = src.find("/api/ping", i_init)
    assert "goto rollback" in src[i_init:i_init + 400], "init_db lỗi phải rollback"
    assert "goto rollback" in src[i_ping:i_ping + 900], "Server không lên phải rollback"
    for r in ("ROLLED_BACK", "ROLLBACK_FAILED", "FAILED_PULL", "NO_CHANGE"):
        assert r in src, f"Thiếu trạng thái {r}"
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Sửa script**

3a. Ngay trước `REM --- 3/5 Tai code moi ---`:

```bat
for /f %%h in ('"%GIT%" rev-parse HEAD') do set "OLD=%%h"
```

3b. Trong khối `if !RC! neq 0 (` sau pull (dòng ~113): trước `start "" wscript.exe` thêm `call :write_status FAILED_PULL "Khong tai duoc ban cap nhat"`. (Pull lỗi = code chưa đổi, chỉ cần chạy lại bản cũ, **không** rollback.)

3c. Sau `echo       OK` của pull:

```bat
for /f %%h in ('"%GIT%" rev-parse HEAD') do set "NEW=%%h"
if "!NEW!"=="!OLD!" (
    echo       Da la ban moi nhat.
    start "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    call :write_status NO_CHANGE "Khong co ban moi"
    %PAUSE% & exit /b 0
)
```

3d. Khối `init_db` lỗi (dòng 141-147) thay bằng:

```bat
if !errorlevel! neq 0 (
    set "REASON=Nang cap co so du lieu that bai"
    goto rollback
)
```

3e. Khối ping (dòng 157-167): nới vòng lặp lên **45 giây** (`$i -lt 45`), và thay khối `if defined READY ... else ...` cuối:

```bat
if not defined READY (
    set "REASON=Server ban moi khong khoi dong duoc"
    goto rollback
)
call :write_status OK "Cap nhat thanh cong"
echo   CAP NHAT XONG - SERVER DANG CHAY
%PAUSE%
exit /b 0
```

3f. Label rollback (đặt trước `:write_status`):

```bat
:rollback
echo.
echo [ROLLBACK] !REASON! - dang quay ve ban cu !OLD!...
powershell -NoProfile -Command "foreach ($p in 8998,8999) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Seconds 3"
"%GIT%" reset --hard !OLD!
del /q "data\pos.db-wal" "data\pos.db-shm" >nul 2>&1
"%VPY%" -c "import sqlite3; s=sqlite3.connect(r'!BACKUP!'); d=sqlite3.connect(r'data\pos.db'); s.backup(d); d.close(); s.close()"
"%VPY%" -m pip install -r requirements.txt -q
start "" wscript.exe "%ROOT%\deploy\start_server.vbs"
powershell -NoProfile -Command "for ($i=0; $i -lt 45; $i++) { foreach ($p in 8998,8999) { try { $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $p + '/api/ping') -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } } catch {} }; Start-Sleep -Seconds 1 }; exit 1"
if !errorlevel! equ 0 (
    call :write_status ROLLED_BACK "!REASON! - da quay ve ban cu"
    echo   DA QUAY VE BAN CU - du lieu giu nguyen.
) else (
    call :write_status ROLLBACK_FAILED "!REASON! - ban cu cung khong len, can truy cap may qua Tailscale"
    echo   [LOI] Ban cu cung khong len. Goi nguoi quan tri.
)
%PAUSE%
exit /b 1
```

> Vì sao khôi phục DB an toàn: server tắt suốt quá trình cập nhật → giữa lúc backup và rollback không có giao dịch bán nào.

- [ ] **Step 4: Chạy test, xác nhận PASS** (toàn bộ `tests/test_deploy_scripts.py` + `tests/test_git_hygiene.py`)
- [ ] **Step 5: Commit** — `feat(deploy): auto-rollback code + DB when update fails`

---

### Task 3: Endpoint — spawn tách rời, lock, status

**Files:**
- Modify: `server.py:240-260` (nhánh Windows của `apply_system_update`)
- Create: endpoint `GET /api/system/update-status` ngay sau `apply_system_update`
- Test: `tests/test_remote_update.py`

**Interfaces:**
- Consumes: `deploy\CAP_NHAT.bat /auto`, `logs\update_status.txt`, `logs\update.lock` (Task 1-2).
- Produces:
  - `POST /api/system/apply-update` → `{"success": true, "mode": "windows_batch", "message": ...}` | 409 khi đang cập nhật.
  - `GET /api/system/update-status` → `{"in_progress": bool, "last": {"result","message","old","new","backup","at"} | null, "log_tail": str}`.

- [ ] **Step 1: Viết test (fail)** — `tests/test_remote_update.py`:

```python
"""Cập nhật từ xa: nút web → deploy\\CAP_NHAT.bat /auto chạy tách rời."""
import sys
import pytest
from fastapi.testclient import TestClient
import server
from server import app
from tests.auth_helpers import owner_auth_headers, staff_auth_headers

client = TestClient(app)
pytestmark = pytest.mark.skipif(not sys.platform.startswith("win"), reason="nhánh Windows")


@pytest.fixture
def upd_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "UPDATE_DIR", tmp_path)
    return tmp_path


def test_apply_update_spawns_deploy_bat_auto(upd_dir, monkeypatch):
    calls = []
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: calls.append((a, k)))
    r = client.post("/api/system/apply-update", headers=owner_auth_headers())
    assert r.status_code == 200, r.text
    args = calls[0][0][0]
    assert args[-1] == "/auto"
    assert args[-2].endswith("deploy\\CAP_NHAT.bat"), "Phải gọi bản deploy (có rollback), không phải bản gốc"
    assert calls[0][1]["creationflags"] & server.subprocess.DETACHED_PROCESS, \
        "Phải tách rời — script tắt server, không được chết theo"
    assert (upd_dir / "update.lock").exists()


def test_apply_update_rejects_while_running(upd_dir, monkeypatch):
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: None)
    (upd_dir / "update.lock").write_text("x")
    r = client.post("/api/system/apply-update", headers=owner_auth_headers())
    assert r.status_code == 409


def test_apply_update_requires_owner(upd_dir, monkeypatch):
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: pytest.fail("không được chạy"))
    r = client.post("/api/system/apply-update", headers=staff_auth_headers("cashier"))
    assert r.status_code == 403


def test_update_status_reads_result(upd_dir):
    (upd_dir / "update_status.txt").write_text(
        "result=ROLLED_BACK\nmessage=Server ban moi khong khoi dong duoc\nold=aaa\nnew=bbb\nbackup=x.db\nat=20261017_220000\n")
    (upd_dir / "update_20261017_220000.log").write_text("dong 1\n[ROLLBACK] abc\n")
    r = client.get("/api/system/update-status", headers=owner_auth_headers())
    assert r.status_code == 200
    d = r.json()
    assert d["in_progress"] is False
    assert d["last"]["result"] == "ROLLED_BACK"
    assert "[ROLLBACK]" in d["log_tail"]


def test_update_status_empty(upd_dir):
    d = client.get("/api/system/update-status", headers=owner_auth_headers()).json()
    assert d == {"in_progress": False, "last": None, "log_tail": ""}
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests/test_remote_update.py
```

- [ ] **Step 3: Sửa `server.py`**

3a. Thêm `import subprocess` và `import time` vào khối import đầu `server.py` (dòng 1-5; test monkeypatch `server.subprocess`); xóa `import subprocess` / `import sys` cục bộ trong `apply_system_update`. Thêm hằng gần endpoint:

```python
from version_helper import ROOT as APP_ROOT
UPDATE_DIR = APP_ROOT / "logs"
_UPDATE_LOCK_STALE = 900  # ponytail: lock quá 15 phút coi như script chết giữa chừng
```

3b. Thay nhánh Windows (`cap_nhat_bat = root_dir / "CAP_NHAT.bat"` … `return {...}` của nhánh 1):

```python
    deploy_bat = APP_ROOT / "deploy" / "CAP_NHAT.bat"
    if deploy_bat.exists() and sys.platform.startswith("win"):
        UPDATE_DIR.mkdir(parents=True, exist_ok=True)
        lock = UPDATE_DIR / "update.lock"
        if lock.exists() and time.time() - lock.stat().st_mtime < _UPDATE_LOCK_STALE:
            raise HTTPException(status_code=409, detail="Máy chủ đang cập nhật, vui lòng đợi.")
        lock.write_text(f"{user.get('username')} {datetime.datetime.now():%Y-%m-%d %H:%M:%S}", encoding="utf-8")
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        log = open(UPDATE_DIR / f"update_{stamp}.log", "w", encoding="utf-8", errors="replace")
        base = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        kw = dict(cwd=str(APP_ROOT), stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
        args = ["cmd", "/c", str(deploy_bat), "/auto"]
        try:
            # Thoát khỏi job object của Task Scheduler để không bị giết khi server tắt
            subprocess.Popen(args, creationflags=base | subprocess.CREATE_BREAKAWAY_FROM_JOB, **kw)
        except OSError:
            try:
                subprocess.Popen(args, creationflags=base, **kw)
            except OSError as e:
                lock.unlink(missing_ok=True)
                raise HTTPException(status_code=500, detail=f"Không thể khởi chạy script cập nhật: {e}")
        return {"success": True, "mode": "windows_batch",
                "message": "Đang sao lưu và cập nhật. Máy chủ sẽ tạm ngắt 1-3 phút."}
```

> Lưu ý: test giả `Popen` trả `None` nên đường `except` không chạy trong test; `log` file handle được tiến trình con kế thừa.

3c. Endpoint mới ngay sau:

```python
@app.get("/api/system/update-status")
def system_update_status(user=Depends(require_role("owner", "admin"))):
    """Kết quả lần cập nhật cuối + đuôi log, để anh xem từ xa."""
    lock = UPDATE_DIR / "update.lock"
    in_progress = lock.exists() and time.time() - lock.stat().st_mtime < _UPDATE_LOCK_STALE
    last = None
    st = UPDATE_DIR / "update_status.txt"
    if st.exists():
        last = dict(l.split("=", 1) for l in st.read_text(encoding="utf-8", errors="replace").splitlines() if "=" in l)
    logs = sorted(UPDATE_DIR.glob("update_*.log")) if UPDATE_DIR.exists() else []
    tail = "\n".join(logs[-1].read_text(encoding="utf-8", errors="replace").splitlines()[-40:]) if logs else ""
    return {"in_progress": in_progress, "last": last, "log_tail": tail}
```

- [ ] **Step 4: Chạy test PASS** — `tests/test_remote_update.py` + `tests/test_dynamic_version.py` + `tests/test_api_requires_auth.py`
- [ ] **Step 5: Commit** — `feat(update): detached remote updater with lock and status endpoint`

---

### Task 4: Giao diện — nút chỉ hiện khi có bản mới, poll kết quả

**Files:**
- Modify: `static/js/app.js:5054-5143` (`checkServerUpdateStatus`, `triggerServerUpdate`)
- Test: `tests/test_html_integrity.py` (đã có) + kiểm tay

**Interfaces:**
- Consumes: `GET /api/system/check-update`, `POST /api/system/apply-update`, `GET /api/system/update-status`.

- [ ] **Step 1: Viết test (fail)** — thêm vào `tests/test_remote_update.py`:

```python
def test_frontend_polls_update_status():
    src = open("static/js/app.js", encoding="utf-8").read()
    body = src[src.find("async function triggerServerUpdate"):]
    body = body[:body.find("\n        }\n", body.find("catch(err)"))]
    assert "/api/system/update-status" in body, "Phải poll kết quả thay vì reload cứng"
    chk = src[src.find("async function checkServerUpdateStatus"):src.find("async function triggerServerUpdate")]
    assert "btn.classList.remove('hidden');\n\n            try" not in chk, \
        "Nút cập nhật không được luôn hiện"
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

- [ ] **Step 3: Sửa `app.js`**

3a. `checkServerUpdateStatus`: bỏ dòng 5062 (`if (btn) btn.classList.remove('hidden');`). Nhánh `data.update_available` → `btn.classList.remove('hidden')`; nhánh else và `catch` → `btn.classList.add('hidden')`. Cuối hàm gọi `showLastUpdateResult()`.

3b. Hàm mới (đặt ngay trên `triggerServerUpdate`):

```js
        const UPDATE_RESULT_TEXT = {
            OK: ['✅', 'Cập nhật thành công'],
            NO_CHANGE: ['✓', 'Đã là bản mới nhất'],
            ROLLED_BACK: ['↩️', 'Bản mới lỗi — đã TỰ QUAY VỀ bản cũ, dữ liệu giữ nguyên'],
            ROLLBACK_FAILED: ['🛑', 'Bản cũ cũng không lên — cần truy cập máy chủ qua Tailscale'],
            FAILED_PULL: ['⚠️', 'Không tải được bản mới (mạng/khóa GitHub) — vẫn chạy bản cũ'],
            FAILED_BACKUP: ['⚠️', 'Sao lưu thất bại — đã dừng, không cập nhật'],
            FAILED_PRECHECK: ['⚠️', 'Máy chủ thiếu điều kiện cập nhật'],
        };

        async function fetchUpdateStatus() {
            const headers = {};
            if (typeof Auth !== 'undefined' && Auth.getToken()) headers['Authorization'] = `Bearer ${Auth.getToken()}`;
            const res = await fetch('/api/system/update-status', { headers, cache: 'no-store' });
            if (!res.ok) throw new Error('status ' + res.status);
            return res.json();
        }

        async function showLastUpdateResult() {
            const el = document.getElementById('modal-v-last-update');
            if (!el) return;
            try {
                const d = await fetchUpdateStatus();
                if (!d.last) { el.textContent = ''; return; }
                const [icon, text] = UPDATE_RESULT_TEXT[d.last.result] || ['•', d.last.result];
                el.textContent = `${icon} Lần cập nhật cuối (${d.last.at || ''}): ${text}`;
                el.title = d.log_tail || '';
            } catch (e) { el.textContent = ''; }
        }
```

3c. `triggerServerUpdate`: thay khối từ `alert(\`🚀 ${data.message}...` đến hết `setInterval(...)` bằng:

```js
                if (msg) msg.innerHTML = '<span class="text-amber-800 font-bold animate-pulse">Máy chủ đang cập nhật (1-3 phút), trang sẽ tự báo kết quả...</span>';
                const started = Date.now();
                await new Promise(r => setTimeout(r, 5000));
                while (Date.now() - started < 6 * 60 * 1000) {
                    try {
                        const d = await fetchUpdateStatus();
                        if (!d.in_progress && d.last) {
                            const [icon, text] = UPDATE_RESULT_TEXT[d.last.result] || ['•', d.last.result];
                            alert(`${icon} ${text}\n${d.last.message || ''}`);
                            window.location.reload();
                            return;
                        }
                    } catch (e) { /* server đang tắt — đợi tiếp */ }
                    await new Promise(r => setTimeout(r, 3000));
                }
                alert('Quá 6 phút chưa thấy máy chủ phản hồi. Kiểm tra máy chủ qua Tailscale.');
                if (btn) btn.disabled = false;
```

3d. `templates/index.html`: ngay dưới `<div id="modal-v-update-banner" ...>` (dòng ~12119) thêm:

```html
<div id="modal-v-last-update" class="px-4 py-1.5 text-[11px] text-slate-600 bg-white border-b border-slate-100 cursor-help"></div>
```

- [ ] **Step 4: Chạy test PASS** — `tests/test_remote_update.py tests/test_html_integrity.py`, + `node -c static/js/app.js` nếu có node.
- [ ] **Step 5: Commit** — `feat(update-ui): show update button only when needed, poll and report result`

---

### Task 5: Rebuild exe + chạy full suite

- [ ] **Step 1:** `.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider` → paste dòng tổng kết (mốc hiện tại: 637 passed, 10 skipped).
- [ ] **Step 2:** `.venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec --clean -y` → `cp dist/POS_Mastercare.exe POS_Mastercare.exe`.
- [ ] **Step 3:** Commit exe. **Chưa push** — chờ Task 6.

> Vì sao cần exe: máy tiệm đang có code cũ. Lần cập nhật **đầu tiên** sẽ đi qua nút cũ → `CAP_NHAT.bat` gốc → `CHAY_POS.bat` → ưu tiên chạy `POS_Mastercare.exe`. Exe cũ = endpoint cũ. Từ lần thứ 2 trở đi mới đi luồng mới (`start_server.vbs` → Python source).

---

### Task 6: E2E thật — không tin test tĩnh

**Files:** Create `tests/manual/e2e_remote_update.md` (ghi lại lệnh + kết quả).

**Điều kiện:** tắt POS dev trên máy anh trước (script sẽ kill cổng 8998/8999).

- [ ] **Step 1: Dựng "GitHub giả" + "máy tiệm giả"**

```powershell
$T = "$env:LOCALAPPDATA\hermes\cache\scratch\e2e_upd"; Remove-Item $T -Recurse -Force -EA 0; mkdir $T
git clone --bare D:\Projects_Hermes\pos-offline-petcare2 "$T\gh.git"
git clone "$T\gh.git" "$T\shop"; git clone "$T\gh.git" "$T\dev"
cmd /c mklink /J "$T\shop\.venv" D:\Projects_Hermes\pos-offline-petcare2\.venv
mkdir "$T\shop\data"; Copy-Item D:\Projects_Hermes\pos-offline-petcare2\data\pos.db "$T\shop\data\"
# mốc dữ liệu
& "$T\shop\.venv\Scripts\python.exe" -c "import sqlite3; c=sqlite3.connect(r'$T\shop\data\pos.db'); c.execute(""INSERT INTO contacts(type,name,phone) VALUES('customer','MOC_E2E_UPDATE','0')""); c.commit()"
```

- [ ] **Step 2: Ca rollback do `init_db` lỗi** — trong `dev`: thêm `raise RuntimeError("e2e")` đầu `init_db()`, commit, `git push`. Chạy:
  `cmd /c "$T\shop\deploy\CAP_NHAT.bat" /auto`
  Kỳ vọng: `logs\update_status.txt` `result=ROLLED_BACK`; `git -C shop rev-parse HEAD` == commit cũ; mốc `MOC_E2E_UPDATE` còn; `COUNT(*)` từng bảng == bản backup (**không so md5**); `/api/ping` 200.
- [ ] **Step 3: Ca rollback do server không lên** — `dev`: revert, thêm `raise` ở đầu `server.py` sau import, push. Kỳ vọng như Step 2.
- [ ] **Step 4: Ca pull lỗi** — sửa tay 1 file tracked trong `shop` để `pull --ff-only` bị chặn. Kỳ vọng `FAILED_PULL`, server cũ chạy lại, mốc còn. Hoàn tác sửa tay.
- [ ] **Step 5: Ca thành công** — `dev`: revert lỗi, commit nhỏ hợp lệ, push. Kỳ vọng `result=OK`, HEAD == mới.
- [ ] **Step 6: Ca qua nút web thật (rủi ro chính: tiến trình con chết theo server)** — chạy shop server bằng `wscript deploy\start_server.vbs`, đăng nhập owner, push 1 commit hợp lệ, `POST /api/system/apply-update`, poll `GET /api/system/update-status` tới `in_progress=false`. Kỳ vọng `result=OK`. Nếu script chết giữa chừng (lock còn, status không đổi) → chuyển phương án: tạo Scheduled Task riêng `POS PET OEM Update` lúc cài, endpoint gọi `schtasks /run`.
- [ ] **Step 7: Dọn** — xóa `$T`, khởi động lại POS dev.
- [ ] **Step 8:** Ghi output từng ca vào `tests/manual/e2e_remote_update.md`, commit, **push**.

---

### Task 7: Triển khai lên máy tiệm (anh Phú)

1. **Lần đầu (một lần duy nhất):** mở link Funnel → popup phiên bản → **⚡ Cập Nhật Ngay** (nút cũ, chạy luồng cũ). Đợi ~2 phút, `Ctrl+F5`.
   Dự phòng nếu không lên: Tailscale vào máy → bấm icon **CẬP NHẬT POS** trên Desktop.
2. **Từ lần thứ 2:** bấm nút → đợi trang tự báo `✅ / ↩️ / 🛑`. Rê chuột vào dòng "Lần cập nhật cuối" xem log.
3. Gặp `🛑 ROLLBACK_FAILED` → vào máy qua Tailscale; backup nằm ở `data\backups\pos_truoc_capnhat_*.db`.

---

## Self-Review

- **Coverage:** bấm từ xa (T3-T4) ✓ · rollback code + DB (T2) ✓ · không treo `pause` (T1) ✓ · chống bấm 2 lần (T3 lock) ✓ · xem kết quả từ xa (T3 status, T4 UI) ✓ · bỏ import sheets (T3 chuyển sang `deploy\CAP_NHAT.bat`, không gọi script đó) ✓ · lần đầu triển khai (T5 exe, T7) ✓.
- **Rủi ro chưa chắc:** tiến trình con có sống sót khi server bị kill trong job của Task Scheduler — chỉ E2E T6 Step 6 trả lời được; đã ghi phương án B (`schtasks /run`).
- **Giữ nguyên hành vi:** shortcut Desktop gọi không tham số → vẫn `pause` cho người ở tiệm đọc.
