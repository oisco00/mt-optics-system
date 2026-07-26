@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo APPLY_FINAL_ENHANCEMENTS_V306
echo ============================================================
if not exist backend\src\app.js (
  echo ERROR: Run this file from mt-optics project root.
  pause
  exit /b 1
)
if not exist _backup mkdir _backup
set TS=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
set BK=_backup\mt-optics-v306-%TS%
mkdir "%BK%" 2>nul
copy backend\src\app.js "%BK%\app.js" >nul 2>nul
copy frontend\app.js "%BK%\frontend_app.js" >nul 2>nul
copy frontend\index.html "%BK%\frontend_index.html" >nul 2>nul
for %%F in (frontend\final-enhancements-v300.js frontend\final-enhancements-v301.js frontend\final-enhancements-v302.js frontend\final-enhancements-v303.js frontend\final-enhancements-v304.js frontend\final-enhancements-v305.js) do if exist %%F del /q %%F >nul 2>nul
for %%F in (APPLY_FINAL_ENHANCEMENTS_V300.cmd APPLY_FINAL_ENHANCEMENTS_V301.cmd APPLY_FINAL_ENHANCEMENTS_V302.cmd APPLY_FINAL_ENHANCEMENTS_V303.cmd APPLY_FINAL_ENHANCEMENTS_V304.cmd APPLY_FINAL_ENHANCEMENTS_V305.cmd) do if exist %%F del /q %%F >nul 2>nul
echo Checking JavaScript syntax...
node --check backend/src/app.js || goto FAIL
node --check backend/src/db.js || goto FAIL
node --check backend/src/finalEnhancements.js || goto FAIL
node --check backend/src/excelImport.js || goto FAIL
node --check frontend/app.js || goto FAIL
node --check frontend/final-enhancements-v306.js || goto FAIL
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V306 check completed.
echo Next: Commit and Push in GitHub Desktop, then run bash ./deploy/github_update on AWS.
pause
exit /b 0
:FAIL
echo ERROR: Syntax check failed.
pause
exit /b 1
