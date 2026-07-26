#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v306.js
echo "SUCCESS: V306 syntax check completed."
