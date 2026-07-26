@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
echo ==========================================================
echo APPLY_FINAL_ENHANCEMENTS_V304
echo ==========================================================

if not exist backend\src\app.js (
  echo ERROR: Run this file from the mt-optics project root.
  pause
  exit /b 1
)

if exist APPLY_FINAL_ENHANCEMENTS_V300.cmd del /q APPLY_FINAL_ENHANCEMENTS_V300.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V301.cmd del /q APPLY_FINAL_ENHANCEMENTS_V301.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V302.cmd del /q APPLY_FINAL_ENHANCEMENTS_V302.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V303.cmd del /q APPLY_FINAL_ENHANCEMENTS_V303.cmd >nul 2>nul
if exist frontend\final-enhancements-v300.js del /q frontend\final-enhancements-v300.js >nul 2>nul
if exist frontend\final-enhancements-v301.js del /q frontend\final-enhancements-v301.js >nul 2>nul
if exist frontend\final-enhancements-v302.js del /q frontend\final-enhancements-v302.js >nul 2>nul
if exist frontend\final-enhancements-v303.js del /q frontend\final-enhancements-v303.js >nul 2>nul

echo Checking JavaScript syntax...
node --check backend/src/app.js || goto FAIL
node --check backend/src/db.js || goto FAIL
node --check backend/src/finalEnhancements.js || goto FAIL
node --check backend/src/excelImport.js || goto FAIL
node --check frontend/app.js || goto FAIL
node --check frontend/final-enhancements-v304.js || goto FAIL
if exist netlify\functions\api.js node --check netlify/functions/api.js || goto FAIL

echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V304 check completed.
echo Next: Commit and Push in GitHub Desktop, then run AWS update.
pause
exit /b 0

:FAIL
echo ERROR: Syntax check failed. Do not commit or push.
pause
exit /b 1
