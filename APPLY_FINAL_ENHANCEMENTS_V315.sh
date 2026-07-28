#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "APPLY_FINAL_ENHANCEMENTS_V315"
[ -f frontend/app.js ] || { echo "ERROR: run in mt-optics-system root"; exit 1; }
backup="_backup/mt-optics-v315-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup"
cp -f frontend/app.js "$backup/frontend_app.js" 2>/dev/null || true
cp -f frontend/index.html "$backup/frontend_index.html" 2>/dev/null || true
cp -f backend/src/finalEnhancements.js "$backup/finalEnhancements.js" 2>/dev/null || true
cp -f backend/src/db.js "$backup/db.js" 2>/dev/null || true
find frontend -maxdepth 1 -name 'final-enhancements-v*.js' ! -name 'final-enhancements-v315.js' -delete
find frontend -maxdepth 1 -name 'postcode-kakao-v*.js' ! -name 'postcode-kakao-v315.js' -delete
find . -maxdepth 1 -name 'APPLY_FINAL_ENHANCEMENTS_V*.cmd' ! -name 'APPLY_FINAL_ENHANCEMENTS_V315.cmd' -delete
node --check backend/src/app.js
node --check backend/src/db.js
node --check backend/src/finalEnhancements.js
node --check frontend/app.js
node --check frontend/final-enhancements-v315.js
node --check frontend/postcode-kakao-v315.js
echo "SUCCESS: APPLY_FINAL_ENHANCEMENTS_V315 check completed."
echo "Backup: $backup"
