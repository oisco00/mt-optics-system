@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ================================================
echo APPLY_FINAL_ENHANCEMENTS_V315
echo ================================================
if not exist "frontend\app.js" (
  echo ERROR: Run this file in the mt-optics-system root folder.
  pause
  exit /b 1
)
set BACKUP_DIR=_backup\mt-optics-v315-%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir "%BACKUP_DIR%" >nul 2>nul
copy /Y "frontend\app.js" "%BACKUP_DIR%\frontend_app.js" >nul 2>nul
copy /Y "frontend\index.html" "%BACKUP_DIR%\frontend_index.html" >nul 2>nul
copy /Y "backend\src\finalEnhancements.js" "%BACKUP_DIR%\finalEnhancements.js" >nul 2>nul
copy /Y "backend\src\db.js" "%BACKUP_DIR%\db.js" >nul 2>nul

for %%F in (frontend\final-enhancements-v*.js) do if /I not "%%~nxF"=="final-enhancements-v315.js" del /Q "%%F" >nul 2>nul
for %%F in (frontend\postcode-kakao-v*.js) do if /I not "%%~nxF"=="postcode-kakao-v315.js" del /Q "%%F" >nul 2>nul
for %%F in (APPLY_FINAL_ENHANCEMENTS_V*.cmd) do if /I not "%%~nxF"=="APPLY_FINAL_ENHANCEMENTS_V315.cmd" del /Q "%%F" >nul 2>nul

echo Checking JavaScript syntax...
node --check backend\src\app.js || goto fail
node --check backend\src\db.js || goto fail
node --check backend\src\finalEnhancements.js || goto fail
node --check frontend\app.js || goto fail
node --check frontend\final-enhancements-v315.js || goto fail
node --check frontend\postcode-kakao-v315.js || goto fail

echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V315 check completed.
echo Backup: %BACKUP_DIR%
pause
exit /b 0
:fail
echo ERROR: Syntax check failed. Do not commit or upload this state.
pause
exit /b 1
