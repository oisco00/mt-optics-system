#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=============================================="
echo "APPLY_FINAL_ENHANCEMENTS_V317"
echo "=============================================="
if [ ! -f frontend/app.js ]; then
  echo "ERROR: Run this file in the mt-optics-system root folder."
  exit 1
fi
BACKUP_DIR="_backup/mt-optics-v317-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -f frontend/app.js "$BACKUP_DIR/frontend_app.js" 2>/dev/null || true
cp -f frontend/index.html "$BACKUP_DIR/frontend_index.html" 2>/dev/null || true
cp -f backend/src/finalEnhancements.js "$BACKUP_DIR/finalEnhancements.js" 2>/dev/null || true
find frontend -maxdepth 1 -name 'final-enhancements-v*.js' ! -name 'final-enhancements-v317.js' -delete
find frontend -maxdepth 1 -name 'postcode-kakao-v*.js' ! -name 'postcode-kakao-v317.js' -delete
find . -maxdepth 1 -name 'APPLY_FINAL_ENHANCEMENTS_V*.cmd' ! -name 'APPLY_FINAL_ENHANCEMENTS_V317.cmd' -delete
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check frontend/app.js
node --check frontend/final-enhancements-v317.js
node --check frontend/postcode-kakao-v317.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V317 check completed."
echo "Backup: $BACKUP_DIR"
