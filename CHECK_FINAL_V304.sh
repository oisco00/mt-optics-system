#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "APPLY_FINAL_ENHANCEMENTS_V304 server-side check"
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v304.js
[ -f netlify/functions/api.js ] && node --check netlify/functions/api.js || true
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V304 check completed."
