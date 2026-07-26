#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v305.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V305 check completed."
