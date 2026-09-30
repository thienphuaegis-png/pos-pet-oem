@echo off
chcp 65001 >nul
title CẬP NHẬT POS MASTERCARE TỪ GITHUB
echo ========================================================
echo     ⚡ HỆ THỐNG CẬP NHẬT TỰ ĐỘNG QUA GITHUB
echo ========================================================
echo.

cd /d %~dp0

REM 1. Sao luu co so du lieu truoc khi cap nhat de tuyet doi an toan
echo [1/4] Dang sao luu du lieu an toan...
if not exist "data\backups" mkdir "data\backups"
for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%a"
copy /y "data\pos.db" "data\backups\pos_truoc_capnhat_%STAMP%.db" >nul
echo       -> Da sao luu: data\backups\pos_truoc_capnhat_%STAMP%.db

REM 2. Tat cac tien trinh cu tren cong 8998
echo.
echo [2/4] Dang tam dung may chu POS...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8998 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

REM 3. Keo code moi nhat tu GitHub
echo.
echo [3/4] Dang tai code moi nhat tu GitHub...
git pull github main 2>nul || git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [CANH BAO] Khong the tai code moi (kiem tra mang hoac xung dot git).
    echo Dang khoi dong lai he thong hien tai...
    start "" "CHAY_ONLINE_CO_DINH.bat"
    pause
    exit /b 1
)

REM 4. Nang cap Schema Database neu co bang moi
echo.
echo [4/4] Dang cap nhat co so du lieu va khoi dong lai...
if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe -c "import database; database.init_db()" >nul 2>&1
)

REM 5. Khoi dong lai POS Online
echo.
echo ========================================================
echo   ✅ CAP NHAT HOAN TAT! DANG KHOI DONG LAI MAY CHU...
echo ========================================================
start "" "CHAY_ONLINE_CO_DINH.bat"
timeout /t 3 >nul
exit
