@echo off
REM Build POS thanh 1 file .exe (--onedir) de chay tren may khac khong can cai Python.
REM Chay tu thu muc goc project: build.bat

cd /d "%~dp0"
call .venv\Scripts\activate.bat

pyinstaller --noconfirm --onedir --name POS ^
    --add-data "templates;templates" ^
    --add-data "static;static" ^
    --hidden-import passlib.handlers.bcrypt ^
    main.py

echo.
echo Build xong. File chay: dist\POS\POS.exe
echo Chay setup_autostart.bat MOT LAN de POS tu khoi dong cung Windows.
pause
