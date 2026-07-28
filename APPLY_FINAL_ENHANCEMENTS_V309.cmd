@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo MT Optics APPLY_FINAL_ENHANCEMENTS_V309
echo ============================================================
echo Checking JavaScript syntax...
node --check backend\src\app.js || goto fail
node --check backend\src\db.js || goto fail
node --check backend\src\server.js || goto fail
node --check backend\src\finalEnhancements.js || goto fail
node --check backend\src\excelImport.js || goto fail
node --check tools\import-excel.js || goto fail
node --check netlify\functions\api.js || goto fail
node --check frontend\app.js || goto fail
node --check frontend\final-enhancements-v309.js || goto fail
node --check frontend\postcode-kakao-v309.js || goto fail
echo.
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V309 check completed.
echo Next: Commit and Push in GitHub Desktop, then run AWS update.
pause
exit /b 0
:fail
echo.
echo ERROR: JavaScript syntax check failed.
pause
exit /b 1
