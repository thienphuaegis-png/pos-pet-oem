@echo off
chcp 65001 >nul
title TU DONG DUNG 2 BAN POS (OEM & SPA) TREN CLOUDFLARE D1
cd /d "%~dp0\.."

echo ============================================================================
echo    TU DONG TAO ^& DONG BO 2 BAN POS DOC LAP LEN CLOUDFLARE D1
echo    - Ban 1 (pos-oem-db): POS Kho + OEM + San TMDT + Hoa hong + Tinh luong
echo    - Ban 2 (pos-spa-db): POS Dich vu Spa/Hotel + Kho + Hoa hong + Tinh luong
echo ============================================================================
echo.

if "%CF_ACCOUNT_ID%"=="" (
    set /p CF_ACCOUNT_ID="1. Nhap Cloudflare Account ID cua anh: "
)
if "%CF_API_TOKEN%"=="" (
    set /p CF_API_TOKEN="2. Nhap Cloudflare API Token (quyen D1 Edit): "
)

echo.
echo Dang khoi tao 2 Database D1 va nap 85 bang + 59.011 dong du lieu...
.venv\Scripts\python.exe scripts\migrate_to_cloudflare_d1.py --setup-dual
if errorlevel 1 (
    echo.
    echo [LOI] Kiem tra lai Account ID hoac API Token Cloudflare!
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo [HOAN TAT] Da nap xong 2 Database D1 doc lap!
echo Copy 3 bien moi truong in o tren (CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN)
echo dan vao 2 Project tren Vercel (pos-oem va pos-spa) la chay ngay!
echo ============================================================================
pause
