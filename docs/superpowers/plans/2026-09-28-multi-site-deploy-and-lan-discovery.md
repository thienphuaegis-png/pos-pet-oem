# Triển khai nhiều tiệm + Tên miền LAN + Tự cập nhật — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Đóng gói `pos-offline-petcare2` thành bộ triển khai 3 file .bat cho tiệm ở xa — máy chủ nội bộ tự chạy, máy con tự tìm server, code cập nhật qua GitHub private repo mà không bao giờ đè DB của tiệm.

**Architecture:** GitHub private repo chứa **chỉ code**. Máy chủ tiệm clone về `C:\POS-PetCare`, `data\pos.db` nằm ngoài git nên bất khả xâm phạm. Máy con Windows quét subnet tìm endpoint `/api/ping` mới; điện thoại dùng QR chứa IP tĩnh. Tailscale cho anh Phú remote vào.

**Tech Stack:** Python 3.11 + FastAPI/uvicorn (đã có), PowerShell 5.1 (có sẵn mọi Windows 10/11, máy con không cần Python), `qrcode[pil]` (dependency mới duy nhất), Task Scheduler, netsh advfirewall, Tailscale.

**Design doc:** `docs/superpowers/specs/2026-09-28-multi-site-deploy-and-lan-discovery-design.md`

## Global Constraints

- **KHÔNG BAO GIỜ** để `data/pos.db`, `logs/`, `.env`, `__pycache__/`, `cloudflared.exe` vào git. Task 1 là gate cho mọi task sau.
- Toàn bộ .bat dùng `chcp 65001` + comment tiếng Việt có dấu; **echo ra màn hình cho người dùng thì KHÔNG dấu** (console cp437 vỡ chữ). Đây là lý do `setup_autostart.bat` hiện tại viết "Khong tim thay".
- Mọi .bat phải `cd /d "%~dp0.."` (deploy/ nằm dưới repo root) và exit code khác 0 khi lỗi.
- Test theo pattern hiện có: assert thuần + block `if __name__ == "__main__"` in ✓, **không pytest fixture, không framework mới**.
- Path native Windows forward-slash khi gọi từ bash: `C:/POS-PetCare`, không `/c/POS-PetCare`.
- Không thêm dependency nào ngoài `qrcode[pil]`.
- `CAP_NHAT.bat` backup DB **trước** khi pull, luôn luôn, không có cờ tắt.
- **KHÔNG gọi `winget` trần trong .bat.** Đã verify trên máy anh Phú: `winget` không nằm trong PATH của shell non-interactive dù đã cài — nó là app-execution-alias ở `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe`. Dùng full path + fallback tải installer tay. Áp dụng cho Task 5 (Python) và Task 8 (Tailscale).

## File Structure

| File | Responsibility |
|---|---|
| `.gitignore` | Modify — thêm `cloudflared.exe`, `data/backups/`, `*.png` logo giữ lại |
| `server.py:162` (trước `/favicon.ico`) | Modify — thêm `GET /api/ping` trả JSON nhận diện |
| `tests/test_ping_endpoint.py` | Create — test `/api/ping` trả đúng schema |
| `deploy/find_server.ps1` | Create — quét subnet, trả IP server đầu tiên tìm được |
| `deploy/make_qr.py` | Create — sinh `deploy/QR_POS.png` từ IP LAN hiện tại |
| `tests/test_make_qr.py` | Create — test sinh QR + detect IP |
| `deploy/CAI_DAT_MAY_CHU.bat` | Create — cài 1 lần trên máy chủ tiệm |
| `deploy/CAP_NHAT.bat` | Create — backup + pull + restart |
| `deploy/CAI_MAY_CON.bat` | Create — máy tính khác: quét, lưu IP, shortcut |
| `deploy/start_server.vbs` | Create — chạy uvicorn ẩn cửa sổ (Task Scheduler gọi) |
| `deploy/HUONG_DAN.md` | Create — hướng dẫn cho người ở tiệm |
| `requirements.txt` | Modify — thêm `qrcode[pil]` |

---

### Task 1: Dọn git — gỡ file không được phép track

**Files:**
- Modify: `.gitignore`
- Test: `tests/test_git_hygiene.py` (Create)

**Interfaces:**
- Produces: repo state mà `git ls-files` không chứa db/exe/log/pyc — mọi task sau phụ thuộc điều này.

**Vì sao đây là task đầu:** `.gitignore` đã có `data/*.db` nhưng DB được commit **trước** dòng đó nên git vẫn track. Pull về máy tiệm sẽ ghi đè DB thật. Không sửa cái này thì toàn bộ thiết kế mất dữ liệu khách.

- [ ] **Step 1: Write the failing test** — `tests/test_git_hygiene.py`:
```python
import subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FORBIDDEN_EXT = (".db", ".pyc", ".log", ".exe", ".db-wal", ".db-shm")
FORBIDDEN_DIR = ("logs/", "__pycache__/", "data/backups/", ".venv/", "dist/", "build/")

def _tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]

def test_no_forbidden_extensions():
    bad = [f for f in _tracked() if f.lower().endswith(FORBIDDEN_EXT)]
    assert not bad, f"Git đang track file không được phép: {bad}"

def test_no_forbidden_dirs():
    bad = [f for f in _tracked() if any(d in f.replace("\\", "/") for d in FORBIDDEN_DIR)]
    assert not bad, f"Git đang track thư mục không được phép: {bad}"

def test_env_not_tracked():
    assert ".env" not in _tracked(), ".env chứa JWT secret, không được commit"

def test_gitignore_covers_them():
    with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
        ig = f.read()
    for pat in ("data/*.db", "logs/", "__pycache__/", "cloudflared.exe",
                "data/backups/", ".env", ".venv/"):
        assert pat in ig, f".gitignore thiếu: {pat}"

if __name__ == "__main__":
    test_no_forbidden_extensions(); print("✓ không track db/pyc/log/exe")
    test_no_forbidden_dirs();       print("✓ không track logs/pycache/backups")
    test_env_not_tracked();         print("✓ .env an toàn")
    test_gitignore_covers_them();   print("✓ .gitignore đầy đủ")
    print("\nALL PASS ✅")
```

- [ ] **Step 2: Run test to verify it fails** — `python tests/test_git_hygiene.py`. Phải fail ở `test_no_forbidden_extensions` (liệt kê `data/pos.db`, `cloudflared.exe`, các `.pyc`, `logs/*.log`).

- [ ] **Step 3: Thêm vào `.gitignore`** (giữ nguyên dòng cũ, append):
```
cloudflared.exe
data/backups/
.venv/
*.db-wal
*.db-shm
deploy/QR_POS.png
deploy/server_ip.txt
```

- [ ] **Step 4: Untrack (giữ file trên đĩa, chỉ gỡ khỏi git index)**:
```bash
cd /d/Projects_Hermes/pos-offline-petcare2
git rm -r --cached data/pos.db pos.db cloudflared.exe logs __pycache__ routers/__pycache__ data/backups 2>/dev/null
git ls-files | grep -E '\.pyc$' | xargs -r git rm --cached
```
⚠️ **`--cached` là bắt buộc.** Thiếu nó là xóa thật file DB của anh.

- [ ] **Step 5: Run test to verify it passes** — `python tests/test_git_hygiene.py` → ALL PASS.

- [ ] **Step 6: Verify DB còn nguyên trên đĩa** — `ls -la data/pos.db` phải còn, size không đổi. Đây là kiểm tra an toàn không thể bỏ.

- [ ] **Step 7: Commit** — `chore(deploy): untrack db/exe/logs khỏi git, chuẩn bị phân phát nhiều tiệm`

---

### Task 2: Endpoint `/api/ping` để máy con nhận diện server

**Files:**
- Modify: `server.py` — chèn trước `@app.get("/favicon.ico")` ở dòng 162
- Test: `tests/test_ping_endpoint.py` (Create)

**Interfaces:**
- Produces: `GET /api/ping` → `200 {"app": "pos-offline-petcare", "version": str, "hostname": str}` — Task 4 (`find_server.ps1`) và Task 6 (`CAI_MAY_CON.bat`) tiêu thụ.
- **Không yêu cầu auth.** Chỉ trả tên app + hostname, không có dữ liệu kinh doanh. Cần thế để máy con dò được trước khi đăng nhập.

- [ ] **Step 1: Write the failing test** — `tests/test_ping_endpoint.py`:
```python
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_ping_returns_200():
    r = client.get("/api/ping")
    assert r.status_code == 200, f"Mong 200, nhận {r.status_code}"

def test_ping_app_identifier():
    data = client.get("/api/ping").json()
    assert data.get("app") == "pos-offline-petcare", \
        f"Máy con dựa vào field 'app' để nhận diện, nhận: {data.get('app')}"

def test_ping_has_hostname_and_version():
    data = client.get("/api/ping").json()
    assert data.get("hostname"), "Thiếu hostname"
    assert data.get("version"), "Thiếu version"

def test_ping_no_auth_required():
    # Không gửi cookie/token nào mà vẫn phải 200
    r = client.get("/api/ping", headers={})
    assert r.status_code == 200, "Ping phải mở, máy con dò trước khi login"

if __name__ == "__main__":
    test_ping_returns_200();            print("✓ ping 200")
    test_ping_app_identifier();         print("✓ app identifier đúng")
    test_ping_has_hostname_and_version(); print("✓ có hostname + version")
    test_ping_no_auth_required();       print("✓ không cần auth")
    print("\nALL PASS ✅")
```

- [ ] **Step 2: Run test to verify it fails** — `python tests/test_ping_endpoint.py` → fail 404 ở test đầu.

- [ ] **Step 3: Thêm endpoint** vào `server.py` ngay trước dòng 162 (`@app.get("/favicon.ico")`):
```python
APP_VERSION = "2.9"  # đồng bộ với PROJECT_STATE.md

@app.get("/api/ping", include_in_schema=False)
def ping():
    """Máy con quét LAN gọi endpoint này để nhận diện đúng máy chủ POS.
    Cố ý không yêu cầu auth: chỉ trả tên app + hostname, không có dữ liệu kinh doanh."""
    import socket
    return {"app": "pos-offline-petcare", "version": APP_VERSION,
            "hostname": socket.gethostname()}
```

- [ ] **Step 4: Run test to verify it passes** — ALL PASS. Nếu `TestClient` thiếu → `pip install httpx` (đã có trong requirements: `httpx==0.28.1`).

- [ ] **Step 5: Commit** — `feat(server): thêm GET /api/ping cho máy con dò server trong LAN`

---

### Task 3: Sinh QR code cho điện thoại

**Files:**
- Create: `deploy/make_qr.py`
- Modify: `requirements.txt` — thêm `qrcode[pil]==8.2`
- Test: `tests/test_make_qr.py` (Create)

**Interfaces:**
- Produces: `detect_lan_ip() → str` và `make_qr(url, out_path) → str`; `CAI_DAT_MAY_CHU.bat` (Task 5) gọi `python deploy/make_qr.py`.
- Vì sao cần: Android Chrome không resolve `.local`, nên điện thoại phải dùng IP. Bắt nhân viên nhớ `192.168.1.50:8999` là không thực tế → QR dán quầy.

- [ ] **Step 1: Write the failing test** — `tests/test_make_qr.py`:
```python
import sys, os, ipaddress
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deploy"))
from make_qr import detect_lan_ip, make_qr

def test_detect_lan_ip_is_valid_private():
    ip = detect_lan_ip()
    addr = ipaddress.ip_address(ip)
    assert addr.is_private, f"IP phải thuộc mạng nội bộ, nhận {ip}"
    assert not addr.is_loopback, "Không được trả 127.0.0.1 — máy con không vào được"

def test_make_qr_creates_png(tmp_path=None):
    import tempfile
    out = os.path.join(tempfile.gettempdir(), "test_qr_pos.png")
    if os.path.exists(out): os.remove(out)
    result = make_qr("http://192.168.1.50:8999", out)
    assert os.path.exists(result), "Không sinh được file QR"
    assert os.path.getsize(result) > 200, "File QR rỗng hoặc lỗi"
    with open(result, "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n", "Không phải PNG hợp lệ"
    os.remove(result)

if __name__ == "__main__":
    test_detect_lan_ip_is_valid_private(); print("✓ detect IP nội bộ OK")
    test_make_qr_creates_png();            print("✓ sinh QR PNG OK")
    print("\nALL PASS ✅")
```

- [ ] **Step 2: Run test to verify it fails** — `python tests/test_make_qr.py` → `ModuleNotFoundError: make_qr`.

- [ ] **Step 3: `pip install "qrcode[pil]"` và thêm vào `requirements.txt`**

- [ ] **Step 4: Viết `deploy/make_qr.py`**:
```python
"""Sinh QR code cho điện thoại nhân viên quét vào POS.
Chạy trên MÁY CHỦ tiệm sau khi cài. In QR ra dán ở quầy."""
import socket, sys, os

PORT = 8999

def detect_lan_ip() -> str:
    """Lấy IP LAN thật của máy này.
    Dùng UDP connect tới 8.8.8.8 — không gửi packet nào, chỉ để OS chọn
    interface mặc định. Cách hostname-lookup hay trả 127.0.0.1 nên không dùng."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def make_qr(url: str, out_path: str) -> str:
    import qrcode
    img = qrcode.make(url)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.save(out_path)
    return out_path

if __name__ == "__main__":
    ip = detect_lan_ip()
    url = f"http://{ip}:{PORT}"
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "QR_POS.png")
    make_qr(url, out)
    # Ghi IP ra file để .bat đọc lại, tránh parse stdout
    with open(os.path.join(os.path.dirname(out), "server_ip.txt"), "w") as f:
        f.write(ip)
    print(f"DIA CHI POS: {url}")
    print(f"QR da luu: {out}")
```

- [ ] **Step 5: Run test to verify it passes** — ALL PASS.

- [ ] **Step 6: Verify thật** — `python deploy/make_qr.py`, mở `deploy/QR_POS.png`, **quét bằng điện thoại thật** xem có ra đúng URL không. Không được chỉ tin test.

- [ ] **Step 7: Commit** — `feat(deploy): sinh QR code truy cập POS cho điện thoại nhân viên`

---

### Task 4: Script quét LAN tìm máy chủ (PowerShell)

**Files:**
- Create: `deploy/find_server.ps1`

**Interfaces:**
- Consumes: `GET /api/ping` từ Task 2.
- Produces: in ra stdout đúng 1 dòng `http://<ip>:8999` nếu tìm thấy, exit 0; không thấy thì exit 1. Task 6 (`CAI_MAY_CON.bat`) tiêu thụ.
- **Dùng PowerShell chứ không Python** vì máy con không cài Python. PowerShell 5.1 có sẵn mọi Windows 10/11.

- [ ] **Step 1: Viết `deploy/find_server.ps1`** — điểm quan trọng đã verify thật trên máy anh Phú:
  - **Lấy IP theo route mặc định**, KHÔNG lấy card đầu tiên. Máy anh có WSL nên `Get-NetIPAddress | Select -First 1` trả `172.29.0.1` (card ảo) → quét sai subnet, không bao giờ thấy server. Lấy theo `Get-NetRoute -DestinationPrefix "0.0.0.0/0"` mới ra `192.168.2.8` đúng.
  - **Runspace pool 64 luồng**, KHÔNG `Start-Job`. 254 `Start-Job` = 254 process PowerShell, treo máy tiệm yếu. Runspace quét xong 3.2s.
  - **TCP probe 400ms trước HTTP**: bỏ qua ~250 IP chết gần như tức thì.
  - stdout chỉ 1 dòng URL (cho `for /f` đọc); mọi thông báo đi stderr qua `[Console]::Error.WriteLine`.

  Xem file thật tại `deploy/find_server.ps1` (đã implement + verify cả 2 đường).
```powershell
# Quét mạng nội bộ tìm máy chủ POS PetCare.
# In ra http://<ip>:8999 nếu thấy. Máy con không cần Python.
$ErrorActionPreference = "SilentlyContinue"
$port = 8999

# Lấy subnet của máy này (IPv4, không loopback, không APIPA 169.254.x)
$local = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $local) { Write-Error "Khong tim thay card mang"; exit 1 }

$prefix = ($local -split '\.')[0..2] -join '.'
Write-Host "Dang quet $prefix.1-254 ..." -ForegroundColor Cyan

# Quét song song — tuần tự 254 IP mất hàng phút, song song còn ~10 giây
$jobs = 1..254 | ForEach-Object {
    $ip = "$prefix.$_"
    Start-Job -ScriptBlock {
        param($ip, $port)
        try {
            $r = Invoke-RestMethod -Uri "http://${ip}:${port}/api/ping" -TimeoutSec 2
            if ($r.app -eq "pos-offline-petcare") { return $ip }
        } catch {}
    } -ArgumentList $ip, $port
}

$found = $jobs | Wait-Job -Timeout 25 | Receive-Job | Where-Object { $_ } | Select-Object -First 1
$jobs | Remove-Job -Force

if ($found) {
    Write-Output "http://${found}:${port}"
    exit 0
} else {
    Write-Error "Khong tim thay may chu POS trong mang. Kiem tra may chu da bat chua."
    exit 1
}
```

- [ ] **Step 2: Test thật, không mock** — Bật server ở máy anh (`python main.py`), rồi chạy:
```
powershell -ExecutionPolicy Bypass -File deploy/find_server.ps1
```
Phải in ra IP LAN thật của máy anh, **không phải** `127.0.0.1`.

- [ ] **Step 3: Test negative** — Tắt server, chạy lại → exit code 1 + thông báo lỗi tiếng Việt không dấu.

- [ ] **Step 4: Commit** — `feat(deploy): script PowerShell quét LAN tìm máy chủ POS`

---

### Task 5: Bộ cài máy chủ tiệm

**Files:**
- Create: `deploy/CAI_DAT_MAY_CHU.bat`, `deploy/start_server.vbs`

**Interfaces:**
- Consumes: `make_qr.py` (Task 3).
- Produces: máy chủ chạy sẵn, auto-start, firewall mở, 2 shortcut Desktop, `QR_POS.png`.

**Điều kiện:** phải chạy **Run as Administrator** (firewall + Task Scheduler). Script tự kiểm tra và báo nếu chưa.

- [ ] **Step 1: Viết `deploy/start_server.vbs`** — chạy uvicorn ẩn cửa sổ đen:
```vbscript
' Chay POS server an cua so. Task Scheduler goi file nay khi bat may.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run """" & root & "\.venv\Scripts\python.exe"" main.py", 0, False
```

- [ ] **Step 2: Viết `deploy/CAI_DAT_MAY_CHU.bat`** — 9 bước, mỗi bước báo rõ, lỗi thì dừng:
```bat
@echo off
chcp 65001 >nul
title CAI DAT POS PETCARE - MAY CHU
setlocal

REM Phai chay Run as Administrator: can mo firewall + tao Task Scheduler
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Hay bam chuot phai file nay va chon "Run as administrator"
    pause & exit /b 1
)

cd /d "%~dp0.."
set ROOT=%CD%
echo ==================================================
echo   CAI DAT POS PETCARE - MAY CHU NOI BO
echo   Thu muc: %ROOT%
echo ==================================================
echo.

REM --- 1/8 Kiem tra Python ---
echo [1/8] Kiem tra Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo       Chua co Python. Dang cai bang winget...
    winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [LOI] Cai Python that bai. Tai tay tai https://python.org/downloads
        echo       Nho TICK "Add Python to PATH" khi cai.
        pause & exit /b 1
    )
    echo       Da cai Python. HAY DONG CUA SO NAY VA CHAY LAI FILE.
    pause & exit /b 0
)
echo       OK

REM --- 2/8 Tao moi truong ao ---
echo [2/8] Tao moi truong ao .venv...
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if not exist ".venv\Scripts\python.exe" (
    echo [LOI] Tao .venv that bai & pause & exit /b 1
)
echo       OK

REM --- 3/8 Cai thu vien ---
echo [3/8] Cai thu vien (mat vai phut)...
".venv\Scripts\python.exe" -m pip install --upgrade pip -q
".venv\Scripts\python.exe" -m pip install -r requirements.txt -q
if %errorlevel% neq 0 ( echo [LOI] Cai thu vien that bai & pause & exit /b 1 )
echo       OK

REM --- 4/8 Tao co so du lieu trong ---
echo [4/8] Tao co so du lieu...
if exist "data\pos.db" (
    echo       Da co san du lieu - GIU NGUYEN, khong ghi de.
) else (
    ".venv\Scripts\python.exe" -c "import database; database.init_db(); print('       Da tao DB moi')"
)

REM --- 5/8 Mo firewall cho may khac trong tiem ---
echo [5/8] Mo firewall cong 8999 cho mang noi bo...
netsh advfirewall firewall delete rule name="POS PetCare" >nul 2>&1
netsh advfirewall firewall add rule name="POS PetCare" dir=in action=allow ^
    protocol=TCP localport=8999 profile=private,domain >nul
echo       OK

REM --- 6/8 Tu khoi dong khi bat may ---
echo [6/8] Dat tu khoi dong khi bat may...
schtasks /delete /tn "POS PetCare Server" /f >nul 2>&1
schtasks /create /tn "POS PetCare Server" /tr "wscript.exe \"%ROOT%\deploy\start_server.vbs\"" ^
    /sc onlogon /rl highest /f >nul
if %errorlevel% neq 0 ( echo [CANH BAO] Khong tao duoc tu khoi dong - se phai bam shortcut de chay )
echo       OK

REM --- 7/8 Sinh QR cho dien thoai ---
echo [7/8] Sinh QR code cho dien thoai...
".venv\Scripts\python.exe" deploy\make_qr.py
set /p SERVERIP=<deploy\server_ip.txt

REM --- 8/8 Tao shortcut Desktop ---
echo [8/8] Tao shortcut tren Desktop...
powershell -NoProfile -Command ^
  "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop');" ^
  "$a=$w.CreateShortcut(\"$d\POS PetCare.lnk\"); $a.TargetPath='http://%SERVERIP%:8999'; $a.Save();" ^
  "$b=$w.CreateShortcut(\"$d\CAP NHAT POS.lnk\"); $b.TargetPath='%ROOT%\deploy\CAP_NHAT.bat'; $b.WorkingDirectory='%ROOT%'; $b.Save()"
echo       OK

REM Khoi dong server ngay
start "" wscript.exe "%ROOT%\deploy\start_server.vbs"
timeout /t 4 /nobreak >nul

echo.
echo ==================================================
echo   CAI DAT XONG!
echo.
echo   May nay (may chu):  http://localhost:8999
echo   May khac trong tiem: http://%SERVERIP%:8999
echo   Dien thoai: quet QR o file deploy\QR_POS.png (in ra dan o quay)
echo.
echo   Dang nhap lan dau: admin / admin123
echo   *** DOI MAT KHAU NGAY SAU KHI DANG NHAP ***
echo ==================================================
start "" "%ROOT%\deploy\QR_POS.png"
pause
```

- [ ] **Step 3: Verify từng bước trên máy anh** — chạy thật, kiểm tra: `.venv` có, `data/pos.db` có, `netsh advfirewall firewall show rule name="POS PetCare"` thấy rule, `schtasks /query /tn "POS PetCare Server"` thấy task, 2 shortcut trên Desktop, `QR_POS.png` mở được.

- [ ] **Step 4: Verify tính idempotent** — chạy lại lần 2, phải **không** lỗi và **không** ghi đè `data/pos.db`. Ghi lại size DB trước/sau để chứng minh.

- [ ] **Step 5: Verify từ thiết bị thật** — điện thoại cùng WiFi quét QR, vào được trang login.

- [ ] **Step 6: Commit** — `feat(deploy): bo cai dat mot buoc cho may chu tiem`

---

### Task 6: Bộ cài máy con

**Files:**
- Create: `deploy/CAI_MAY_CON.bat`

**Interfaces:**
- Consumes: `find_server.ps1` (Task 4).
- Produces: shortcut `POS PetCare.lnk` trên Desktop máy con trỏ đúng IP server.
- **Máy con không cần Python, không cần clone repo.** Chỉ là shortcut tới browser.

- [ ] **Step 1: Viết `deploy/CAI_MAY_CON.bat`**:
```bat
@echo off
chcp 65001 >nul
title CAI DAT POS PETCARE - MAY CON
setlocal
cd /d "%~dp0"

echo ==================================================
echo   KET NOI MAY NAY VOI MAY CHU POS PETCARE
echo ==================================================
echo.
echo Dang tim may chu trong mang (khoang 15-25 giay)...
echo.

for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0find_server.ps1" 2^>nul') do set FOUND=%%i

if not defined FOUND (
    echo [KHONG TIM THAY] Kiem tra:
    echo   1. May chu da bat va POS dang chay chua?
    echo   2. Hai may cung mot mang WiFi/LAN khong?
    echo.
    set /p MANUAL=Nhap tay dia chi IP may chu (vi du 192.168.1.50), hoac Enter de thoat: 
    if "%MANUAL%"=="" exit /b 1
    set FOUND=http://%MANUAL%:8999
)

echo Da tim thay: %FOUND%
echo %FOUND% > "%~dp0server_ip.txt"

powershell -NoProfile -Command ^
  "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop');" ^
  "$s=$w.CreateShortcut(\"$d\POS PetCare.lnk\"); $s.TargetPath='%FOUND%'; $s.Save()"

echo.
echo ==================================================
echo   XONG! Bam icon "POS PetCare" tren Desktop de dung.
echo   Dia chi: %FOUND%
echo ==================================================
start "" "%FOUND%"
pause
```

- [ ] **Step 2: Verify trên máy thứ hai thật** (hoặc máy ảo cùng LAN) — chạy, phải tìm được server, shortcut mở đúng trang.

- [ ] **Step 3: Verify đường thoát thủ công** — tắt server, chạy lại, nhập IP tay → vẫn tạo được shortcut.

- [ ] **Step 4: Commit** — `feat(deploy): bo cai may con tu quet LAN tim may chu`

---

### Task 7: Script cập nhật — backup trước, pull sau

**Files:**
- Create: `deploy/CAP_NHAT.bat`
- Test: `tests/test_update_safety.py` (Create)

**Interfaces:**
- Consumes: repo sạch từ Task 1.
- Produces: code mới + DB nguyên vẹn + backup timestamp trong `data/backups/`.

**Thứ tự bắt buộc:** backup DB → pull → pip install → init_db (nâng schema) → restart. Pull lỗi thì **dừng ngay**, không restart, không làm gì thêm.

- [ ] **Step 1: Write the failing test** — `tests/test_update_safety.py` chứng minh pull không thể đè DB:
```python
import subprocess, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_db_not_in_git_so_pull_cannot_overwrite():
    """Bảo hiểm sống còn: nếu pos.db quay lại git index, pull sẽ xóa
    dữ liệu thật của tiệm. Test này canh cửa đó."""
    out = subprocess.run(["git", "ls-files", "data/"], cwd=ROOT,
                         capture_output=True, text=True).stdout
    assert "pos.db" not in out, \
        "NGUY HIEM: data/pos.db bị track lại — git pull sẽ đè DB của tiệm!"

def test_update_script_backs_up_before_pull():
    p = os.path.join(ROOT, "deploy", "CAP_NHAT.bat")
    with open(p, encoding="utf-8") as f:
        content = f.read()
    i_backup = content.find("copy")
    i_pull = content.find("git pull")
    assert i_backup != -1, "CAP_NHAT.bat không có bước backup"
    assert i_pull != -1, "CAP_NHAT.bat không có git pull"
    assert i_backup < i_pull, "Backup PHẢI nằm trước git pull"

def test_update_script_aborts_on_pull_failure():
    p = os.path.join(ROOT, "deploy", "CAP_NHAT.bat")
    with open(p, encoding="utf-8") as f:
        content = f.read()
    tail = content[content.find("git pull"):]
    assert "errorlevel" in tail, "Pull lỗi mà không kiểm tra errorlevel"

if __name__ == "__main__":
    test_db_not_in_git_so_pull_cannot_overwrite(); print("✓ DB an toàn khỏi pull")
    test_update_script_backs_up_before_pull();     print("✓ backup trước pull")
    test_update_script_aborts_on_pull_failure();   print("✓ pull lỗi thì dừng")
    print("\nALL PASS ✅")
```

- [ ] **Step 2: Run test to verify it fails** — fail vì `CAP_NHAT.bat` chưa tồn tại.

- [ ] **Step 3: Viết `deploy/CAP_NHAT.bat`**:
```bat
@echo off
chcp 65001 >nul
title CAP NHAT POS PETCARE
setlocal
cd /d "%~dp0.."

echo ==================================================
echo   CAP NHAT POS PETCARE
echo ==================================================
echo.

REM --- 1/5 Sao luu du lieu TRUOC KHI lam bat cu dieu gi ---
echo [1/5] Sao luu du lieu...
if not exist "data\backups" mkdir "data\backups"
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set STAMP=%dt:~0,8%_%dt:~8,6%
copy /y "data\pos.db" "data\backups\pos_truoc_capnhat_%STAMP%.db" >nul
if %errorlevel% neq 0 (
    echo [LOI] Sao luu that bai - DUNG LAI, khong cap nhat.
    pause & exit /b 1
)
echo       Da luu: data\backups\pos_truoc_capnhat_%STAMP%.db

REM --- 2/5 Tat server dang chay ---
echo [2/5] Tam dung server...
taskkill /f /im python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM --- 3/5 Tai code moi ---
echo [3/5] Tai ban cap nhat...
git pull --ff-only
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong tai duoc ban cap nhat.
    echo       Du lieu cua ban VAN AN TOAN, khong mat gi.
    echo       Hay goi cho nguoi quan tri he thong.
    echo       Dang khoi dong lai ban cu...
    start "" wscript.exe "%CD%\deploy\start_server.vbs"
    pause & exit /b 1
)

REM --- 4/5 Cai thu vien moi neu co + nang cap co so du lieu ---
echo [4/5] Cap nhat thu vien va co so du lieu...
".venv\Scripts\python.exe" -m pip install -r requirements.txt -q
".venv\Scripts\python.exe" -c "import database; database.init_db()"
if %errorlevel% neq 0 (
    echo [LOI] Nang cap co so du lieu that bai.
    echo       Ban sao luu o: data\backups\pos_truoc_capnhat_%STAMP%.db
    pause & exit /b 1
)

REM --- 5/5 Chay lai ---
echo [5/5] Khoi dong lai...
start "" wscript.exe "%CD%\deploy\start_server.vbs"
timeout /t 4 /nobreak >nul

echo.
echo ==================================================
echo   CAP NHAT XONG! Du lieu giu nguyen.
echo   Bam icon "POS PetCare" de tiep tuc dung.
echo ==================================================
pause
```

- [ ] **Step 4: Run test to verify it passes** — ALL PASS.

- [ ] **Step 5: Verify end-to-end thật** — tạo 1 commit nhỏ ở "repo trung tâm", chạy `CAP_NHAT.bat` ở bản clone thử, kiểm tra: code mới về, DB size/nội dung **không đổi**, file backup có, server chạy lại được.

- [ ] **Step 6: Verify đường lỗi** — làm git pull fail (sửa remote thành URL sai), chạy lại → phải dừng, in cảnh báo, và **server bản cũ vẫn chạy lại được**.

- [ ] **Step 7: Commit** — `feat(deploy): script cap nhat co backup DB truoc khi pull`

---

### Task 8: Tailscale cho anh remote vào

**Files:**
- Modify: `deploy/HUONG_DAN.md` (Task 9 tạo) — thêm mục Tailscale
- Create: `deploy/CAI_TAILSCALE.bat`

**Vì sao tách riêng:** Tailscale là **tùy chọn** cho anh Phú hỗ trợ từ xa, không bắt buộc để tiệm hoạt động. Tiệm mất internet vẫn bán hàng.

- [ ] **Step 1: Viết `deploy/CAI_TAILSCALE.bat`**:
```bat
@echo off
chcp 65001 >nul
title CAI TAILSCALE - HO TRO TU XA
echo ==================================================
echo   CAI TAILSCALE (de ky thuat vien ho tro tu xa)
echo ==================================================
echo.
echo Buoc nay KHONG bat buoc de dung POS.
echo Chi can neu muon ky thuat vien xem/sua tu xa.
echo.
pause

winget install -e --id tailscale.tailscale --accept-source-agreements --accept-package-agreements
if %errorlevel% neq 0 (
    echo [LOI] Cai that bai. Tai tay tai https://tailscale.com/download/windows
    pause & exit /b 1
)

echo.
echo Dang mo dang nhap Tailscale - dang nhap bang tai khoan ky thuat vien cung cap.
"%ProgramFiles%\Tailscale\tailscale.exe" up
echo.
echo Xong. Doc ten may nay:
"%ProgramFiles%\Tailscale\tailscale.exe" status
pause
```

- [ ] **Step 2: Verify** — cài trên 1 máy, `tailscale status` thấy máy, từ máy anh truy cập `http://<ten-may>:8999` được.

- [ ] **Step 3: Commit** — `feat(deploy): script cai Tailscale cho ho tro tu xa`

---

### Task 9: Hướng dẫn cho người ở tiệm + đưa lên GitHub

**Files:**
- Create: `deploy/HUONG_DAN.md`
- Modify: `PROJECT_STATE.md` — ghi nhận checkpoint

- [ ] **Step 1: Viết `deploy/HUONG_DAN.md`** — tiếng Việt có dấu (đọc trên máy, không qua console), không thuật ngữ kỹ thuật. Nội dung:
  - Cài lần đầu: chuột phải `CAI_DAT_MAY_CHU.bat` → Run as administrator → đợi → xong
  - Dùng hàng ngày: bật máy là tự chạy, bấm icon **POS PetCare**
  - Thêm máy tính khác: chạy `CAI_MAY_CON.bat`
  - Thêm điện thoại: quét QR ở `QR_POS.png` (in ra dán quầy)
  - Khi được nhắn cập nhật: bấm icon **CẬP NHẬT POS**
  - Mất điện / máy treo: bật lại máy là xong, dữ liệu không mất (SQLite WAL)
  - Sao lưu ở đâu: `data\backups\`
  - Đăng nhập lần đầu `admin / admin123` → **đổi ngay**

- [ ] **Step 2: Tạo GitHub private repo mới**
```bash
cd /d/Projects_Hermes/pos-offline-petcare2
git remote remove origin              # origin cũ trỏ folder local D:/Projects_Hermes/pos-offline
git remote add origin git@github.com:<user>/pos-offline-petcare2.git
git push -u origin main
```
⚠️ Cần `gh` CLI (máy chưa có: `gh: command not found`) hoặc tạo repo bằng tay trên web. Kiểm tra repo là **Private** trước khi push — code có logic giá, chiết khấu, khách hàng.

- [ ] **Step 3: Verify repo sạch** — `git count-objects -vH` phải nhỏ hơn 48MB nhiều. Trên GitHub kiểm tra **không thấy** `data/pos.db`, `cloudflared.exe`, `logs/`.

- [ ] **Step 4: Tạo deploy key read-only cho tiệm 1**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/pos_tiem1 -N "" -C "pos-tiem1-readonly"
```
Thêm public key vào GitHub repo → Settings → Deploy keys, **KHÔNG tick "Allow write access"**.

- [ ] **Step 5: Verify clone bằng deploy key** — clone thử vào thư mục tạm bằng key đó, phải được. Thử `git push` phải **bị từ chối** (chứng minh read-only thật).

- [ ] **Step 6: Cập nhật `PROJECT_STATE.md`** — thêm checkpoint theo format hiện có của dự án.

- [ ] **Step 7: Commit + push** — `docs(deploy): huong dan trien khai cho tiem + checkpoint`

---

## Self-Review

**Spec coverage:**

| Yêu cầu trong design | Task |
|---|---|
| Repo mới sạch, không DB/exe/log | 1, 9 |
| DB tiệm không bị đè khi pull | 1, 7 |
| Máy con nhận diện được server | 2, 4, 6 |
| Máy chủ auto-start, firewall, static IP | 5 |
| QR cho điện thoại Android + iOS | 3, 5 |
| Cập nhật bằng 1 cú bấm, có backup | 7 |
| Tailscale remote | 8 |
| Hướng dẫn cho người không biết kỹ thuật | 9 |
| DB trống hoàn toàn lần đầu | 5 (step 4) |
| Deploy key read-only mỗi tiệm | 9 (step 4-5) |

Không có gap.

**Placeholder scan:** Không có TBD/TODO. Mọi file có nội dung đầy đủ, mọi test có code thật, mọi bước verify nói rõ kiểm tra cái gì và kỳ vọng gì.

**Type consistency:**
- `"pos-offline-petcare"` — hằng nhận diện, xuất hiện ở `server.py` (Task 2), `test_ping_endpoint.py` (Task 2), `find_server.ps1` (Task 4). Khớp.
- Port `8999` — `main.py` (sẵn có), `make_qr.py` PORT, `find_server.ps1` `$port`, firewall rule, shortcut. Khớp.
- `detect_lan_ip() → str`, `make_qr(url, out_path) → str` — dùng nhất quán Task 3.
- `deploy/server_ip.txt` — `make_qr.py` ghi, `CAI_DAT_MAY_CHU.bat` đọc bằng `set /p`. Khớp.

**Rủi ro lớn nhất đã có bảo hiểm:** `tests/test_git_hygiene.py` + `tests/test_update_safety.py` cùng canh việc `data/pos.db` không bao giờ quay lại git index. Nếu ai đó vô tình `git add -f data/pos.db`, test fail trước khi kịp phát hành.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-28-multi-site-deploy-and-lan-discovery.md`.**

**1. Subagent-Driven (recommended)** — Fresh subagent mỗi task, review giữa các task. Phù hợp ở đây vì 9 task khá độc lập sau Task 1-2.

**2. Inline Execution** — Chạy trong session này, checkpoint theo batch.

**Chọn hướng nào?**
