@echo off
setlocal
cd /d "%~dp0"
node "tools\apply-excel-upload-ui-fix-v155.js"
if errorlevel 1 (
 echo ERROR: Patch failed.
 pause
 exit /b 1
)
node --check "frontend\app.js"
if errorlevel 1 (
 echo ERROR: frontend app syntax failed.
 pause
 exit /b 1
)
node --check "frontend\excel-upload-ui-fix.js"
if errorlevel 1 (
 echo ERROR: UI file syntax failed.
 pause
 exit /b 1
)
echo SUCCESS: v1.5.5 applied.
pause
