@echo off
setlocal EnableDelayedExpansion
title CAP NHAT POS MASTERCARE - TU DONG DONG BO
cd /d "%~dp0"

echo ========================================================
echo         CAP NHAT PHIEN BAN MOI - POS MASTERCARE
echo ========================================================
echo.

REM --- 1/5 Tat may chu POS va giai phong cong ---
echo [1/5] Dang tam dung may chu POS de cap nhat an toan...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM pythonw.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
powershell -NoProfile -Command "Start-Sleep -Seconds 1"

REM --- 2/5 Sao luu database truoc khi cap nhat (Chong mat du lieu) ---
echo [2/5] Sao luu du lieu ban hang hien tai...
if not exist "data\backups" mkdir "data\backups"

set "STAMP="
for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%a"
if not defined STAMP set "STAMP=%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"

if exist "data\pos.db" (
    copy /Y "data\pos.db" "data\backups\pos_truoc_capnhat_!STAMP!.db" >nul 2>&1
    echo        -^> Da sao luu tai: data\backups\pos_truoc_capnhat_!STAMP!.db
) else (
    echo        -^> Chua co du lieu cu (khoi tao moi)
)

REM --- 3/5 Kiem tra cong cu Git ---
echo [3/5] Tim kiem Git tren may tinh...
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
    echo.
    echo [LOI] Khong tim thay Git tren may tinh nay!
    echo Vui long lien he quan tri vien de duoc ho tro.
    echo.
    pause
    exit /b 1
)

REM --- 4/5 Dong bo ma nguon moi nhat tu GitHub ---
echo [4/5] Dang tai ban cap nhat tu GitHub...
set "FETCH_OK=0"

REM Uu tien SSH Deploy key neu co
if exist "deploy\id_pos_shop" (
    "%GIT%" config core.sshCommand "ssh -i deploy/id_pos_shop -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    "%GIT%" remote set-url origin git@github.com:thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    "%GIT%" fetch origin main && set "FETCH_OK=1"
) else if exist "deploy\khoa_tiem" (
    set "KEYPATH=%~dp0deploy\khoa_tiem"
    set "KEYPATH=!KEYPATH:\=/!"
    "%GIT%" config core.sshCommand "ssh -i '!KEYPATH!' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    "%GIT%" remote set-url origin git@github.com:thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    "%GIT%" fetch origin main && set "FETCH_OK=1"
)

REM Fallback HTTPS neu chua dung SSH
if "!FETCH_OK!"=="0" (
    "%GIT%" remote set-url origin https://github.com/thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    "%GIT%" fetch origin main && set "FETCH_OK=1"
)

if "!FETCH_OK!"=="1" (
    "%GIT%" checkout -f origin/main >nul 2>&1
    "%GIT%" reset --hard origin/main >nul 2>&1
    echo        -^> Dong bo ma nguon thanh cong:
    "%GIT%" log -1 --format="           [%%h] %%s (%%cr)"
) else (
    echo [LOI] Khong the tai ma nguon tu GitHub. Vui long kiem tra lai ket noi mang!
    pause
    exit /b 1
)

    REM Tu dong chay nang cap co so du lieu (migration) neu co python
    if exist ".venv\Scripts\python.exe" (
        ".venv\Scripts\python.exe" database.py >nul 2>&1
        ".venv\Scripts\python.exe" scripts\import_full_google_sheets_history.py >nul 2>&1
    ) else (
        where python >nul 2>&1
        if !errorlevel! equ 0 (
            python database.py >nul 2>&1
            python scripts\import_full_google_sheets_history.py >nul 2>&1
        )
    )

REM Dong bo giao dien templates/static vao thu muc ban build neu co
if exist "_internal\templates" xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
if exist "_internal\static" xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\templates" xcopy "templates" "dist\POS_Mastercare\templates\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\_internal\templates" xcopy "templates" "dist\POS_Mastercare\_internal\templates\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\_internal\static" xcopy "static" "dist\POS_Mastercare\_internal\static\" /E /I /Y >nul 2>&1

echo.
echo [5/5] Hoan tat cap nhat! Dang khoi dong lai POS...
if exist "CHAY_POS.bat" (
    call "CHAY_POS.bat"
) else if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
)

echo.
echo ========================================================
echo       CAP NHAT THANH CONG!
echo.
echo   Luu y: Tren trinh duyet Chrome/Edge, vui long bam:
echo          [ Ctrl + F5 ] de tai lai giao dien moi nhat.
echo ========================================================
echo.
pause
