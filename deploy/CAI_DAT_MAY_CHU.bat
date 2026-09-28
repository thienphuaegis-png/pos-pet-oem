@echo off
chcp 65001 >nul
title CAI DAT POS PET OEM - MAY CHU
setlocal EnableDelayedExpansion

REM ============================================================
REM  Cai dat 1 lan tren MAY CHU cua tiem.
REM  Chay lai nhieu lan an toan: KHONG ghi de data\pos.db.
REM ============================================================

REM Can quyen Administrator (mo firewall + tao Task Scheduler).
REM Nguoi o tiem se bam DUP CHUOT, khong biet "Run as administrator"
REM -> tu xin quyen luon, Windows hien hop thoai Yes/No.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang xin quyen quan tri...
    echo Windows se hoi "Do you want to allow..." - hay chon YES.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
    if errorlevel 1 (
        echo.
        echo   Ban da chon NO nen khong cai dat duoc.
        echo   Hay chay lai file nay va chon YES.
        echo.
        pause
    )
    exit /b 0
)

cd /d "%~dp0.."
set "ROOT=%CD%"
set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"

echo ==================================================
echo   CAI DAT POS PET OEM - MAY CHU NOI BO
echo   Thu muc: %ROOT%
echo ==================================================
echo.

REM --- 0/9 Kiem tra git va khoa cap nhat ---
REM Lam TRUOC MOI THU: neu thieu thi bao ngay, khong de cai xong 15 phut
REM roi lan cap nhat dau tien moi phat hien khong pull duoc.
echo [0/9] Kiem tra cong cu cap nhat...

set "GIT="
for %%p in (
    "%PROGRAMFILES%\Git\cmd\git.exe"
    "%PROGRAMFILES(x86)%\Git\cmd\git.exe"
    "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
) do (
    if not defined GIT if exist "%%~p" set "GIT=%%~p"
)
if not defined GIT (
    git --version >nul 2>&1 && set "GIT=git"
)

if not defined GIT (
    echo       Chua co Git. Dang cai tu dong...
    if exist "%WINGET%" (
        "%WINGET%" install -e --id Git.Git --accept-source-agreements --accept-package-agreements
        if exist "%PROGRAMFILES%\Git\cmd\git.exe" set "GIT=%PROGRAMFILES%\Git\cmd\git.exe"
    ) else (
        echo [LOI] Khong co winget. Tai Git tai https://git-scm.com/download/win
        start "" "https://git-scm.com/download/win"
        pause & exit /b 1
    )
)
if not defined GIT (
    echo [LOI] Van khong tim thay Git sau khi cai.
    echo       Hay khoi dong lai may roi chay lai file nay.
    pause & exit /b 1
)
set "GIT=%GIT:"=%"
echo       Git: OK: "%GIT%"

REM Thu muc co phai ban sao tu GitHub khong (chep tay bang USB thi khong phai)
"%GIT%" rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo       Luu y: thu muc chep tay, nut "CAP NHAT POS" se khong dung
    echo       duoc. POS van chay binh thuong. Cai dat tiep...
    set "KHONG_CAP_NHAT_DUOC=1"
) else (
    if not exist "%ROOT%\deploy\khoa_tiem" (
        echo.
        echo       Luu y: chua co khoa cap nhat, nut "CAP NHAT POS" se bao
        echo       loi. POS van chay binh thuong. Cai dat tiep...
        set "KHONG_CAP_NHAT_DUOC=1"
    ) else (
        echo       Khoa cap nhat: OK
    )
)

REM --- 1/8 Kiem tra Python ---
echo [1/8] Kiem tra Python...
REM Do nhieu duong: PATH cua session admin khac PATH cua user, nen chi thu
REM "python" la khong du. Uu tien 3.11 (ban da test), roi den bat ky 3.x.
set "PY="
for %%p in (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%PROGRAMFILES%\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%PROGRAMFILES%\Python312\python.exe"
) do (
    if not defined PY if exist %%p set "PY=%%p"
)
if not defined PY (
    py -3.11 --version >nul 2>&1 && set "PY=py -3.11"
)
if not defined PY (
    python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
    python3 --version >nul 2>&1 && set "PY=python3"
)

if not defined PY (
    echo       Chua co Python. Dang cai tu dong...
    if exist "%WINGET%" (
        "%WINGET%" install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
        REM Sau khi winget cai, dung luon duong dan tuyet doi - khong doi PATH
        if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
            set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
        )
    ) else (
        echo [LOI] Khong co winget tren may nay.
        echo       Hay tai Python 3.11 tai https://python.org/downloads
        echo       QUAN TRONG: tick "Add Python to PATH" khi cai.
        start "" "https://www.python.org/downloads/release/python-3119/"
        pause & exit /b 1
    )
)

if not defined PY (
    echo.
    echo [LOI] Van khong tim thay Python sau khi cai.
    echo       Hay DONG cua so nay va CHAY LAI file nay.
    pause & exit /b 1
)
echo       OK - dung: %PY%

REM --- 2/8 Tao moi truong ao ---
echo [2/8] Tao moi truong ao .venv...
if not exist ".venv\Scripts\python.exe" (
    REM %PY% co the la duong dan tuyet doi co space -> dung call de xu ly dung
    call %PY% -m venv .venv
)
if not exist ".venv\Scripts\python.exe" (
    echo [LOI] Tao .venv that bai.
    pause & exit /b 1
)
set "VPY=%ROOT%\.venv\Scripts\python.exe"
REM venv thieu pip (tao bang --without-pip) thi bo sung
"%VPY%" -m pip --version >nul 2>&1 || "%VPY%" -m ensurepip --upgrade >nul 2>&1
echo       OK

REM --- 3/8 Cai thu vien ---
echo [3/8] Cai thu vien (mat 2-5 phut, cho nhe)...
"%VPY%" -m pip install --upgrade pip -q
"%VPY%" -m pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [LOI] Cai thu vien that bai. Kiem tra ket noi internet.
    pause & exit /b 1
)
echo       OK

REM --- 4/8 Tao co so du lieu ---
echo [4/8] Chuan bi co so du lieu...
if exist "data\pos.db" (
    echo       DA CO DU LIEU SAN - GIU NGUYEN, khong ghi de.
) else (
    "%VPY%" -c "import database; database.init_db()"
    if !errorlevel! neq 0 (
        echo [LOI] Tao co so du lieu that bai.
        pause & exit /b 1
    )
    echo       Da tao co so du lieu moi ^(trong^)
)

REM --- 5/8 Mo firewall cho may khac trong tiem ---
echo [5/8] Mo firewall cong 8999 cho mang noi bo...
netsh advfirewall firewall delete rule name="POS PET OEM" >nul 2>&1
netsh advfirewall firewall add rule name="POS PET OEM" dir=in action=allow protocol=TCP localport=8999 profile=private,domain >nul
if %errorlevel% neq 0 (
    echo [CANH BAO] Khong mo duoc firewall - may khac co the khong vao duoc.
) else (
    echo       OK
)

REM --- 6/8 Tu khoi dong khi bat may ---
echo [6/8] Dat tu dong chay khi bat may...
schtasks /delete /tn "POS PET OEM Server" /f >nul 2>&1
schtasks /create /tn "POS PET OEM Server" /tr "wscript.exe \"%ROOT%\deploy\start_server.vbs\"" /sc onlogon /rl highest /f >nul
if %errorlevel% neq 0 (
    echo [CANH BAO] Khong dat duoc tu khoi dong.
    echo            Se phai bam shortcut "KHOI DONG POS" moi lan bat may.
) else (
    echo       OK
)

REM --- 7/8 Sinh QR cho dien thoai ---
echo [7/8] Sinh ma QR cho dien thoai...
"%VPY%" deploy\make_qr.py
if not exist "deploy\server_ip.txt" (
    echo [CANH BAO] Khong sinh duoc QR.
    set "SERVERIP=localhost"
) else (
    set /p SERVERIP=<deploy\server_ip.txt
)
echo       OK

REM --- 8/8 Tao shortcut Desktop ---
echo [8/8] Tao shortcut tren Desktop...
powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$d = [Environment]::GetFolderPath('Desktop');" ^
  "$a = $w.CreateShortcut((Join-Path $d 'POS PET OEM.lnk'));" ^
  "$a.TargetPath = 'http://%SERVERIP%:8999'; $a.Save();" ^
  "$b = $w.CreateShortcut((Join-Path $d 'CAP NHAT POS.lnk'));" ^
  "$b.TargetPath = '%ROOT%\deploy\CAP_NHAT.bat'; $b.WorkingDirectory = '%ROOT%'; $b.Save();" ^
  "$c = $w.CreateShortcut((Join-Path $d 'KHOI DONG POS.lnk'));" ^
  "$c.TargetPath = 'wscript.exe'; $c.Arguments = '\"%ROOT%\deploy\start_server.vbs\"'; $c.Save()"
echo       OK

REM Khoi dong server ngay
echo.
echo Dang khoi dong server...
start "" wscript.exe "%ROOT%\deploy\start_server.vbs"

REM Doi server len, kiem tra thuc su chay duoc
REM Cho server len, toi da 15 giay. Gom ca vong lap vao 1 lan goi PowerShell
REM cho nhanh va tranh phu thuoc "timeout" (Git Bash / stdin redirect).
set "READY="
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 15; $i++) {" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8999/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  Start-Sleep -Seconds 1 }; exit 1"
if %errorlevel% equ 0 set "READY=1"

echo.
echo ==================================================
if defined READY (
    echo   CAI DAT XONG - SERVER DANG CHAY
) else (
    echo   CAI DAT XONG nhung SERVER CHUA LEN
    echo   Thu bam shortcut "KHOI DONG POS" tren Desktop.
)
echo.
echo   May nay:              http://localhost:8999
echo   May khac trong tiem:  http://%SERVERIP%:8999
echo   Dien thoai:           quet ma QR trong file
echo                         deploy\QR_POS.png ^(in ra dan o quay^)
echo.
echo   Dang nhap lan dau:    admin / admin123
echo   *** DOI MAT KHAU NGAY SAU KHI DANG NHAP LAN DAU ***
if defined KHONG_CAP_NHAT_DUOC (
    echo.
    echo   Luu y: may nay CHUA cap nhat tu xa duoc.
    echo   Bao nguoi quan tri he thong khi can cap nhat.
)
echo ==================================================
echo.
REM Mo POS luon - nguoi dung thay ngay ket qua, khong phai tu mo
if defined READY start "" "http://localhost:8999"
if exist "deploy\QR_POS.png" start "" "%ROOT%\deploy\QR_POS.png"
pause
