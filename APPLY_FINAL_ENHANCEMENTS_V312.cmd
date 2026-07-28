@echo off
setlocal
echo APPLY_FINAL_ENHANCEMENTS_V312 check...
if not exist package.json ( echo ERROR: run in mt-optics-system root & pause & exit /b 1 )
node --check backend\src\app.js || goto fail
node --check backend\src\db.js || goto fail
node --check backend\src\finalEnhancements.js || goto fail
node --check backend\src\excelImport.js || goto fail
node --check frontend\app.js || goto fail
node --check frontend\final-enhancements-v312.js || goto fail
node --check frontend\postcode-kakao-v312.js || goto fail
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V312 check completed.
pause
exit /b 0
:fail
echo ERROR: syntax check failed.
pause
exit /b 1
