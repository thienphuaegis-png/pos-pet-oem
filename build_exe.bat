@echo off
echo ==============================================
echo   DANG DONG GOI POS OFFLINE THANH 1 FILE EXE
echo ==============================================

cd /d %~dp0
call .venv\Scripts\activate

pyinstaller --noconfirm --onedir --windowed ^
    --name "POS_Offline" ^
    --add-data "templates;templates" ^
    main.py

echo.
echo ==============================================
echo   DONG GOI HOAN TAT! THU MUC: dist\POS_Offline
echo ==============================================
pause
