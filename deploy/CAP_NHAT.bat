@echo off
chcp 65001 >nul
title CAP NHAT POS PET OEM
setlocal EnableDelayedExpansion
cd /d "%~dp0.."
set "ROOT=%CD%"

REM /auto = chay tu nut web: khong pause, ghi ket qua ra logs\update_status.txt
set "PAUSE=pause"
if /i "%~1"=="/auto" set "PAUSE=rem"
if not exist "logs" mkdir "logs"
set "OLD=" & set "NEW=" & set "BACKUP="

echo ==================================================
echo   CAP NHAT POS PET OEM
echo ==================================================
echo.

REM --- 0/5 Kiem tra moi truong ---
if not exist ".venv\Scripts\python.exe" (
    echo [LOI] Chua cai dat. Hay chay deploy\CAI_DAT_MAY_CHU.bat truoc.
    call :write_status FAILED_PRECHECK "Chua cai dat venv"
    %PAUSE% & exit /b 1
)
set "VPY=%ROOT%\.venv\Scripts\python.exe"

REM Tim git bang duong dan tuyet doi: PATH cua tien trinh nay co the khac
REM PATH luc cai dat (xem CAI_DAT_MAY_CHU.bat buoc 0).
set "GIT="
for %%p in (
    "%PROGRAMFILES%\Git\cmd\git.exe"
    "%PROGRAMFILES(x86)%\Git\cmd\git.exe"
    "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
) do (
    if not defined GIT if exist %%p set "GIT=%%p"
)
if not defined GIT (
    git --version >nul 2>&1 && set "GIT=git"
)
if not defined GIT (
    echo [LOI] Khong tim thay Git tren may nay - khong the cap nhat.
    echo       Hay goi cho nguoi quan tri he thong.
    call :write_status FAILED_PRECHECK "Khong tim thay Git"
    %PAUSE% & exit /b 1
)

"%GIT%" rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Thu muc nay khong phai ban sao tu GitHub, khong the cap nhat.
    echo       Hay goi cho nguoi quan tri he thong.
    call :write_status FAILED_PRECHECK "Khong phai git repo"
    %PAUSE% & exit /b 1
)

REM --- 1/5 Tat server dang chay ---
echo [1/5] Tam dung server...
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*main.py*' -or $_.Name -like '*POS_Mastercare*' } | Stop-Process -Force -ErrorAction SilentlyContinue;" ^
  "foreach ($p in 8998,8999) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } }"
REM Khong dung "timeout": ban Unix cua Git Bash co cu phap khac, con
REM timeout.exe cua Windows bao loi khi stdin bi chuyen huong.
powershell -NoProfile -Command "Start-Sleep -Seconds 3"
echo       OK

REM --- 2/5 Sao luu du lieu ---
echo [2/5] Sao luu du lieu...
if not exist "data\pos.db" (
    echo [LOI] Khong tim thay data\pos.db - khong cap nhat de an toan.
    call :write_status FAILED_PRECHECK "Khong tim thay data\pos.db"
    %PAUSE% & exit /b 1
)
if not exist "data\backups" mkdir "data\backups"

for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value 2^>nul') do set "dt=%%a"
if not defined dt (
    REM Du phong khi wmic bi go khoi Windows moi
    for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%a"
) else (
    set "STAMP=!dt:~0,8!_!dt:~8,6!"
)
set "BACKUP=data\backups\pos_truoc_capnhat_!STAMP!.db"

"%VPY%" -c "import sqlite3,sys; s=sqlite3.connect(r'data\pos.db'); d=sqlite3.connect(r'!BACKUP!'); s.backup(d); n=d.execute('select count(*) from sqlite_master where type=\"table\"').fetchone()[0]; d.close(); s.close(); sys.exit(0 if n>5 else 1)"
if !errorlevel! neq 0 (
    echo [LOI] Sao luu that bai - DUNG LAI, khong cap nhat.
    call :write_status FAILED_BACKUP "Sao luu DB that bai"
    start /d "%ROOT%" "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    %PAUSE% & exit /b 1
)
echo       Da luu: !BACKUP!

REM --- 3/5 Tai code moi ---
echo [3/5] Tai ban cap nhat tu GitHub...
for /f %%h in ('"%GIT%" rev-parse HEAD') do set "OLD=%%h"
REM Chon cach xac thuc theo thu co san tren may tiem:
REM   deploy\id_pos_shop = SSH deploy key mac dinh
REM   deploy\khoa_tiem   = SSH deploy key bo sung (USB)
REM   deploy\khoa_tiem.txt = token HTTPS (cai bang file moi tu Zalo)
REM ssh nuot dau \ nen phai doi sang / truoc khi dua vao GIT_SSH_COMMAND.
set "KEYPATH="
if exist "%ROOT%\deploy\id_pos_shop" set "KEYPATH=%ROOT%\deploy\id_pos_shop"
if exist "%ROOT%\deploy\khoa_tiem" set "KEYPATH=%ROOT%\deploy\khoa_tiem"

if defined KEYPATH (
    set "KEYPATH=!KEYPATH:\=/!"
    set "GIT_SSH_COMMAND=ssh -i '!KEYPATH!' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
)

set "PULLURL="
if exist "%ROOT%\deploy\khoa_tiem.txt" (
    set /p TOKEN=<"%ROOT%\deploy\khoa_tiem.txt"
    for /f "delims=" %%u in ('"%GIT%" config --get remote.origin.url') do set "ORIGINURL=%%u"
    REM Chi ghep token neu origin la https
    if not "!ORIGINURL:https://=!"=="!ORIGINURL!" (
        set "PULLURL=!ORIGINURL:https://=https://!TOKEN!@!"
    )
)

if defined PULLURL (
    "%GIT%" pull --ff-only "!PULLURL!" > "%TEMP%\pos_pull.log" 2>&1
    set "RC=!errorlevel!"
    type "%TEMP%\pos_pull.log" | findstr /v /c:"!TOKEN!"
    del "%TEMP%\pos_pull.log" >nul 2>&1
) else (
    "%GIT%" pull --ff-only
    set "RC=!errorlevel!"
)
if !RC! neq 0 (
    echo.
    echo [LOI] Khong tai duoc ban cap nhat.
    echo       DU LIEU CUA BAN VAN AN TOAN - khong mat gi.
    echo       Ban sao luu o: !BACKUP!
    echo.
    echo       Nguyen nhan thuong gap: mat internet, hoac co nguoi
    echo       da sua file truc tiep tren may nay.
    echo       Hay goi cho nguoi quan tri he thong.
    echo.
    echo       Dang khoi dong lai ban cu...
    start /d "%ROOT%" "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    call :write_status FAILED_PULL "Khong tai duoc ban cap nhat"
    %PAUSE% & exit /b 1
)
echo       OK
for /f %%h in ('"%GIT%" rev-parse HEAD') do set "NEW=%%h"
if "!NEW!"=="!OLD!" (
    echo       Da la ban moi nhat.
    start /d "%ROOT%" "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    call :write_status NO_CHANGE "Khong co ban moi"
    %PAUSE% & exit /b 0
)

REM --- 4/5 Cai thu vien moi + nang cap co so du lieu ---
echo [4/5] Cap nhat thu vien va co so du lieu...
"%VPY%" -m pip install -r requirements.txt -q
if !errorlevel! neq 0 (
    echo [CANH BAO] Cai thu vien co loi - thu chay tiep.
)
"%VPY%" -c "import database; database.init_db()"
if !errorlevel! neq 0 (
    set "REASON=Nang cap co so du lieu that bai"
    goto rollback
)
if exist "scripts\deduplicate_contacts.py" (
    "%VPY%" scripts\deduplicate_contacts.py
)
echo       OK

REM --- 5/5 Chay lai va kiem tra thuc su len ---
echo [5/5] Khoi dong lai...
start /d "%ROOT%" "" wscript.exe "%ROOT%\deploy\start_server.vbs"

REM Cho server len, toi da 30 giay.
set "READY="
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 30; $i++) {" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8999/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8998/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  Start-Sleep -Seconds 1 }; exit 1"
if %errorlevel% equ 0 set "READY=1"

if not defined READY (
    set "ERR_DETAIL="
    if exist "pos_debug.log" (
        for /f "delims=" %%l in ('powershell -NoProfile -Command "Get-Content pos_debug.log -Tail 15 -ErrorAction SilentlyContinue | Out-String"') do set "ERR_DETAIL=%%l"
    )
    if defined ERR_DETAIL (
        set "REASON=Server khoi dong loi: !ERR_DETAIL!"
    ) else (
        set "REASON=Server ban moi khong khoi dong duoc"
    )
    goto rollback
)
call :write_status OK "Cap nhat thanh cong"
echo.
echo ==================================================
echo   CAP NHAT XONG - SERVER DANG CHAY
echo   Du lieu giu nguyen. Bam icon "POS PET OEM" de tiep tuc.
echo ==================================================
%PAUSE%
exit /b 0

:rollback
echo.
echo [ROLLBACK] !REASON! - dang quay ve ban cu !OLD!...
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*main.py*' -or $_.Name -like '*POS_Mastercare*' } | Stop-Process -Force -ErrorAction SilentlyContinue;" ^
  "foreach ($p in 8998,8999) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } };" ^
  "Start-Sleep -Seconds 3"
"%GIT%" reset --hard !OLD!
del /q "data\pos.db-wal" "data\pos.db-shm" >nul 2>&1
"%VPY%" -c "import sqlite3; s=sqlite3.connect(r'!BACKUP!'); d=sqlite3.connect(r'data\pos.db'); s.backup(d); d.close(); s.close()"
"%VPY%" -m pip install -r requirements.txt -q
start /d "%ROOT%" "" wscript.exe "%ROOT%\deploy\start_server.vbs"
powershell -NoProfile -Command "for ($i=0; $i -lt 45; $i++) { foreach ($p in 8998,8999) { try { $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $p + '/api/ping') -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } } catch {} }; Start-Sleep -Seconds 1 }; exit 1"
if !errorlevel! equ 0 (
    call :write_status ROLLED_BACK "!REASON! - da quay ve ban cu"
    echo   DA QUAY VE BAN CU - du lieu giu nguyen.
) else (
    call :write_status ROLLBACK_FAILED "!REASON! - ban cu cung khong len, can truy cap may qua Tailscale"
    echo   [LOI] Ban cu cung khong len. Goi nguoi quan tri.
)
%PAUSE%
exit /b 1

:write_status
(
    echo result=%~1
    echo message=%~2
    echo old=!OLD!
    echo new=!NEW!
    echo backup=!BACKUP!
    echo at=!STAMP!
) > "%ROOT%\logs\update_status.txt"
del "%ROOT%\logs\update.lock" >nul 2>&1
exit /b 0
