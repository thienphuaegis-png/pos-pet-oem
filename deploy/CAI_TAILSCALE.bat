@echo off
chcp 65001 >nul
title CAI TAILSCALE - HO TRO TU XA
setlocal
set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
set "TS=%ProgramFiles%\Tailscale\tailscale.exe"

echo ==================================================
echo   CAI TAILSCALE (de ky thuat vien ho tro tu xa)
echo ==================================================
echo.
echo Buoc nay KHONG bat buoc de dung POS.
echo POS van chay binh thuong trong tiem neu khong cai.
echo.
echo Chi can neu muon ky thuat vien xem/sua tu xa.
echo.
pause

REM Da cai roi thi khong cai lai
if exist "%TS%" goto dangnhap

if not exist "%WINGET%" (
    echo [LOI] May nay khong co winget.
    echo       Tai tay tai https://tailscale.com/download/windows
    start "" "https://tailscale.com/download/windows"
    pause & exit /b 1
)

echo Dang cai Tailscale...
"%WINGET%" install -e --id tailscale.tailscale --accept-source-agreements --accept-package-agreements
if %errorlevel% neq 0 (
    echo [LOI] Cai that bai. Tai tay tai https://tailscale.com/download/windows
    start "" "https://tailscale.com/download/windows"
    pause & exit /b 1
)

if not exist "%TS%" (
    echo [LOI] Cai xong nhung khong tim thay Tailscale.
    echo       Hay khoi dong lai may roi chay lai file nay.
    pause & exit /b 1
)

:dangnhap
echo.
echo ==================================================
echo   DANG NHAP
echo ==================================================
echo Cua so trinh duyet se mo ra.
echo Dang nhap bang tai khoan KY THUAT VIEN cung cap
echo (khong phai tai khoan ca nhan cua tiem).
echo.
"%TS%" up
if %errorlevel% neq 0 (
    echo [LOI] Dang nhap that bai. Goi ky thuat vien.
    pause & exit /b 1
)

echo.
echo ==================================================
echo   XONG - DOC TEN MAY NAY CHO KY THUAT VIEN
echo ==================================================
"%TS%" status
echo.
echo Dia chi de ky thuat vien truy cap POS:
for /f "tokens=1" %%i in ('"%TS%" ip -4 2^>nul') do echo    http://%%i:8999
echo.
pause
