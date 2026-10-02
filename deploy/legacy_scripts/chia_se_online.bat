@echo off
chcp 65001 >nul
title POS OFFLINE - CHIA SẺ TRUY CẬP ONLINE
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\share_online.py
) else (
    python scripts\share_online.py
)

if %errorlevel% neq 0 (
    echo.
    echo Dự phòng: Chạy trực tiếp qua cloudflared.exe...
    cloudflared.exe tunnel --protocol http2 --url http://127.0.0.1:8999
    pause
)
