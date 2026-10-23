@echo off
chcp 65001 >nul
title KHOI DONG LAI MAY CHU POS (DEV TEST)
cd /d "%~dp0"

echo ========================================================
echo   KHOI DONG LAI MAY CHU POS DE TEST LOCAL (KHONG CAN GIT)
echo ========================================================
echo.

echo [1/2] Dang tat tien trinh cu va giai phong cong 8998...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*main.py*' -or $_.Name -like '*POS_Mastercare*' } | Stop-Process -Force -ErrorAction SilentlyContinue; foreach ($p in 8998,8999) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"
powershell -NoProfile -Command "Start-Sleep -Seconds 1"

echo [2/2] Dang bat lai POS tu source code moi nhat...
if exist "deploy\start_server.vbs" (
    start "" wscript.exe "deploy\start_server.vbs"
) else (
    start "" ".venv\Scripts\python.exe" main.py
)

echo.
echo ========================================================
echo   DA KHOI DONG LAI THANH CONG!
echo   Vao trinh duyet: http://127.0.0.1:8998
echo ========================================================
timeout /t 3 >nul
