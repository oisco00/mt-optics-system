#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/mt-optics}"
cd "$APP_DIR"
TARGET="${1:-HEAD~1}"
git reset --hard "$TARGET"
npm install --omit=dev --no-audit --no-fund
npm run check
pm2 restart mt-optics --update-env
pm2 save
curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null
echo "롤백 완료: $TARGET"
