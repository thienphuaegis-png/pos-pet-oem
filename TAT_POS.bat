@echo off
title TAT POS MASTERCARE - DONG TAT CA TIEN TRINH
echo [1/2] Dang dong POS_Mastercare.exe...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1

echo [2/2] Dang giai phong cong mang 8997, 8998, 8999...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8997" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ========================================================
echo   DA TAT SACH TAT CA TIEN TRINH POS MASTERCARE!
echo ========================================================
timeout /t 2 >nul
