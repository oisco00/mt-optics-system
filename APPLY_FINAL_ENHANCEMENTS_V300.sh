#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=========================================================="
echo "MT옵틱스 FINAL V300 적용 점검"
echo "=========================================================="
rm -f frontend/final-enhancements-v210.js frontend/final-enhancements-v200.js
rm -f tools/apply-address-search-fix-v201.js tools/apply-address-search-fix-v212.js tools/apply-usability-enhancements-v210.js tools/apply-usability-enhancements-v211.js
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/excelImport.js
node --check backend/src/finalEnhancements.js
node --check frontend/app.js
node --check frontend/final-enhancements-v300.js
grep -q "final-enhancements-v300.js?v=300" frontend/app.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V300 최종 점검 완료"
