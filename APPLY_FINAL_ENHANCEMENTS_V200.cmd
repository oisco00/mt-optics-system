@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo MT Optics Final Enhancements v2.0
echo ============================================================
echo.

if not exist "tools\apply-final-enhancements-v200.js" (
  echo ERROR: tools\apply-final-enhancements-v200.js was not found.
  echo Extract the ZIP into the actual GitHub project root folder.
  pause
  exit /b 1
)

node "tools\apply-final-enhancements-v200.js"
if errorlevel 1 (
  echo.
  echo ERROR: The patch was not applied.
  pause
  exit /b 1
)

echo.
echo Checking JavaScript syntax...
node --check "backend\src\app.js"
if errorlevel 1 (
  echo ERROR: backend\src\app.js syntax check failed.
  pause
  exit /b 1
)

node --check "backend\src\finalEnhancements.js"
if errorlevel 1 (
  echo ERROR: backend\src\finalEnhancements.js syntax check failed.
  pause
  exit /b 1
)

node --check "frontend\app.js"
if errorlevel 1 (
  echo ERROR: frontend\app.js syntax check failed.
  pause
  exit /b 1
)

node --check "frontend\final-enhancements-v200.js"
if errorlevel 1 (
  echo ERROR: frontend\final-enhancements-v200.js syntax check failed.
  pause
  exit /b 1
)

echo.
echo SUCCESS: Final enhancements v2.0 applied and checked.
echo Open GitHub Desktop and confirm the changed files.
pause
exit /b 0
