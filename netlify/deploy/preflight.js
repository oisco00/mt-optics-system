const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const root = path.join(__dirname, '..');
const requiredFiles = [
  'package.json',
  'backend/src/app.js',
  'backend/src/db.js',
  'backend/src/server.js',
  'frontend/index.html',
  'frontend/app.js',
  'database/schema.sql'
];

const errors = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`필수 파일 없음: ${file}`);
}
if (!fs.existsSync(path.join(root, '.env'))) errors.push('.env 파일이 없습니다.');
if (!process.env.DB_PASSWORD) errors.push('DB_PASSWORD가 비어 있습니다.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('change-this')) errors.push('JWT_SECRET를 32자 이상 새 값으로 변경하세요.');
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 10 || process.env.ADMIN_PASSWORD === 'admin1234!') errors.push('ADMIN_PASSWORD를 10자 이상 새 값으로 변경하세요.');
if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')) errors.push('운영에서는 CORS_ORIGIN을 실제 HTTPS 도메인으로 지정하세요.');

if (errors.length) {
  console.error('배포 전 확인 실패:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log('배포 전 확인 통과');
