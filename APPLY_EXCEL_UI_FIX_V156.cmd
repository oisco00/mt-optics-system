@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MT Optics Excel UI Fix v1.5.6
echo ==========================================
echo.

if not exist "tools\apply-excel-upload-ui-fix-v156.js" (
  echo ERROR: Patch file was not found.
  pause
  exit /b 1
)

node "tools\apply-excel-upload-ui-fix-v156.js"
if errorlevel 1 (
  echo ERROR: Patch was not applied.
  pause
  exit /b 1
)

node --check "frontend\app.js"
if errorlevel 1 (
  echo ERROR: frontend\app.js syntax check failed.
  pause
  exit /b 1
)

node --check "frontend\excel-upload-ui-fix.js"
if errorlevel 1 (
  echo ERROR: frontend\excel-upload-ui-fix.js syntax check failed.
  pause
  exit /b 1
)

echo.
echo SUCCESS: v1.5.6 applied and checked.
echo Check GitHub Desktop for frontend changes.
pause
exit /b 0
