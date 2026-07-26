#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "APPLY_FINAL_ENHANCEMENTS_V303"
rm -f APPLY_FINAL_ENHANCEMENTS_V300.cmd APPLY_FINAL_ENHANCEMENTS_V301.cmd APPLY_FINAL_ENHANCEMENTS_V302.cmd || true
rm -f frontend/final-enhancements-v300.js frontend/final-enhancements-v301.js frontend/final-enhancements-v302.js || true
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v303.js
node --check netlify/functions/api.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V303 check completed."
