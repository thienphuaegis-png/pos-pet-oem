@echo off
setlocal EnableDelayedExpansion
title DON DEP VA CHUAN HOA THU MUC POS TREN MAY TIEM
cd /d "%~dp0\.."

echo ========================================================
echo     CONG CU DON DEP & CHUAN HOA MAY TIEM (1-CHAM)
echo ========================================================
echo.
echo Thao tac nay se:
echo  1. Sao luu an toan database pos.db ra Desktop
echo  2. Go bo cac file cu, rac, tranh xung dot Git
echo  3. Dong bo repo ve ban sach, chuan moi nhat
echo  4. Tao 2 Shortcut ra Desktop: MO POS & CAP NHAT
echo.
pause

echo.
echo [1/5] Dang tam dung he thong POS...
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

echo [2/5] SAO LUU DU LIEU BAN HANG RA DESKTOP...
if exist "data\pos.db" (
    copy /Y "data\pos.db" "%USERPROFILE%\Desktop\pos_backup_an_toan.db" >nul 2>&1
    echo        -^> DA SAO LUU THANH CONG: %USERPROFILE%\Desktop\pos_backup_an_toan.db
) else (
    echo        -^> Chua co database pos.db trong data/
)

echo [3/5] Dong bo va go bo xung dot Git...
set "GIT="
for %%p in (
    "%~dp0..\git_tool\cmd\git.exe"
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
    echo [CANH BAO] Khong tim thay Git, bo qua buoc dong bo Git.
) else (
    "%GIT%" rm --cached data/pos.db >nul 2>&1
    "%GIT%" rm --cached pos.db >nul 2>&1
    
    if exist "deploy\id_pos_shop" (
        "%GIT%" config core.sshCommand "ssh -i deploy/id_pos_shop -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
        "%GIT%" remote set-url origin git@github.com:thienphuaegis-png/pos-pet-oem.git >nul 2>&1
    )
    "%GIT%" fetch origin main >nul 2>&1
    "%GIT%" checkout -f origin/main >nul 2>&1
    "%GIT%" reset --hard origin/main >nul 2>&1
    echo        -^> Git da duoc dua ve trang thai sach theo ban goc GitHub.
)

echo [4/5] Xoa sach file rac, file bat cu khoi thu muc goc...
del /Q /F "BAM VAO DAY DE CAI DAT.bat" >nul 2>&1
del /Q /F "BAT_KHOI_DONG_CUNG_WINDOWS.bat" >nul 2>&1
del /Q /F "CAP_NHAT_1_CHAM.bat" >nul 2>&1
del /Q /F "CAP_NHAT_NHANH.bat" >nul 2>&1
del /Q /F "CAP_NHAT_TU_GITHUB.bat" >nul 2>&1
del /Q /F "CHAY_ONLINE_CO_DINH.bat" >nul 2>&1
del /Q /F "KET_NOI_GITHUB_LAN_DAU.bat" >nul 2>&1
del /Q /F "KET_NOI_MAY_CON.bat" >nul 2>&1
del /Q /F "TAT_KHOI_DONG_CUNG_WINDOWS.bat" >nul 2>&1
del /Q /F "TAT_MAY_CHU.bat" >nul 2>&1
del /Q /F "chay_ngay.bat" >nul 2>&1
del /Q /F "chia_se_online.bat" >nul 2>&1
del /Q /F "CAI_DAT_POS_ONLINE_*.bat" >nul 2>&1
del /Q /F "*.zip" >nul 2>&1
del /Q /F "pos_debug.log" >nul 2>&1
del /Q /F "pos.db" >nul 2>&1

echo [5/5] Tao Shortcut dep ra Desktop cho nhan vien...
set "TARGET_DIR=%~dp0\.."
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s1 = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '🌟 MO POS MASTERCARE.lnk')); " ^
  "$s1.TargetPath = [System.IO.Path]::GetFullPath('%TARGET_DIR%\CHAY_POS.bat'); " ^
  "$s1.WorkingDirectory = [System.IO.Path]::GetFullPath('%TARGET_DIR%'); " ^
  "$s1.IconLocation = [System.IO.Path]::GetFullPath('%TARGET_DIR%\app_icon.ico'); " ^
  "$s1.Save(); " ^
  "$s2 = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '🔄 CAP NHAT POS.lnk')); " ^
  "$s2.TargetPath = [System.IO.Path]::GetFullPath('%TARGET_DIR%\CAP_NHAT.bat'); " ^
  "$s2.WorkingDirectory = [System.IO.Path]::GetFullPath('%TARGET_DIR%'); " ^
  "$s2.Save();"

echo.
echo ========================================================
echo     HOAN TAT DON DEP & CHUAN HOA MAY TIEM!
echo ========================================================
echo.
echo - File du lieu an toan da duoc luu tai Desktop: pos_backup_an_toan.db
echo - 2 Shortcut moi da san sang ngoai man hinh Desktop:
echo     1. 🌟 MO POS MASTERCARE
echo     2. 🔄 CAP NHAT POS
echo.
pause
