@echo off
chcp 65001 >nul
title KET NOI ONLINE CLOUDFLARE - TEN MIEN TAM (*.trycloudflare.com)
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" scripts\share_online.py %*
) else (
    python scripts\share_online.py %*
)
pause
