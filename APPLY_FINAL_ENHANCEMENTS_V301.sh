#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "============================================================"
echo "MT Optics APPLY_FINAL_ENHANCEMENTS_V301"
echo "============================================================"
if [ ! -f backend/src/app.js ]; then
  echo "ERROR: backend/src/app.js was not found. Run in project root."
  exit 1
fi
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="_backup/mt-optics-v301-${STAMP}"
mkdir -p "$BACKUP"
cp -f backend/src/app.js "$BACKUP/backend-app.js" 2>/dev/null || true
cp -f backend/src/finalEnhancements.js "$BACKUP/finalEnhancements.js" 2>/dev/null || true
cp -f backend/src/db.js "$BACKUP/db.js" 2>/dev/null || true
cp -f backend/src/excelImport.js "$BACKUP/excelImport.js" 2>/dev/null || true
cp -f frontend/app.js "$BACKUP/frontend-app.js" 2>/dev/null || true
cp -f frontend/final-enhancements-v301.js "$BACKUP/final-enhancements-v301.js" 2>/dev/null || true
rm -f APPLY_MT_OPTICS_ENHANCEMENTS_V210.cmd APPLY_MT_OPTICS_ENHANCEMENTS_V211.cmd APPLY_FINAL_ENHANCEMENTS_V300.cmd APPLY_FINAL_ENHANCEMENTS_V300.sh
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check backend/src/excelImport.js
node --check frontend/app.js
node --check frontend/final-enhancements-v301.js
node --check netlify/functions/api.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V301 check completed. Backup: $BACKUP"
