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
    echo    -^> Chua co, dang cai...
    REM winget tran khong co trong PATH phien admin / may Win10 cu -> goi full path, khong co thi tai MSI.
    if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe" "%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe" install -e --id Tailscale.Tailscale --silent --accept-source-agreements --accept-package-agreements
    if not exist "%TS%" (
        echo    -^> Tai truc tiep tu tailscale.com, doi 1-2 phut...
        powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile ($env:SystemRoot+'\Temp\tailscale.msi') -UseBasicParsing"
        start "" /wait msiexec /i "%SystemRoot%\Temp\tailscale.msi" /qn /norestart
    )
    if not exist "%TS%" (
        echo    LOI: Cai that bai. Tai tay tai https://tailscale.com/download/windows roi chay lai file nay.
        pause
        exit /b 1
    )
)

echo.
echo [2/5] Mo firewall cong 8998 va 8997 - CHI cho may trong mang Tailscale (100.64.0.0/10)...
netsh advfirewall firewall delete rule name="POS 8998 Tailscale" >nul 2>&1
netsh advfirewall firewall add rule name="POS 8998 Tailscale" dir=in action=allow protocol=TCP localport=8998 remoteip=100.64.0.0/10 >nul
netsh advfirewall firewall delete rule name="POS 8997 Tailscale" >nul 2>&1
netsh advfirewall firewall add rule name="POS 8997 Tailscale" dir=in action=allow protocol=TCP localport=8997 remoteip=100.64.0.0/10 >nul
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
echo [4/5] Bat 2 cong Funnel (443 cho 8998 va 8443 cho 8997) + Gan Vercel...
cd /d "%~dp0.."
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\setup_tailscale_dual.py --open-panel
) else (
    "%TS%" funnel --bg --https=443 http://127.0.0.1:8998
    "%TS%" funnel --bg --https=8443 http://127.0.0.1:8997
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
