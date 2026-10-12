@echo off
chcp 65001 >nul
title CAI TAILSCALE - TRUY CAP POS TU XA (MIEN PHI)

REM Tu nang quyen Admin (can cho cai dat + mo firewall)
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "TS=C:\Program Files\Tailscale\tailscale.exe"
echo ======================================================================
echo    CAI TAILSCALE CHO MAY CHU POS (dia chi co dinh: http://pos-server:8998)
echo ======================================================================
echo.

echo [1/5] Kiem tra Tailscale...
if exist "%TS%" (
    echo    -^> Da cai san.
) else (
    echo    -^> Chua co, dang cai qua winget...
    winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
    if not exist "%TS%" (
        echo    LOI: Cai that bai. Tai tay tai https://tailscale.com/download/windows roi chay lai file nay.
        pause
        exit /b 1
    )
)

echo.
echo [2/5] Mo firewall cong 8998 - CHI cho may trong mang Tailscale (100.64.0.0/10)...
netsh advfirewall firewall delete rule name="POS 8998 Tailscale" >nul 2>&1
netsh advfirewall firewall add rule name="POS 8998 Tailscale" dir=in action=allow protocol=TCP localport=8998 remoteip=100.64.0.0/10 >nul
echo    -^> OK

echo.
echo [3/5] Dang nhap Tailscale (trinh duyet se mo - dang nhap bang Google/Microsoft)...
echo    Luu y: dung CUNG 1 tai khoan tren dien thoai/laptop.
"%TS%" up --hostname=pos-server --unattended
if %errorlevel% neq 0 (
    echo    LOI: Dang nhap that bai. Chay lai file nay.
    pause
    exit /b 1
)

echo.
echo [4/5] Bat Funnel - link HTTPS cong khai, may khac KHONG can cai Tailscale...
echo    Lan dau: neu hien link "enable Funnel", mo link do bam Enable, script tu chay tiep.
"%TS%" funnel --bg 8998
if %errorlevel% neq 0 (
    echo    LOI: Bat Funnel that bai. Chay lai file nay sau khi Enable trong trang quan tri.
    pause
    exit /b 1
)

echo.
echo [5/5] Hoan tat! Funnel tu chay lai sau khi khoi dong may.
for /f %%i in ('"%TS%" ip -4') do set "TSIP=%%i"
echo ======================================================================
echo    LINK CONG KHAI (moi trinh duyet, khong can cai gi) - dong "https://" ben duoi:
"%TS%" funnel status
echo.
echo    Mang rieng (may da cai Tailscale - nhanh nhat):
echo       http://pos-server:8998
echo       http://%TSIP%:8998
echo.
echo    CANH BAO: link cong khai ai co cung mo duoc trang dang nhap.
echo    Dat mat khau manh cho tai khoan admin/nhan vien POS.
echo    Tat link cong khai: "%TS%" funnel reset
echo    May chu phai dang chay POS (CHAY_POS.bat).
echo ======================================================================
pause
