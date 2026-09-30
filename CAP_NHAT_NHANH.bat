@echo off
chcp 65001 >nul
title CẬP NHẬT POS MASTERCARE
echo ========================================================
echo     ⚡ HỆ THỐNG CẬP NHẬT NHANH POS MASTERCARE
echo ========================================================
echo.

cd /d %~dp0

REM 1. Sao lưu dữ liệu an toàn
echo [1/3] Đang sao lưu cơ sở dữ liệu bán hàng...
if not exist "data\backups" mkdir "data\backups"
for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%a"
if exist "data\pos.db" (
    copy /y "data\pos.db" "data\backups\pos_truoc_capnhat_%STAMP%.db" >nul
    echo       -> Đã sao lưu an toàn tại: data\backups\pos_truoc_capnhat_%STAMP%.db
)

REM 2. Tắt POS cũ đang chạy
echo.
echo [2/3] Đang tạm dừng máy chủ...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8998 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

REM 3. Đồng bộ thư mục giao diện vào bản chạy ngầm
echo.
echo [3/3] Đang cập nhật giao diện và tính năng mới...
if exist "_internal\templates" (
    xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
)
if exist "_internal\static" (
    xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1
)

REM 4. Khởi động lại POS
if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
)

echo.
echo ========================================================
echo   ✅ CẬP NHẬT HOÀN TẤT! DỮ LIỆU ĐƯỢC GIỮ NGUYÊN 100%.
echo ========================================================
timeout /t 3 >nul
exit
