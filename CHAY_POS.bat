@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title POS MASTERCARE - KHOI DONG HE THONG
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

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

echo [2/2] Dang khoi dong ngam may chu POS va mo Trung Tam May Chu...
set "STARTED=0"

if exist ".venv\Scripts\python.exe" if exist "deploy\start_server.vbs" (
    start /d "%~dp0" "" wscript.exe "%~dp0deploy\start_server.vbs"
    powershell -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 2"
    start "" "http://127.0.0.1:8998/server-status"
    set "STARTED=1"
) else if exist ".venv\Scripts\python.exe" (
    start "" ".venv\Scripts\python.exe" launcher.py
    set "STARTED=1"
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        start "" python launcher.py
        set "STARTED=1"
    )
)

if "!STARTED!"=="0" (
    echo.
    echo [LOI] Khong tim thay Python tren may!
    echo Vui long kiem tra lai hoac chay CAP_NHAT.bat de dong bo lai.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   HE THONG DA SAN SANG (CHAY NGAM - DONG CUA SO DUOC)!
echo   Trung tam may chu: http://127.0.0.1:8998/server-status
echo ========================================================
echo.
powershell -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 2"
