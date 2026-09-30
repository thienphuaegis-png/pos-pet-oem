@echo off
chcp 65001 >nul
title POS Server + Online Ngrok Tunnel
echo ========================================================
echo     ⚡ HỆ THỐNG POS PETCARE - MÁY CHỦ + ONLINE NGROK
echo ========================================================
echo.
echo Link truy cap co dinh tu xa:
echo https://womb-jitters-outfit.ngrok-free.dev
echo.
echo [1/2] Dang kiem tra may chu POS noi bo (Port 8998)...

powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8998/api/ping' -UseBasicParsing -TimeoutSec 2; Write-Host '   -> May chu POS dang chay tot!' -ForegroundColor Green } catch { Write-Host '   -> May chu POS chua bat, dang khoi dong...' -ForegroundColor Yellow; Start-Process -FilePath 'chay_ngay.bat' -WindowStyle Minimized }"

timeout /t 3 >nul

echo.
echo [2/2] Dang khoi chay duong truyen Ngrok co dinh...
echo.
echo Chu y: Giu cua so nay de duy tri ket noi online!
echo.

ngrok.exe http 8998 --url=womb-jitters-outfit.ngrok-free.dev
pause
