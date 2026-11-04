@echo off
chcp 65001 >nul
title POS BAN SONG SONG (CONG 8997 + TEN MIEN CLOUDFLARE TAM)
cd /d "%~dp0"

set "POS_PORT=8997"
set "POS_DB_PATH=%~dp0data\pos_instance2.db"
set "POS_SIBLING_MODE=1"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

echo ======================================================================
echo   CHAY PHIEN BAN POS SONG SONG (KHONG DUNG CONG 8998/8999 VA DB CU)
echo   - Cong noi bo : http://127.0.0.1:8997
echo   - Database    : data\pos_instance2.db
echo   - Cloudflare  : Tu dong cap link https://*.trycloudflare.com
echo ======================================================================
echo.

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\share_online.py --sibling
) else (
    python scripts\share_online.py --sibling
)
pause
