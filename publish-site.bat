@echo off
chcp 65001 >nul
title پلاسکو منیجینگ - گذاشتن نسخهٔ تازه روی سایت
cd /d "%~dp0"

echo.
echo   پلاسکو منیجینگ
echo   دارد نسخهٔ تازه را می‌سازد... چند ثانیه صبر کن و این پنجره را نبند.
echo.

call npm run build
if errorlevel 1 goto failed

set "SITEDIR=%TEMP%\plasco-site"
if exist "%SITEDIR%" rmdir /s /q "%SITEDIR%"
mkdir "%SITEDIR%"
xcopy "dist" "%SITEDIR%" /E /I /Q /Y /H >nul
type nul > "%SITEDIR%\.nojekyll"

cd /d "%SITEDIR%"
git init -q -b gh-pages
git add -A
git -c user.name="ezzaeskardi-afk" -c user.email="ezzaeskardi-afk@users.noreply.github.com" commit -q --allow-empty -m "انتشار تازه"
git remote remove origin >nul 2>&1
git remote add origin https://github.com/ezzaeskardi-afk/plasco_managing.git
git -c credential.helper="!gh auth git-credential" push -f origin gh-pages
if errorlevel 1 goto failed

echo.
echo   خوب شد! نسخهٔ تازه روی سایت رفت:
echo   https://ezzaeskardi-afk.github.io/plasco_managing/
echo.
echo   یکی-دو دقیقه بعد سایت به‌روز می‌شود. روی گوشی‌ها هم پیام
echo   «نسخهٔ تازهٔ برنامه آماده است» می‌آید و با «تازه کن» عوض می‌شود.
echo.
pause
exit /b 0

:failed
echo.
echo   نشد! این دو تا را چک کن:
echo   ۱) اینترنت وصل باشد.
echo   ۲) اگر باز هم نشد، به ایجنت بگو: «انتشار روی سایت کار نمی‌کند»
echo      تا خودش درستش کند.
echo.
pause
exit /b 1
