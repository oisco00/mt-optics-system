@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>nul
title MT Optics FINAL V301
cls
echo ============================================================
echo MT Optics APPLY_FINAL_ENHANCEMENTS_V301
echo ============================================================
echo.
set "ROOT=%~dp0"
pushd "%ROOT%" || (
  echo ERROR: Cannot enter project folder.
  pause
  exit /b 1
)

if not exist "backend\src\app.js" (
  echo ERROR: backend\src\app.js was not found.
  echo Run this file in the mt-optics project root folder.
  pause
  exit /b 1
)

for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format yyyyMMddHHmmss" 2^>nul') do set "STAMP=%%I"
if not defined STAMP set "STAMP=%RANDOM%%RANDOM%"
set "BACKUP=_backup\mt-optics-v301-%STAMP%"
mkdir "%BACKUP%" >nul 2>nul

echo [1/5] Backup current core files...
if exist "backend\src\app.js" copy /Y "backend\src\app.js" "%BACKUP%\backend-app.js" >nul
if exist "backend\src\finalEnhancements.js" copy /Y "backend\src\finalEnhancements.js" "%BACKUP%\finalEnhancements.js" >nul
if exist "backend\src\db.js" copy /Y "backend\src\db.js" "%BACKUP%\db.js" >nul
if exist "backend\src\excelImport.js" copy /Y "backend\src\excelImport.js" "%BACKUP%\excelImport.js" >nul
if exist "frontend\app.js" copy /Y "frontend\app.js" "%BACKUP%\frontend-app.js" >nul
if exist "frontend\final-enhancements-v301.js" copy /Y "frontend\final-enhancements-v301.js" "%BACKUP%\final-enhancements-v301.js" >nul

echo [2/5] Remove old apply scripts to avoid version confusion...
for %%F in (APPLY_MT_OPTICS_ENHANCEMENTS_V210.cmd APPLY_MT_OPTICS_ENHANCEMENTS_V211.cmd APPLY_FINAL_ENHANCEMENTS_V300.cmd APPLY_FINAL_ENHANCEMENTS_V300.sh) do (
  if exist "%%F" del /F /Q "%%F" >nul 2>nul
)

echo [3/5] Check required V301 files...
if not exist "frontend\final-enhancements-v301.js" (
  echo ERROR: frontend\final-enhancements-v301.js was not found.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js or open a terminal where node is available.
  pause
  exit /b 1
)

echo [4/5] JavaScript syntax check...
node --check "backend\src\app.js" || goto FAIL
node --check "backend\src\db.js" || goto FAIL
node --check "backend\src\finalEnhancements.js" || goto FAIL
node --check "backend\src\excelImport.js" || goto FAIL
node --check "frontend\app.js" || goto FAIL
node --check "frontend\final-enhancements-v301.js" || goto FAIL
node --check "netlify\functions\api.js" || goto FAIL

echo [5/5] Done.
echo.
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V301 check completed.
echo Backup folder: %BACKUP%
echo.
echo Next steps:
echo 1. Commit and Push in GitHub Desktop.
echo 2. On AWS run:
echo    cd /var/www/mt-optics
echo    ./deploy/github_update
echo 3. In browser press Ctrl + F5.
echo.
pause
exit /b 0

:FAIL
echo.
echo ERROR: JavaScript syntax check failed. Do not Push to GitHub.
echo Backup folder: %BACKUP%
pause
exit /b 1
