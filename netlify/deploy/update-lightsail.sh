#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/mt-optics}"
cd "$APP_DIR"

echo '[1/7] 현재 DB 백업'
if [[ -f .env ]]; then bash deploy/backup-db.sh || { echo '백업 실패로 배포 중단'; exit 1; }; fi

echo '[2/7] GitHub 최신 소스 받기'
git fetch origin main
git reset --hard origin/main

echo '[3/7] 환경·보안 사전점검'
node deploy/preflight.js

echo '[4/7] 패키지 설치'
npm install --omit=dev --no-audit --no-fund

echo '[5/7] 문법 검사'
npm run check

echo '[6/7] PM2 재시작'
pm2 restart mt-optics --update-env || pm2 start npm --name mt-optics -- start
pm2 save

echo '[7/7] 상태 확인'
sleep 3
curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null
sudo nginx -t
sudo systemctl reload nginx
echo 'MT옵틱스 업데이트 완료'
