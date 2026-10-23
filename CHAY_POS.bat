@echo off
setlocal EnableDelayedExpansion
title POS MASTERCARE - KHOI DONG HE THONG
cd /d "%~dp0"

echo ========================================================
echo         HE THONG BAN HANG POS MASTERCARE
echo ========================================================
echo.

echo [1/2] Kiem tra va don dep cong mang 8998, 8999...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/2] Dang khoi dong may chu POS...
set "STARTED=0"

if exist "dist\POS_Mastercare.exe" (
    copy "dist\POS_Mastercare.exe" "POS_Mastercare.exe" /y >nul 2>&1
)

if exist "POS_Mastercare.exe" (
    echo        -^> Khoi dong bang ban dong goi: POS_Mastercare.exe
    start "" "POS_Mastercare.exe"
    set "STARTED=1"
) else if exist ".venv\Scripts\python.exe" (
    echo        -^> Khoi dong bang Python ao: .venv\Scripts\python.exe
    start "" ".venv\Scripts\python.exe" main.py
    set "STARTED=1"
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        echo        -^> Khoi dong bang Python he thong
        start "" python main.py
        set "STARTED=1"
    )
)

if "!STARTED!"=="0" (
    echo.
    echo [LOI] Khong tim thay POS_Mastercare.exe hoac Python tren may!
    echo Vui long kiem tra lai hoac chay CAP_NHAT.bat de dong bo lai.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   HE THONG DA SAN SANG!
echo   Dia chi truy cap: http://localhost:8998
echo ========================================================
echo.
timeout /t 3 /nobreak >nul
