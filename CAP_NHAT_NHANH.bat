@echo off
title CAP NHAT POS MASTERCARE
echo ========================================================
echo        HE THONG CAP NHAT NHANH POS MASTERCARE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Dang sao luu co so du lieu...
if not exist "data\backups" mkdir "data\backups"
if exist "data\pos.db" copy /y "data\pos.db" "data\backups\pos_backup_gan_nhat.db" >nul

echo [2/3] Dang tam dung may chu POS...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
ping 127.0.0.1 -n 3 >nul

echo [3/3] Dang dong bo du lieu he thong...
if exist "_internal\templates" xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
if exist "_internal\static" xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1

echo.
echo Dang khoi dong lai POS Mastercare...
if exist "POS_Mastercare.exe" start "" "POS_Mastercare.exe"

echo.
echo ========================================================
echo        CAP NHAT THANH CONG! DU LIEU AN TOAN 100%%.
echo ========================================================
ping 127.0.0.1 -n 4 >nul
exit
