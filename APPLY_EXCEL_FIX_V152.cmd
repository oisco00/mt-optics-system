@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo MT Optics Excel Upload Fix v1.5.2
echo ==========================================
echo.

if not exist "tools\apply-excel-upload-fix.js" (
  echo ERROR: tools\apply-excel-upload-fix.js was not found.
  echo Put this CMD file in the project root folder.
  echo.
  pause
  exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo.
  pause
  exit /b 1
)

node "tools\apply-excel-upload-fix.js"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo ERROR: The patch was not applied.
  echo.
  pause
  exit /b %RESULT%
)

echo SUCCESS: Patch command completed.
echo Check GitHub Desktop for backend\src\app.js changes.
echo.
pause
exit /b 0
