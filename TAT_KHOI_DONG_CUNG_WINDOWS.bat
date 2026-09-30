@echo off
chcp 65001 >nul
echo ========================================================
echo   TAT KHOI DONG CUNG WINDOWS - POS MASTERCARE
echo ========================================================
echo.
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "POS_Mastercare" /f >nul 2>&1
echo [THANH CONG] Da tat tu dong khoi dong cung Windows.
echo.
pause
