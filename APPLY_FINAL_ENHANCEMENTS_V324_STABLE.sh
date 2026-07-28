#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "================================================"
echo "APPLY_FINAL_ENHANCEMENTS_V324_STABLE"
echo "================================================"
[[ -f frontend/app.js ]] || { echo "ERROR: mt-optics-system 루트에서 실행하세요."; exit 1; }
[[ -f _patch_files/frontend/final-enhancements-v317.js ]] || { echo "ERROR: _patch_files 폴더가 없습니다."; exit 1; }

if grep -q "final-enhancements-v318\|final-enhancements-v319" frontend/app.js 2>/dev/null; then
  echo "ERROR: frontend/app.js still loads v318/v319. Restore to no24/v317 first."
  exit 1
fi

BACKUP_DIR="_backup/mt-optics-v324-stable-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -f frontend/final-enhancements-v317.js "$BACKUP_DIR/" 2>/dev/null || true
cp -f frontend/assets/mt_stamp.png "$BACKUP_DIR/" 2>/dev/null || true
cp -f backend/src/finalEnhancements.js "$BACKUP_DIR/" 2>/dev/null || true
cp -f deploy/github_update "$BACKUP_DIR/" 2>/dev/null || true

cp -f _patch_files/frontend/final-enhancements-v317.js frontend/final-enhancements-v317.js
cp -f _patch_files/frontend/assets/mt_stamp.png frontend/assets/mt_stamp.png
cp -f _patch_files/backend/src/finalEnhancements.js backend/src/finalEnhancements.js

if [[ -f deploy/github_update ]] && ! grep -q "MT_OPTICS_AUTO_RESTART_V324" deploy/github_update; then
  cat >> deploy/github_update <<'EOF'

# MT_OPTICS_AUTO_RESTART_V324
echo "STEP: Restarting PM2 and reloading Nginx"
pm2 restart mt-optics --update-env || true
pm2 save || true
sudo systemctl reload nginx || true
EOF
fi

node --check backend/src/finalEnhancements.js
node --check frontend/final-enhancements-v317.js

echo "SUCCESS: V324 stable patch applied."
echo "Backup: $BACKUP_DIR"
