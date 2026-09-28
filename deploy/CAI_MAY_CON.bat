@echo off
chcp 65001 >nul
title CAI DAT POS PET OEM - MAY CON
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================
REM  Chay tren MAY CON (may tinh khac trong tiem).
REM  Khong can Python, khong can clone code - chi tim may chu
REM  va tao shortcut tren Desktop.
REM ============================================================

echo ==================================================
echo   KET NOI MAY NAY VOI MAY CHU POS PET OEM
echo ==================================================
echo.
echo Dang tim may chu trong mang (khoang 5-20 giay)...
echo.

set "FOUND="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0find_server.ps1" 2^>nul`) do set "FOUND=%%i"

if not defined FOUND (
    echo [KHONG TIM THAY MAY CHU]
    echo.
    echo Hay kiem tra:
    echo   1. May chu da bat va POS dang chay chua?
    echo   2. Hai may cung mot mang WiFi/LAN khong?
    echo   3. Tuong lua may chu da mo cong 8999 chua?
    echo.
    set /p "MANUAL=Nhap tay dia chi IP may chu (vd 192.168.1.50), Enter de thoat: "
    if "!MANUAL!"=="" (
        echo Da thoat.
        pause & exit /b 1
    )
    set "FOUND=http://!MANUAL!:8999"

    REM Kiem tra IP nhap tay co that su la may chu POS khong
    curl -s -m 5 "!FOUND!/api/ping" 2>nul | findstr /c:"pos-offline-petcare" >nul
    if !errorlevel! neq 0 (
        echo.
        echo [CANH BAO] Dia chi !FOUND! khong tra loi dung nhu may chu POS.
        echo            Van tao shortcut, nhung co the khong vao duoc.
        echo.
    ) else (
        echo       Xac nhan OK - dung la may chu POS.
    )
)

echo Dia chi may chu: %FOUND%
echo %FOUND%> "%~dp0server_ip.txt"

echo.
echo Dang tao shortcut tren Desktop...
powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$d = [Environment]::GetFolderPath('Desktop');" ^
  "$s = $w.CreateShortcut((Join-Path $d 'POS PET OEM.lnk'));" ^
  "$s.TargetPath = '%FOUND%'; $s.Save()"

if %errorlevel% neq 0 (
    echo [CANH BAO] Khong tao duoc shortcut.
    echo            Hay tu mo trinh duyet va vao: %FOUND%
) else (
    echo       OK
)

echo.
echo ==================================================
echo   XONG!
echo.
echo   Bam icon "POS PET OEM" tren Desktop de dung.
echo   Hoac mo trinh duyet vao: %FOUND%
echo ==================================================
echo.
echo Dang mo POS...
start "" "%FOUND%"
pause
