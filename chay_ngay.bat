@echo off
cd /d %~dp0
echo Dang don dep cac tien trinh cu tren cong 8999...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8999" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Khoi dong he thong POS Offline tren cong 8999...
.venv\Scripts\python main.py
pause