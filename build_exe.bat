@echo off
echo ========================================================
echo   DANG DONG GOI POS MASTERCARE THANH BAN PORTABLE
echo ========================================================

cd /d %~dp0
call .venv\Scripts\activate

pyinstaller --noconfirm --onedir --noconsole ^
    --name "POS_Mastercare" ^
    --icon "app_icon.ico" ^
    --add-data "templates;templates" ^
    --add-data "static;static" ^
    --hidden-import "pystray" ^
    --hidden-import "pystray._win32" ^
    --hidden-import "PIL" ^
    --hidden-import "PIL.Image" ^
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
copy "app_icon.ico" "dist\POS_Mastercare\app_icon.ico" /Y
copy "HUONG_DAN_SU_DUNG.txt" "dist\POS_Mastercare\HUONG_DAN_SU_DUNG.txt" /Y
copy "BAT_KHOI_DONG_CUNG_WINDOWS.bat" "dist\POS_Mastercare\BAT_KHOI_DONG_CUNG_WINDOWS.bat" /Y
copy "TAT_KHOI_DONG_CUNG_WINDOWS.bat" "dist\POS_Mastercare\TAT_KHOI_DONG_CUNG_WINDOWS.bat" /Y
copy "TAT_MAY_CHU.bat" "dist\POS_Mastercare\TAT_MAY_CHU.bat" /Y
xcopy "templates" "dist\POS_Mastercare\templates\" /E /I /Y
xcopy "static" "dist\POS_Mastercare\static\" /E /I /Y

echo.
echo ========================================================
echo   DONG GOI HOAN TAT! 
echo   Thu muc xuat ban: dist\POS_Mastercare
echo ========================================================
pause
