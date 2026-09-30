@echo off
title KET NOI GITHUB - POS MASTERCARE
echo ========================================================
echo        THIET LAP CAP NHAT QUA GITHUB (CHAY 1 LAN)
echo ========================================================
echo.

cd /d "%~dp0"

REM Dò tìm Git
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
    echo [THONG BAO] May nay chua co Git!
    echo He thong dang tu dong tai va cai dat Git Portable cho ban...
    echo.
    powershell -NoProfile -Command ^
      "$u='https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/MinGit-2.44.0-64-bit.zip';" ^
      "$z='mingit.zip'; Write-Host 'Dang tai Git...' -ForegroundColor Cyan;" ^
      "Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing;" ^
      "Write-Host 'Dang giai nen Git...' -ForegroundColor Cyan;" ^
      "Expand-Archive -Path $z -DestinationPath 'git_tool' -Force; Remove-Item $z -Force"
    if exist "git_tool\cmd\git.exe" (
        set "GIT=%~dp0git_tool\cmd\git.exe"
        echo  -^> Cai dat Git mini thanh cong!
    )
)

if not defined GIT (
    echo [LOI] Khong the tai Git tu dong. Vui long cai Git tai https://git-scm.com
    pause
    exit /b 1
)

echo [1/3] Khoi tao ket noi Git...
if not exist ".git" (
    "%GIT%" init >nul 2>&1
)

"%GIT%" remote remove origin >nul 2>&1
"%GIT%" remote add origin https://github.com/thienphuaegis-png/pos-pet-oem.git

echo [2/3] Dang dong bo ma nguon va file chay moi nhat tu GitHub...
"%GIT%" fetch origin main
"%GIT%" reset --mixed origin/main

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
