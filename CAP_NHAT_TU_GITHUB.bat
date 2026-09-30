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
echo [2/4] Dang tam dung may chu POS va ngrok...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8998 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

REM 3. Keo code moi nhat tu GitHub
echo.
echo [3/4] Dang tai code moi nhat tu GitHub...
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist ".git" (
        git pull github main 2>nul || git pull origin main 2>nul || git pull
        if %errorlevel% equ 0 (
            echo       -> Da dong bo code thanh cong tu GitHub!
        )
    )
)

if exist "_internal\templates" (
    xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
)
if exist "_internal\static" (
    xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1
)

REM 4. Khoi dong lai POS Online
echo.
echo [4/4] Dang khoi dong lai he thong...
if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
) else if exist ".venv\Scripts\pythonw.exe" (
    start "" .venv\Scripts\pythonw.exe main.py
) else (
    start "" python main.py
)

echo.
echo ========================================================
echo   ✅ CAP NHAT HOAN TAT! DANG KHOI DONG LAI MAY CHU...
echo ========================================================
timeout /t 3 >nul
exit
