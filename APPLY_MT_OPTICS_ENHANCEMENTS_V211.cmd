@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo MT옵틱스 v2.1.1 긴급복구 + 사용성·한글·미수금 고도화
echo ============================================================
echo.

if not exist "tools\apply-usability-enhancements-v211.js" (
  echo ERROR: tools\apply-usability-enhancements-v211.js 파일이 없습니다.
  echo ZIP 내용을 실제 GitHub 프로젝트 최상위 폴더에 압축 해제하세요.
  pause
  exit /b 1
)

node "tools\apply-usability-enhancements-v211.js"
if errorlevel 1 (
  echo.
  echo ERROR: v2.1.1 적용 또는 구문 점검에 실패했습니다.
  echo 화면의 오류 내용을 캡처해 전달해 주세요.
  pause
  exit /b 1
)

echo.
echo SUCCESS: v2.1.1 복구 및 전체 구문 점검이 완료되었습니다.
echo GitHub Desktop에서 변경 파일을 확인한 뒤 Commit / Push 하세요.
echo AWS 반영 후 브라우저에서 Ctrl+F5를 누르세요.
pause
exit /b 0
