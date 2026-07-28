@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ================================================
echo APPLY_FINAL_ENHANCEMENTS_V324_STABLE
echo ================================================
if not exist "frontend\app.js" (
  echo ERROR: mt-optics-system 루트 폴더에서 실행해야 합니다.
  echo 현재 위치에 frontend\app.js 가 없습니다.
  pause
  exit /b 1
)
if not exist "_patch_files\frontend\final-enhancements-v317.js" (
  echo ERROR: _patch_files 폴더가 없습니다. 압축을 다시 풀어 주세요.
  pause
  exit /b 1
)

findstr /I /C:"final-enhancements-v318" frontend\app.js >nul 2>nul
if not errorlevel 1 (
  echo ERROR: frontend\app.js still loads v318. 먼저 no24/V317 상태로 복구하세요.
  pause
  exit /b 1
)
findstr /I /C:"final-enhancements-v319" frontend\app.js >nul 2>nul
if not errorlevel 1 (
  echo ERROR: frontend\app.js still loads v319. 먼저 no24/V317 상태로 복구하세요.
  pause
  exit /b 1
)

set BACKUP_DIR=_backup\mt-optics-v324-stable-%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir "%BACKUP_DIR%" >nul 2>nul

copy /Y "frontend\final-enhancements-v317.js" "%BACKUP_DIR%\final-enhancements-v317.js" >nul 2>nul
copy /Y "frontend\assets\mt_stamp.png" "%BACKUP_DIR%\mt_stamp.png" >nul 2>nul
copy /Y "backend\src\finalEnhancements.js" "%BACKUP_DIR%\finalEnhancements.js" >nul 2>nul
if exist "deploy\github_update" copy /Y "deploy\github_update" "%BACKUP_DIR%\github_update" >nul 2>nul

copy /Y "_patch_files\frontend\final-enhancements-v317.js" "frontend\final-enhancements-v317.js" >nul || goto fail
copy /Y "_patch_files\frontend\assets\mt_stamp.png" "frontend\assets\mt_stamp.png" >nul || goto fail
copy /Y "_patch_files\backend\src\finalEnhancements.js" "backend\src\finalEnhancements.js" >nul || goto fail

if exist "deploy\github_update" (
  findstr /C:"MT_OPTICS_AUTO_RESTART_V324" "deploy\github_update" >nul 2>nul
  if errorlevel 1 (
    echo.>> "deploy\github_update"
    echo # MT_OPTICS_AUTO_RESTART_V324>> "deploy\github_update"
    echo echo "STEP: Restarting PM2 and reloading Nginx">> "deploy\github_update"
    echo pm2 restart mt-optics --update-env ^|^| true>> "deploy\github_update"
    echo pm2 save ^|^| true>> "deploy\github_update"
    echo sudo systemctl reload nginx ^|^| true>> "deploy\github_update"
  )
)

echo Checking JavaScript syntax...
node --check backend\src\finalEnhancements.js || goto fail
node --check frontend\final-enhancements-v317.js || goto fail

echo.
echo SUCCESS: V324 stable patch applied.
echo Backup: %BACKUP_DIR%
echo.
echo Next steps:
echo 1. GitHub Desktop: Commit / Push
echo 2. AWS: cd /var/www/mt-optics ^&^& bash ./deploy/github_update
echo 3. Browser: Ctrl+F5
pause
exit /b 0

:fail
echo ERROR: Apply failed or syntax check failed.
echo Backup: %BACKUP_DIR%
pause
exit /b 1
