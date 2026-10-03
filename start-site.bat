@echo off
chcp 65001 >nul
title پلاسکو منیجینگ - باز کردن اپ
cd /d "%~dp0"

echo.
echo   پلاسکو منیجینگ
echo   در حال ساختن اپ... چند ثانیه صبر کن و این پنجره را نبند.
echo.

call npm run preview:file
if errorlevel 1 goto failed

echo.
echo   اپ ساخته شد و همین حالا در مرورگر باز می‌شود.
echo   اگر مرورگر باز نشد، فایل dist\preview.html را دوبار کلیک کن.
echo.

if "%~1"=="--no-open" exit /b 0
start "" "%~dp0dist\preview.html"
timeout /t 3 >nul
exit /b 0

:failed
echo.
echo   ساخت اپ انجام نشد.
echo   ۱) مطمئن شو Node.js نصب است (از سایت nodejs.org نصب کن).
echo   ۲) یک بار دیگر همین فایل را دوبار کلیک کن.
echo.
pause
exit /b 1
