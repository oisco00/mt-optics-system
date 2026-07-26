@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"
echo ==========================================================
echo MT옵틱스 FINAL V300 적용 점검
echo ==========================================================
echo.
echo [0/3] 이전 패치 파일 정리
if exist frontend\final-enhancements-v210.js del /q frontend\final-enhancements-v210.js > nul 2> nul
if exist frontend\final-enhancements-v200.js del /q frontend\final-enhancements-v200.js > nul 2> nul
if exist tools\apply-address-search-fix-v201.js del /q tools\apply-address-search-fix-v201.js > nul 2> nul
if exist tools\apply-address-search-fix-v212.js del /q tools\apply-address-search-fix-v212.js > nul 2> nul
if exist tools\apply-usability-enhancements-v210.js del /q tools\apply-usability-enhancements-v210.js > nul 2> nul
if exist tools\apply-usability-enhancements-v211.js del /q tools\apply-usability-enhancements-v211.js > nul 2> nul

echo [1/3] 필수 파일 확인
if not exist backend\src\app.js goto missing
if not exist backend\src\finalEnhancements.js goto missing
if not exist frontend\app.js goto missing
if not exist frontend\final-enhancements-v300.js goto missing

echo [2/3] JavaScript 구문 점검
node --check backend\src\app.js || goto fail
node --check backend\src\db.js || goto fail
node --check backend\src\excelImport.js || goto fail
node --check backend\src\finalEnhancements.js || goto fail
node --check frontend\app.js || goto fail
node --check frontend\final-enhancements-v300.js || goto fail

echo [3/3] V300 파일 적용 확인
findstr /C:"final-enhancements-v300.js?v=300" frontend\app.js > nul || goto fail
findstr /C:"APPLY_FINAL_ENHANCEMENTS_V300" frontend\final-enhancements-v300.js > nul || goto fail

echo.
echo SUCCESS: APPLY_FINAL_ENHANCEMENTS_V300 최종 점검이 완료되었습니다.
echo 다음 작업: GitHub Desktop에서 Commit 후 Push origin 하세요.
echo AWS 작업 폴더: /var/www/mt-optics
echo AWS 갱신: cd /var/www/mt-optics ^&^& ./deploy/github_update
goto end

:missing
echo ERROR: 현재 폴더가 MT옵틱스 프로젝트 최상위가 아니거나 필수 파일이 없습니다.
goto end

:fail
echo ERROR: V300 점검 중 오류가 발생했습니다. 위 오류 메시지를 확인하세요.
goto end

:end
pause
