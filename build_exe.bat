@echo off
echo ========================================================
echo   DANG DONG GOI POS MASTERCARE THANH BAN PORTABLE
echo ========================================================

cd /d %~dp0
call .venv\Scripts\activate

pyinstaller --noconfirm --onedir ^
    --name "POS_Mastercare" ^
    --icon "app_icon.ico" ^
    --add-data "templates;templates" ^
    --add-data "static;static" ^
    --hidden-import "passlib.handlers.bcrypt" ^
    --hidden-import "bcrypt" ^
    --hidden-import "uvicorn.logging" ^
    --hidden-import "uvicorn.loops" ^
    --hidden-import "uvicorn.loops.auto" ^
    --hidden-import "uvicorn.protocols" ^
    --hidden-import "uvicorn.protocols.http" ^
    --hidden-import "uvicorn.protocols.http.auto" ^
    --hidden-import "uvicorn.protocols.websockets" ^
    --hidden-import "uvicorn.protocols.websockets.auto" ^
    --hidden-import "uvicorn.lifespan" ^
    --hidden-import "uvicorn.lifespan.on" ^
    main.py

echo.
echo Dang chep data va ngrok vao thu muc Portable...
if not exist "dist\POS_Mastercare\data" mkdir "dist\POS_Mastercare\data"
copy "data\pos.db" "dist\POS_Mastercare\data\pos.db" /Y
copy "ngrok.exe" "dist\POS_Mastercare\ngrok.exe" /Y
copy "logo Mastercare.png" "dist\POS_Mastercare\logo Mastercare.png" /Y

echo.
echo ========================================================
echo   DONG GOI HOAN TAT! 
echo   Thu muc xuat ban: dist\POS_Mastercare
echo ========================================================
pause
