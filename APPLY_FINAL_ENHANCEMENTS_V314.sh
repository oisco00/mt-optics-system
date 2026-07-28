#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "APPLY_FINAL_ENHANCEMENTS_V314 check..."
for v in 300 301 302 303 304 305 306 307 308 309 310 311 312 313; do
  rm -f "frontend/final-enhancements-v${v}.js" "APPLY_FINAL_ENHANCEMENTS_V${v}.cmd"
done
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v314-core.js
node --check frontend/final-enhancements-v314.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V314 check completed."
