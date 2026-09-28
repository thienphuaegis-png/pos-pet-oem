@echo off
chcp 65001 >nul
title CAI DAT POS PET OEM - MAY CHU
setlocal EnableDelayedExpansion

REM ============================================================
REM  Cai dat 1 lan tren MAY CHU cua tiem.
REM  Chay lai nhieu lan an toan: KHONG ghi de data\pos.db.
REM ============================================================

REM Phai chay Run as Administrator: can mo firewall + tao Task Scheduler
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Chua co quyen Administrator.
    echo       Hay bam CHUOT PHAI vao file nay va chon "Run as administrator".
    echo.
    pause & exit /b 1
)

cd /d "%~dp0.."
set "ROOT=%CD%"
set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"

echo ==================================================
echo   CAI DAT POS PET OEM - MAY CHU NOI BO
echo   Thu muc: %ROOT%
echo ==================================================
echo.

REM --- 1/8 Kiem tra Python ---
echo [1/8] Kiem tra Python...
set "PY="
python --version >nul 2>&1 && set "PY=python"
if not defined PY py -3.11 --version >nul 2>&1 && set "PY=py -3.11"
if not defined PY (
    echo       Chua co Python. Dang cai tu dong...
    if exist "%WINGET%" (
        "%WINGET%" install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
    ) else (
        echo [LOI] Khong co winget tren may nay.
        echo       Hay tai Python 3.11 tai https://python.org/downloads
        echo       QUAN TRONG: tick "Add Python to PATH" khi cai.
        start "" "https://www.python.org/downloads/release/python-3119/"
        pause & exit /b 1
    )
    echo.
    echo       DA CAI PYTHON. HAY DONG CUA SO NAY VA CHAY LAI FILE NAY.
    echo       (Windows can mo lai cua so moi nhan ra Python)
    pause & exit /b 0
)
echo       OK

REM --- 2/8 Tao moi truong ao ---
echo [2/8] Tao moi truong ao .venv...
if not exist ".venv\Scripts\python.exe" (
    %PY% -m venv .venv
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
set "READY="
for /l %%t in (1,1,15) do (
    if not defined READY (
        timeout /t 1 /nobreak >nul
        curl -s -m 2 http://127.0.0.1:8999/api/ping >nul 2>&1 && set "READY=1"
    )
)

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
echo ==================================================
echo.
if exist "deploy\QR_POS.png" start "" "%ROOT%\deploy\QR_POS.png"
pause
