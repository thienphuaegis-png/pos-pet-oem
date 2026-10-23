@echo off
chcp 65001 >nul
echo Dang dung toan bo may chu POS Mastercare va duong truyen online...
taskkill /F /IM POS_Mastercare.exe >nul 2>&1
echo [THANH CONG] Da tat sach se may chu POS!
timeout /t 2 >nul
