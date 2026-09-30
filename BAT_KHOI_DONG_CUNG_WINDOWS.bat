@echo off
chcp 65001 >nul
echo ========================================================
echo   BAT KHOI DONG CUNG WINDOWS - POS MASTERCARE
echo ========================================================
echo.
set "APP_DIR=%~dp0"
set "EXE_PATH=%APP_DIR%POS_Mastercare.exe"

if not exist "%EXE_PATH%" (
    echo [LOI] Khong tim thay POS_Mastercare.exe trong thu muc nay!
    pause
    exit /b
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "POS_Mastercare" /t REG_SZ /d "\"%EXE_PATH%\"" /f >nul
if %errorlevel% equ 0 (
    echo [THANH CONG] Da bat che do tu dong khoi dong ngam cung Windows!
    echo.
    echo Tu bay gio:
    echo - Moi khi bat may tinh len, POS Mastercare se tu dong chay ngam 24/7.
    echo - Khong hien cua so den gay vuong vi.
    echo - Bieu tuong se nam o khay he thong (System Tray) canh dong ho Windows.
) else (
    echo [LOI] Khong the ghi vao Registry.
)
echo.
pause
