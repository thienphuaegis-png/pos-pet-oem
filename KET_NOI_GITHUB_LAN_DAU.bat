@echo off
title KET NOI GITHUB - POS MASTERCARE
echo ========================================================
echo        THIET LAP CAP NHAT QUA GITHUB (CHAY 1 LAN)
echo ========================================================
echo.

cd /d "%~dp0"

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May nay chua cai dat Git!
    echo Vui long cai Git hoac tiep tuc dung file ZIP de cap nhat.
    echo.
    pause
    exit /b 1
)

echo [1/3] Khoi tao ket noi Git...
if not exist ".git" (
    git init >nul 2>&1
)

git remote remove origin >nul 2>&1
git remote add origin https://github.com/thienphuaegis-png/pos-pet-oem.git

echo [2/3] Dang dong bo ma nguon va file chay moi nhat tu GitHub...
git fetch origin main
git reset --mixed origin/main

echo [3/3] Hoan tat lien ket!
echo.
echo ========================================================
echo   DA KET NOI GITHUB THANH CONG!
echo   Tu bay gio tro di, moi khi muon cap nhat:
echo   Anh chi can nhap dup file [ CAP_NHAT_TU_GITHUB.bat ]!
echo ========================================================
echo.
pause
exit
