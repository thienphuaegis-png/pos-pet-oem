@echo off
chcp 65001 >nul
title POS MASTERCARE - CHAY TEST LOCAL 2 MAY CHU (8998 VA 8997)
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\share_online.py --dual-local
) else (
    python scripts\share_online.py --dual-local
)

start "" "http://127.0.0.1:8997"
start "" "http://127.0.0.1:8998"
pause
