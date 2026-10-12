@echo off
chcp 65001 >nul
title KET NOI ONLINE CLOUDFLARE - BANG THONG KHONG GIOI HAN
echo ======================================================================
echo    KET NOI ONLINE POS QUA CLOUDFLARE TUNNEL (MIEN PHI - VO HAN DUNG LUONG)
echo ======================================================================
echo.
echo Dang tat cac tien trinh cu...
taskkill /F /IM cloudflared.exe >nul 2>&1
echo.
echo [1/2] Dang khoi tao duong truyen Cloudflare cho cong 8998...
echo [2/2] Duong link truy cap online (https://*.trycloudflare.com) se hien ben duoi:
echo.
cloudflared.exe tunnel --url http://127.0.0.1:8998
pause
