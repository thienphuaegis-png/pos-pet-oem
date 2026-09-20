@echo off
REM Chay MOT LAN sau khi build xong, tren MAY DICH (may lam chu POS).
REM Tao shortcut trong Startup folder de POS.exe tu chay khi bat may, khong can bam gi.

set TARGET=%~dp0dist\POS\POS.exe
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

if not exist "%TARGET%" (
    echo Khong tim thay %TARGET% - hay chay build.bat truoc.
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\POS.lnk'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0dist\POS'; $s.Save()"

echo Da tao shortcut tu khoi dong: %STARTUP%\POS.lnk
echo Lan sau bat may, POS se tu chay ngam - mo trinh duyet vao http://localhost:8999

echo.
echo Mo firewall cho may khac trong LAN truy cap (can quyen Admin, chi can chay 1 lan):
echo   netsh advfirewall firewall add rule name="POS App" dir=in action=allow protocol=TCP localport=8999
pause
