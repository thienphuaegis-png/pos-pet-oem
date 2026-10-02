@echo off
setlocal EnableDelayedExpansion
title CAP NHAT 1 CHAM - POS MASTERCARE
echo ========================================================
echo         CAP NHAT 1 CHAM - POS MASTERCARE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Dang tat may chu POS va cac tien trinh chay ngam...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM pythonw.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1

REM Quet va kill tat ca tien trinh chiem cong 8998, 8999
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Kill bang PowerShell de dam bao sach 100% khong con tien trinh nao giu file
powershell -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -match 'POS_Mastercare|python|ngrok' } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1"

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
set "FETCH_OK=0"
if exist "deploy\id_pos_shop" (
    "%GIT%" config core.sshCommand "ssh -i deploy/id_pos_shop -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    "%GIT%" remote set-url origin git@github.com:thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    "%GIT%" fetch origin main && set "FETCH_OK=1"
)
if "!FETCH_OK!"=="0" (
    "%GIT%" remote set-url origin https://github.com/thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    "%GIT%" fetch origin main && set "FETCH_OK=1"
)

if "!FETCH_OK!"=="1" (
    "%GIT%" checkout -f origin/main >nul 2>&1
    "%GIT%" reset --hard origin/main
    echo        -^> Da dong bo ma nguon thanh cong:
    "%GIT%" log -1 --format="           [%%h] %%s"
) else (
    echo [LOI] Khong the tai ma nguon tu GitHub. Vui long kiem tra mang!
)

REM Dong bo giao dien templates va static vao moi thu muc cua ban build
if exist "_internal\templates" xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
if exist "_internal\static" xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\templates" xcopy "templates" "dist\POS_Mastercare\templates\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\_internal\templates" xcopy "templates" "dist\POS_Mastercare\_internal\templates\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\_internal\static" xcopy "static" "dist\POS_Mastercare\_internal\static\" /E /I /Y >nul 2>&1

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
