@echo off
setlocal
echo APPLY_FINAL_ENHANCEMENTS_V314 check...
if not exist package.json ( echo ERROR: run in mt-optics-system root & pause & exit /b 1 )
for %%V in (300 301 302 303 304 305 306 307 308 309 310 311 312 313) do (
  if exist frontend\final-enhancements-v%%V.js del /q frontend\final-enhancements-v%%V.js
  if exist APPLY_FINAL_ENHANCEMENTS_V%%V.cmd del /q APPLY_FINAL_ENHANCEMENTS_V%%V.cmd
)
node --check backend\src\app.js || goto fail
node --check backend\src\db.js || goto fail
node --check backend\src\finalEnhancements.js || goto fail
node --check backend\src\excelImport.js || goto fail
node --check frontend\app.js || goto fail
node --check frontend\final-enhancements-v314-core.js || goto fail
node --check frontend\final-enhancements-v314.js || goto fail
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V314 check completed.
pause
exit /b 0
:fail
echo ERROR: syntax check failed.
pause
exit /b 1
