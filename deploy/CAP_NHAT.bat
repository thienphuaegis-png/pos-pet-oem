@echo off
chcp 65001 >nul
title CAP NHAT POS PET OEM
setlocal EnableDelayedExpansion
cd /d "%~dp0.."
set "ROOT=%CD%"

REM ============================================================
REM  Thu tu BAT BUOC: sao luu DB -> tat server -> pull -> cai
REM  thu vien -> nang schema -> chay lai.
REM  Pull loi thi DUNG NGAY, khoi dong lai ban cu, khong lam gi them.
REM ============================================================

echo ==================================================
echo   CAP NHAT POS PET OEM
echo ==================================================
echo.

REM --- 0/5 Kiem tra moi truong ---
if not exist ".venv\Scripts\python.exe" (
    echo [LOI] Chua cai dat. Hay chay deploy\CAI_DAT_MAY_CHU.bat truoc.
    pause & exit /b 1
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
    pause & exit /b 1
)

"%GIT%" rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Thu muc nay khong phai ban sao tu GitHub, khong the cap nhat.
    echo       Hay goi cho nguoi quan tri he thong.
    pause & exit /b 1
)

REM --- 1/5 Sao luu du lieu TRUOC KHI lam bat cu dieu gi ---
echo [1/5] Sao luu du lieu...
if not exist "data\pos.db" (
    echo [LOI] Khong tim thay data\pos.db - khong cap nhat de an toan.
    pause & exit /b 1
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

copy /y "data\pos.db" "!BACKUP!" >nul
if !errorlevel! neq 0 (
    echo [LOI] Sao luu that bai - DUNG LAI, khong cap nhat.
    pause & exit /b 1
)
REM Xac nhan ban sao doc duoc va co du bang (khong phai file rong)
"%VPY%" -c "import sqlite3,sys; c=sqlite3.connect(r'!BACKUP!'); n=c.execute('select count(*) from sqlite_master where type=\"table\"').fetchone()[0]; sys.exit(0 if n>5 else 1)"
if !errorlevel! neq 0 (
    echo [LOI] Ban sao luu bi loi - DUNG LAI, khong cap nhat.
    pause & exit /b 1
)
echo       Da luu: !BACKUP!

REM --- 2/5 Tat server dang chay ---
echo [2/5] Tam dung server...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8999 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }"
REM Khong dung "timeout": ban Unix cua Git Bash co cu phap khac, con
REM timeout.exe cua Windows bao loi khi stdin bi chuyen huong.
powershell -NoProfile -Command "Start-Sleep -Seconds 3"
echo       OK

REM --- 3/5 Tai code moi ---
echo [3/5] Tai ban cap nhat tu GitHub...
REM Neu tiem duoc cap khoa rieng (deploy key), dung dung khoa do. Khong de
REM git tu do khoa mac dinh: may tiem khong co san khoa nao.
REM ssh nuot dau \ nen phai doi sang / truoc khi dua vao GIT_SSH_COMMAND.
if exist "%ROOT%\deploy\khoa_tiem" (
    set "KEYPATH=%ROOT%\deploy\khoa_tiem"
    set "KEYPATH=!KEYPATH:\=/!"
    set "GIT_SSH_COMMAND=ssh -i '!KEYPATH!' -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
)
"%GIT%" pull --ff-only
if %errorlevel% neq 0 (
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
    start "" wscript.exe "%ROOT%\deploy\start_server.vbs"
    pause & exit /b 1
)
echo       OK

REM --- 4/5 Cai thu vien moi + nang cap co so du lieu ---
echo [4/5] Cap nhat thu vien va co so du lieu...
"%VPY%" -m pip install -r requirements.txt -q
if !errorlevel! neq 0 (
    echo [CANH BAO] Cai thu vien co loi - thu chay tiep.
)
"%VPY%" -c "import database; database.init_db()"
if !errorlevel! neq 0 (
    echo.
    echo [LOI] Nang cap co so du lieu that bai.
    echo       Ban sao luu truoc cap nhat o: !BACKUP!
    echo       Hay goi cho nguoi quan tri he thong - DUNG tu sua.
    pause & exit /b 1
)
echo       OK

REM --- 5/5 Chay lai va kiem tra thuc su len ---
echo [5/5] Khoi dong lai...
start "" wscript.exe "%ROOT%\deploy\start_server.vbs"

REM Cho server len, toi da 15 giay. Gom ca vong lap vao 1 lan goi PowerShell
REM cho nhanh va tranh phu thuoc "timeout" (Git Bash / stdin redirect).
set "READY="
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 15; $i++) {" ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8999/api/ping' -TimeoutSec 2 -UseBasicParsing;" ^
  "        if ($r.StatusCode -eq 200) { exit 0 } } catch {}" ^
  "  Start-Sleep -Seconds 1 }; exit 1"
if %errorlevel% equ 0 set "READY=1"

echo.
echo ==================================================
if defined READY (
    echo   CAP NHAT XONG - SERVER DANG CHAY
    echo   Du lieu giu nguyen. Bam icon "POS PET OEM" de tiep tuc.
) else (
    echo   CAP NHAT XONG nhung SERVER CHUA LEN
    echo   Thu bam shortcut "KHOI DONG POS" tren Desktop.
    echo   Neu van khong duoc, goi nguoi quan tri he thong.
    echo   Ban sao luu o: !BACKUP!
)
echo ==================================================
pause
