@echo off
title CAP NHAT TU GITHUB - POS MASTERCARE
echo ========================================================
echo        CAP NHAT TU DONG QUA GITHUB
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Dang sao luu co so du lieu...
if not exist "data\backups" mkdir "data\backups"
if exist "data\pos.db" copy /y "data\pos.db" "data\backups\pos_backup_gan_nhat.db" >nul

echo [2/4] Dang tam dung may chu POS va ngrok...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
ping 127.0.0.1 -n 3 >nul

echo [3/4] Dang keo code moi tu GitHub...
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist ".git" (
        git pull github main 2>nul || git pull origin main 2>nul || git pull
        echo        -^> Da keo code thanh cong!
    )
)

if exist "_internal\templates" xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
if exist "_internal\static" xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1

echo [4/4] Dang khoi dong lai he thong...
if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
) else if exist ".venv\Scripts\pythonw.exe" (
    start "" .venv\Scripts\pythonw.exe main.py
) else (
    start "" python main.py
)

echo.
echo ========================================================
echo        CAP NHAT HOAN TAT!
echo ========================================================
ping 127.0.0.1 -n 4 >nul
exit
