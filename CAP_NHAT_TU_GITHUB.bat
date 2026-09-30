@echo off
title CAP NHAT TU GITHUB - POS MASTERCARE
echo ========================================================
echo        CAP NHAT TU DONG QUA GITHUB - POS MASTERCARE
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/6] Dang sao luu co so du lieu...
if not exist "data\backups" mkdir "data\backups"
if exist "data\pos.db" copy /y "data\pos.db" "data\backups\pos_backup_gan_nhat.db" >nul

echo [2/6] Dang tat toan bo may chu POS dang chay...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8998" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
powershell -NoProfile -Command "Start-Sleep -Seconds 2"

echo [3/6] Dang dong bo ma nguon moi nhat tu GitHub...
set "GIT="
for %%p in (
    "%PROGRAMFILES%\Git\cmd\git.exe"
    "%PROGRAMFILES(x86)%\Git\cmd\git.exe"
    "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
    "%~dp0git_tool\cmd\git.exe"
) do (
    if not defined GIT if exist "%%~p" set "GIT=%%~p"
)
if not defined GIT (
    git --version >nul 2>&1 && set "GIT=git"
)

if defined GIT (
    REM Neu co SSH key thi cau hinh tu dong
    if exist "%~dp0deploy\id_pos_shop" (
        set "KEYPATH=%~dp0deploy\id_pos_shop"
        set "KEYPATH=!KEYPATH:\=/!"
        "%GIT%" config core.sshCommand "ssh -i '!KEYPATH!' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
    )
    if exist ".git" (
        "%GIT%" fetch --all >nul 2>&1
        "%GIT%" pull origin main || "%GIT%" pull github main || "%GIT%" pull
        echo        -^> Da lay ma nguon moi nhat ve may!
    )
) else (
    echo [CANH BAO] Khong tim thay Git tren may!
)

if exist "_internal\templates" xcopy "templates" "_internal\templates\" /E /I /Y >nul 2>&1
if exist "_internal\static" xcopy "static" "_internal\static\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\templates" xcopy "templates" "dist\POS_Mastercare\templates\" /E /I /Y >nul 2>&1
if exist "dist\POS_Mastercare\_internal\templates" xcopy "templates" "dist\POS_Mastercare\_internal\templates\" /E /I /Y >nul 2>&1

echo [4/6] Cap nhat CSDL va dong bo phan quyen...
set "PYCMD="
if exist ".venv\Scripts\python.exe" (
    set "PYCMD=.venv\Scripts\python.exe"
) else (
    where python >nul 2>&1 && set "PYCMD=python"
)

if defined PYCMD (
    "%PYCMD%" -c "import database; database.init_db(); print('       -^> CSDL va quyen han da duoc dong bo!')"
    if exist "scripts\deduplicate_contacts.py" (
        "%PYCMD%" scripts\deduplicate_contacts.py
    )
)

echo [5/6] Dang khoi dong lai he thong POS...
if exist "POS_Mastercare.exe" (
    start "" "POS_Mastercare.exe"
) else if exist "deploy\start_server.vbs" (
    if exist ".venv\Scripts\python.exe" (
        start "" wscript.exe "deploy\start_server.vbs"
    ) else if exist ".venv\Scripts\pythonw.exe" (
        start "" .venv\Scripts\pythonw.exe main.py
    ) else (
        start "" python main.py
    )
) else if exist ".venv\Scripts\pythonw.exe" (
    start "" .venv\Scripts\pythonw.exe main.py
) else if exist ".venv\Scripts\python.exe" (
    start "" .venv\Scripts\python.exe main.py
) else (
    start "" python main.py
)

echo [6/6] Kiem tra ket noi may chu POS...
set "READY="
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 15; $i++) {" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8998/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8999/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  Start-Sleep -Seconds 1 }; exit 1"
if %errorlevel% equ 0 set "READY=1"

echo.
echo ========================================================
if defined READY (
    echo        CAP NHAT THANH CONG! MAY CHU DA HOAT DONG!
    echo.
    echo  Luu y quan trong:
    echo  Tren trinh duyet cac may (Chrome/Edge), vui long bam:
    echo        [ Ctrl + F5 ] hoac [ Ctrl + Shift + R ]
    echo  de xoa bo nho dem (cache) va hien thi giao dien moi.
) else (
    echo   CAP NHAT XONG nhung may chu dang can khoi dong them vai giay.
    echo   Vui long mo trinh duyet va bam [ Ctrl + F5 ] de kiem tra.
)
echo ========================================================
echo.
pause
exit
