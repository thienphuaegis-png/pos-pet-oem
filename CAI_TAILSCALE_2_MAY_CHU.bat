@echo off
chcp 65001 >nul
title CAI TAILSCALE 2 MAY CHU CO DINH (MCARE 8998 + PETNT 8997)
setlocal EnableDelayedExpansion

REM Tu dong xin quyen Administrator (can cho cai dat Tailscale va Firewall)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Dang yeu cau quyen Administrator...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "TS=C:\Program Files\Tailscale\tailscale.exe"
set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"

echo ============================================================================
echo    CAI DAT 2 LINK CO DINH TAILSCALE FUNNEL (KHONG BAO GIO DOI LINK)
echo    - Chi nhanh 1 (MCare - Cong 8998) -^> https://mcarepet.vercel.app
echo    - Chi nhanh 2 (PetNT - Cong 8997) -^> https://petnt.vercel.app
echo ============================================================================
echo.

echo [1/3] Kiem tra phan mem Tailscale...
if exist "%TS%" (
    echo    -^> Da cai san Tailscale.
) else (
    echo    -^> Chua co Tailscale, dang tu dong cai dat...
    if exist "%WINGET%" "%WINGET%" install -e --id Tailscale.Tailscale --silent --accept-source-agreements --accept-package-agreements
    if not exist "%TS%" (
        echo    -^> Dang tai bo cai chinh thuc tu tailscale.com, vui long doi 1-2 phut...
        powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile ($env:SystemRoot+'\Temp\tailscale.msi') -UseBasicParsing"
        start "" /wait msiexec /i "%SystemRoot%\Temp\tailscale.msi" /qn /norestart
    )
    if not exist "%TS%" (
        echo    [LOI] Khong tu cai duoc Tailscale. Tai tay tai https://tailscale.com/download/windows roi chay lai file nay.
        pause
        exit /b 1
    )
    powershell -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 3"
)

echo.
echo [2/3] Mo Firewall noi bo Tailscale cho cong 8998 va 8997...
netsh advfirewall firewall delete rule name="POS 8998 Tailscale" >nul 2>&1
netsh advfirewall firewall add rule name="POS 8998 Tailscale" dir=in action=allow protocol=TCP localport=8998 remoteip=100.64.0.0/10 >nul
netsh advfirewall firewall delete rule name="POS 8997 Tailscale" >nul 2>&1
netsh advfirewall firewall add rule name="POS 8997 Tailscale" dir=in action=allow protocol=TCP localport=8997 remoteip=100.64.0.0/10 >nul
echo    -^> OK

echo.
echo [3/3] Khoi chay ngam 2 may chu POS + Bat 2 cong Funnel (443 va 8443) + Mo Trung Tam May Chu...
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\setup_tailscale_dual.py --open-panel
) else (
    python scripts\setup_tailscale_dual.py --open-panel
)
if !errorlevel! neq 0 (
    echo.
    echo [!!] Co buoc can xac nhan them tren man hinh. Vui long xem thong bao phia tren.
    pause
    exit /b 1
)
powershell -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 2"
