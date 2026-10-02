@echo off
setlocal EnableDelayedExpansion
title DONG BO LICH SU GOOGLE SHEETS VAO MAY TIEM
cd /d "%~dp0\.."

echo =========================================================
echo    DONG BO 772 KHACH HANG, 77 SAN PHAM ^& 129 HOA DON
echo =========================================================
echo.
echo Thao tac nay se doc truc tiep tu Google Sheets va nap:
echo   - 772 Khach hang (kem ma KH, SDT chuan, cong no cu)
echo   - 77 San pham ban le khop 100%% voi lich su
echo   - 129 Hoa don ban le va 683 dong chi tiet mon
echo.
echo Du lieu nap vao file data\pos.db tren may nay.
echo.
pause

echo.
echo [*] Dang tao ban sao luu du phong...
if not exist "data\backups" mkdir "data\backups"
copy /Y "data\pos.db" "data\backups\pos_truoc_khi_dong_bo_sheets_%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%.db" >nul 2>&1

echo [*] Dang ket noi Google Sheets va nap du lieu...
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
    where python >nul 2>&1
    if !errorlevel! equ 0 set "PY=python"
)

if not defined PY (
    echo [LOI] Khong tim thay Python tren may!
    echo Vui long mo trinh duyet vao POS va dung tinh nang Nhap Excel.
    pause
    exit /b 1
)

"%PY%" scripts\import_full_google_sheets_history.py

echo.
echo =========================================================
echo   HOAN TAT! Hay mo trinh duyet bam Ctrl + F5 de xem.
echo =========================================================
echo.
pause
