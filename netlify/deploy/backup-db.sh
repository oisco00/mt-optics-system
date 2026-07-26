#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/mt-optics}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mt-optics}"
cd "$APP_DIR"
set -a
source ./.env
set +a
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" | gzip > "$FILE"
chmod 600 "$FILE"
find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +14 -delete
printf '백업 완료: %s\n' "$FILE"
