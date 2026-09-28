@echo off
chcp 65001 >nul
title CAI DAT POS PET OEM
setlocal EnableDelayedExpansion

REM ============================================================
REM  FILE MOI - gui cho tiem qua Zalo/email.
REM  Nguoi o tiem chi can bam dup file nay, khong can gi khac.
REM  Tu tai code tu GitHub -> tu cai dat -> tu chay.
REM ============================================================

REM --- Cau hinh: anh Phu dien truoc khi gui ---
set "TOKEN=DAN_TOKEN_VAO_DAY"
set "REPO=thienphuaegis-png/pos-pet-oem"
set "DICH=C:\POS"

echo.
echo   ================================================
echo     CAI DAT POS PET OEM
echo   ================================================
echo.

if "%TOKEN%"=="DAN_TOKEN_VAO_DAY" (
    echo   [LOI] File nay chua duoc cau hinh.
    echo         Hay bao nguoi gui file cho ban.
    echo.
    pause & exit /b 1
)

REM Tu xin quyen quan tri - nguoi dung khong biet "Run as administrator"
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo   Dang xin quyen quan tri...
    echo   Windows se hoi "Do you want to allow..." - hay chon YES.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
    if errorlevel 1 (
        echo.
        echo   Ban da chon NO nen khong cai dat duoc.
        echo   Hay chay lai file nay va chon YES.
        echo.
        pause
    )
    exit /b 0
)

echo   Sap toi: may se tu tai va cai dat moi thu.
echo   Lan dau co the mat 5-15 phut. Can co internet.
echo.
pause
echo.

REM --- 1/3 Kiem tra Git ---
echo [1/3] Kiem tra cong cu tai ve...
set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
set "GIT="
for %%p in (
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
    echo       Chua co Git. Dang cai tu dong...
    if not exist "%WINGET%" (
        echo [LOI] May nay khong cai tu dong duoc.
        echo       Tai Git tai https://git-scm.com/download/win roi chay lai.
        start "" "https://git-scm.com/download/win"
        pause & exit /b 1
    )
    "%WINGET%" install -e --id Git.Git --accept-source-agreements --accept-package-agreements
    if exist "%PROGRAMFILES%\Git\cmd\git.exe" set "GIT=%PROGRAMFILES%\Git\cmd\git.exe"
)
if not defined GIT (
    echo [LOI] Van khong tim thay Git sau khi cai.
    echo       Hay khoi dong lai may roi chay lai file nay.
    pause & exit /b 1
)
set "GIT=%GIT:"=%"
echo       OK: "%GIT%"

REM --- 2/3 Tai code ---
echo [2/3] Dang tai chuong trinh tu internet...

if exist "%DICH%\.git" (
    echo       Da co san - dang cap nhat...
    pushd "%DICH%"
    "%GIT%" pull --ff-only "https://%TOKEN%@github.com/%REPO%.git"
    set "RC=!errorlevel!"
    popd
    if !RC! neq 0 (
        echo [LOI] Khong cap nhat duoc. Kiem tra internet roi thu lai.
        pause & exit /b 1
    )
) else (
    if exist "%DICH%" (
        echo [LOI] Thu muc %DICH% da ton tai nhung khong phai ban cai dat.
        echo       Hay bao nguoi quan tri he thong.
        pause & exit /b 1
    )
    "%GIT%" clone https://%TOKEN%@github.com/%REPO%.git "%DICH%" > "%TEMP%\pos_clone.log" 2>&1
    set "RC=!errorlevel!"
    type "%TEMP%\pos_clone.log" | findstr /v /c:"%TOKEN%"
    del "%TEMP%\pos_clone.log" >nul 2>&1
    if !RC! neq 0 (
        echo.
        echo [LOI] Khong tai duoc chuong trinh.
        echo       Kiem tra may co internet khong.
        echo       Neu van loi, bao nguoi gui file nay ^(co the token het han^).
        pause & exit /b 1
    )
)
echo       OK

REM Luu token de nut "CAP NHAT POS" dung ve sau. File nay da gitignore.
REM Khong de token trong remote URL vi `git remote -v` hien no ra man hinh.
> "%DICH%\deploy\khoa_tiem.txt" echo %TOKEN%
pushd "%DICH%"
"%GIT%" remote set-url origin https://github.com/%REPO%.git
popd

REM --- 3/3 Chay bo cai ---
echo [3/3] Dang cai dat...
echo.
if not exist "%DICH%\deploy\CAI_DAT_MAY_CHU.bat" (
    echo [LOI] Tai ve thieu file. Bao nguoi quan tri he thong.
    pause & exit /b 1
)
call "%DICH%\deploy\CAI_DAT_MAY_CHU.bat"
