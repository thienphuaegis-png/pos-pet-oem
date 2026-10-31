@echo off
chcp 65001 >nul
title POS MASTERCARE - CHAY NGAM 2 MAY CHU (CONG 8998 VA 8997)
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\share_online.py --dual
) else (
    python scripts\share_online.py --dual
)
pause
