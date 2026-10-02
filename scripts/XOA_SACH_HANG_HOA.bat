@echo off
setlocal EnableDelayedExpansion
title XOA SACH HANG HOA DE IMPORT LAI - POS MASTERCARE
cd /d "%~dp0\.."

echo =========================================================
echo       CANH BAO: XOA TOAN BO DANH MUC HANG HOA
echo =========================================================
echo.
echo Thao tac nay se xoa TRANG toan bo hang hoa trong kho
echo de ban co the Import lai tu file Excel moi.
echo (Cac thong tin: Nguyen lieu, So quy, Khach hang VAN GIU NGUYEN)
echo.
set /p CONFIRM="Ban co CHAC CHAN muon xoa khong? (Nhap Y de dong y): "
if /i not "!CONFIRM!"=="Y" (
    echo.
    echo Da huy thao tac xoa!
    pause
    exit /b 0
)

echo.
echo [*] Dang tao ban sao luu phong ho...
if not exist "data\backups" mkdir "data\backups"
copy /Y "data\pos.db" "data\backups\pos_truoc_khi_xoa_hanghoa_%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%.db" >nul 2>&1

echo [*] Dang thuc hien xoa toan bo hang hoa...
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\xoa_sach_hang_hoa.py
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        python scripts\xoa_sach_hang_hoa.py
    ) else (
        echo [LOI] Khong tim thay Python de chay script!
    )
)

echo.
pause
