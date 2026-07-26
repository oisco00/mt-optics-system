@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo APPLY_FINAL_ENHANCEMENTS_V305
echo ============================================================
if not exist backend\src\app.js (
  echo ERROR: Run this file from mt-optics project root.
  pause
  exit /b 1
)
if not exist _backup mkdir _backup
set TS=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
set BK=_backup\mt-optics-v305-%TS%
mkdir "%BK%" 2>nul
copy backend\src\app.js "%BK%\app.js" >nul
copy frontend\app.js "%BK%\frontend_app.js" >nul
if exist frontend\final-enhancements-v304.js del /q frontend\final-enhancements-v304.js >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V300.cmd del /q APPLY_FINAL_ENHANCEMENTS_V300.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V301.cmd del /q APPLY_FINAL_ENHANCEMENTS_V301.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V302.cmd del /q APPLY_FINAL_ENHANCEMENTS_V302.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V303.cmd del /q APPLY_FINAL_ENHANCEMENTS_V303.cmd >nul 2>nul
if exist APPLY_FINAL_ENHANCEMENTS_V304.cmd del /q APPLY_FINAL_ENHANCEMENTS_V304.cmd >nul 2>nul
echo Checking JavaScript syntax...
node --check backend/src/app.js || goto FAIL
node --check backend/src/db.js || goto FAIL
node --check backend/src/finalEnhancements.js || goto FAIL
node --check backend/src/excelImport.js || goto FAIL
node --check frontend/app.js || goto FAIL
node --check frontend/final-enhancements-v305.js || goto FAIL
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V305 check completed.
echo Next: Commit and Push in GitHub Desktop, then run bash ./deploy/github_update on AWS.
pause
exit /b 0
:FAIL
echo ERROR: Syntax check failed.
pause
exit /b 1
