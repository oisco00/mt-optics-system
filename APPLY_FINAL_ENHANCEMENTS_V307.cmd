@echo off
setlocal ENABLEEXTENSIONS
cd /d "%~dp0"

echo ============================================================
echo APPLY_FINAL_ENHANCEMENTS_V307
echo ============================================================

if not exist "frontend\postcode-kakao-v307.js" (
  echo ERROR: frontend\postcode-kakao-v307.js not found.
  pause
  exit /b 1
)
if not exist "frontend\final-enhancements-v307.js" (
  echo ERROR: frontend\final-enhancements-v307.js not found.
  pause
  exit /b 1
)

del /q "frontend\final-enhancements-v300.js" 2>nul
del /q "frontend\final-enhancements-v301.js" 2>nul
del /q "frontend\final-enhancements-v302.js" 2>nul
del /q "frontend\final-enhancements-v303.js" 2>nul
del /q "frontend\final-enhancements-v304.js" 2>nul
del /q "frontend\final-enhancements-v305.js" 2>nul
del /q "frontend\final-enhancements-v306.js" 2>nul

echo Checking JavaScript syntax...
node --check backend/src/app.js || goto FAIL
node --check backend/src/db.js || goto FAIL
node --check backend/src/server.js || goto FAIL
node --check backend/src/excelImport.js || goto FAIL
node --check backend/src/finalEnhancements.js || goto FAIL
node --check frontend/postcode-kakao-v307.js || goto FAIL
node --check frontend/final-enhancements-v307.js || goto FAIL
node --check frontend/app.js || goto FAIL
node --check netlify/functions/api.js || goto FAIL

echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V307 check completed.
echo Commit and push this folder, then run on AWS:
echo   cd /var/www/mt-optics
echo   bash ./deploy/github_update
pause
exit /b 0

:FAIL
echo ERROR: V307 check failed.
pause
exit /b 1
