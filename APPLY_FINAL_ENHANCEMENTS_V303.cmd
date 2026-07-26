@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo APPLY_FINAL_ENHANCEMENTS_V303
echo ============================================================

if exist APPLY_FINAL_ENHANCEMENTS_V300.cmd del /f /q APPLY_FINAL_ENHANCEMENTS_V300.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V301.cmd del /f /q APPLY_FINAL_ENHANCEMENTS_V301.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V302.cmd del /f /q APPLY_FINAL_ENHANCEMENTS_V302.cmd >nul 2>nul
if exist frontend\final-enhancements-v300.js del /f /q frontend\final-enhancements-v300.js >nul 2>nul
if exist frontend\final-enhancements-v301.js del /f /q frontend\final-enhancements-v301.js >nul 2>nul
if exist frontend\final-enhancements-v302.js del /f /q frontend\final-enhancements-v302.js >nul 2>nul

if not exist backend\src\app.js (
  echo ERROR: backend\src\app.js not found.
  pause
  exit /b 1
)
if not exist frontend\final-enhancements-v303.js (
  echo ERROR: frontend\final-enhancements-v303.js not found.
  pause
  exit /b 1
)

node --check backend\src\app.js || goto FAIL
node --check backend\src\db.js || goto FAIL
node --check backend\src\finalEnhancements.js || goto FAIL
node --check backend\src\excelImport.js || goto FAIL
node --check frontend\app.js || goto FAIL
node --check frontend\final-enhancements-v303.js || goto FAIL
node --check netlify\functions\api.js || goto FAIL

echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V303 check completed.
echo Next: Commit and Push in GitHub Desktop, then run ./deploy/github_update on AWS.
pause
exit /b 0

:FAIL
echo ERROR: JavaScript syntax check failed.
pause
exit /b 1
