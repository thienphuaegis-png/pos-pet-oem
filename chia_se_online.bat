@echo off
chcp 65001 >nul
title POS OFFLINE - CHIA SẺ TRUY CẬP TỪ XA (CLOUDFLARE TUNNEL)
cd /d "%~dp0"

echo ======================================================================
echo    POS OFFLINE - TAO DUONG LINK CHO NGUOI KHAC TRUY CAP VAO TEST
echo ======================================================================
echo.
echo  1. Hay dam bao ban da bat "chay_ngay.bat" truoc!
echo  2. He thong dang khoi tao duong dan HTTPS truc tiep qua Cloudflare...
echo  3. Tim dong chu co dang:
echo     https://xxxx-xxxx-xxxx.trycloudflare.com
echo  4. Copy link do gui cho nguoi khac de ho vao thao tac truc tiep.
echo  5. KHONG DONG cua so nay neu muon duy tri ket noi cho ho test.
echo ======================================================================
echo.

cloudflared.exe tunnel --protocol http2 --url http://127.0.0.1:8999

pause
