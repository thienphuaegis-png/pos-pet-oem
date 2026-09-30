@echo off
setlocal EnableDelayedExpansion
title CAP NHAT 1 CHAM - POS MASTERCARE
echo ========================================================
echo         CAP NHAT 1 CHAM - POS MASTERCARE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Dang tat may chu POS de giai phong file...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
powershell -NoProfile -Command "Start-Sleep -Seconds 1"

echo [2/4] Dang tim kiem Git tren may...
set "GIT="
for %%p in (
    "%~dp0git_tool\cmd\git.exe"
    "%PROGRAMFILES%\Git\cmd\git.exe"
    "%PROGRAMFILES(x86)%\Git\cmd\git.exe"
    "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
) do (
    if not defined GIT if exist "%%~p" set "GIT=%%~p"
)
if not defined GIT (
    git --version >nul 2>&1 && set "GIT=git"
)

if not defined GIT (
    echo [LOI] Khong tim thay Git tren may!
    echo Vui long chay file KET_NOI_GITHUB_LAN_DAU.bat de tu dong tai Git.
    pause
    exit /b 1
)

echo [3/4] Dang dong bo ma nguon moi nhat tu GitHub...
if exist "deploy\id_pos_shop" (
    "%GIT%" config core.sshCommand "ssh -i deploy/id_pos_shop -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
)

"%GIT%" remote set-url origin git@github.com:thienphuaegis-png/pos-pet-oem.git >nul 2>&1
"%GIT%" fetch origin main
"%GIT%" checkout -f origin/main >nul 2>&1
"%GIT%" reset --hard origin/main

echo.
echo [4/4] Dang khoi dong lai he thong POS...
if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
)

echo.
echo ========================================================
echo       CAP NHAT HOAN TAT VA HE THONG DA KHOI DONG!
echo.
echo   Luu y: Tren trinh duyet Chrome/Edge, vui long bam:
echo          [ Ctrl + F5 ] de hien thi giao dien moi.
echo ========================================================
echo.
pause
