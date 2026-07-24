'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const appPath = path.join(projectRoot, 'backend', 'src', 'app.js');
const marker = 'MT_OPTICS_UPLOAD_FIX_V152';

function fail(message) {
  console.error(`\n[실패] ${message}`);
  console.error('원본 파일은 변경하지 않았습니다.');
  process.exit(1);
}

if (!fs.existsSync(appPath)) {
  fail(`다음 파일을 찾을 수 없습니다: ${appPath}\n패치를 MT옵틱스 프로젝트 최상위 폴더에 풀어 주세요.`);
}

const original = fs.readFileSync(appPath, 'utf8');
if (original.includes(marker)) {
  console.log('\n[확인] 엑셀 업로드 수정패치 v1.5.2가 이미 적용되어 있습니다.');
  process.exit(0);
}

let updated = original;

// 1) path 모듈 추가
if (!/const path = require\(['"]path['"]\);/.test(updated)) {
  updated = updated.replace(
    /const multer = require\(['"]multer['"]\);/,
    (match) => `${match}\nconst path = require('path');`
  );
}

// 2) 현재 v1.5 코드 형식의 기본 업로드 한도를 100MB로 변경
const maxPattern = /const MAX_EXCEL_FILE_MB\s*=\s*Math\.max\(Number\(process\.env\.MAX_EXCEL_FILE_MB\s*\|\|\s*\d+\),\s*1\);/;
if (!maxPattern.test(updated)) {
  fail('MAX_EXCEL_FILE_MB 설정을 찾지 못했습니다. backend/src/app.js 버전을 확인해 주세요.');
}
updated = updated.replace(
  maxPattern,
  `// ${marker}\nconst MAX_EXCEL_FILE_MB = Math.max(Number(process.env.MAX_EXCEL_FILE_MB || 100), 1);`
);

// 3) 한글 파일명 복구 함수 추가
if (!updated.includes('function normalizeUploadedFileName(')) {
  const cleanPattern = /function clean\(value\) \{[\s\S]*?\n\}/;
  const match = updated.match(cleanPattern);
  if (!match) fail('clean 함수 위치를 찾지 못했습니다.');
  const helper = `${match[0]}\n\n/** multipart 업로드 과정에서 latin1로 잘못 해석된 한글 파일명을 UTF-8로 복구합니다. */\nfunction normalizeUploadedFileName(value) {\n  const raw = path.basename(String(value || 'upload.xlsx').replace(/\\0/g, '')).normalize('NFC');\n  if (!raw) return 'upload.xlsx';\n  if (/[\\uAC00-\\uD7A3]/.test(raw)) return raw;\n  if (/[\\u0080-\\u00FF]/.test(raw)) {\n    const decoded = Buffer.from(raw, 'latin1').toString('utf8').normalize('NFC');\n    if (decoded && !decoded.includes('\\uFFFD') && /[\\uAC00-\\uD7A3]/.test(decoded)) return path.basename(decoded);\n  }\n  return raw;\n}`;
  updated = updated.replace(match[0], helper);
}

// 4) 확장자 확인, 오류 문구, DB 저장 파일명 모두 보정
updated = updated.replace(
  /const allowed = \/\\\.\(xls\|xlsx\)\$\/i\.test\(file\.originalname \|\| ''\);/,
  "const allowed = /\\.(xls|xlsx)$/i.test(normalizeUploadedFileName(file.originalname));"
);
updated = updated.replace(
  /`\$\{file\.originalname\}: 파일 내용이 올바른 Excel 형식이 아닙니다\.`/g,
  '`${normalizeUploadedFileName(file.originalname)}: 파일 내용이 올바른 Excel 형식이 아닙니다.`'
);
updated = updated.replace(
  /fileName:\s*file\.originalname,/g,
  'fileName: normalizeUploadedFileName(file.originalname),'
);

// 5) 기존 가져오기 이력도 표시 시 가능한 범위에서 복구
const batchOld = '  respond(res, rows);\n}));\n\napi.get(\'/imports/batches/:id/errors\'';
if (updated.includes(batchOld)) {
  updated = updated.replace(
    batchOld,
    "  respond(res, rows.map((row) => ({ ...row, file_name: normalizeUploadedFileName(row.file_name) })));\n}));\n\napi.get('/imports/batches/:id/errors'"
  );
}

// 6) Multer 오류를 사용자 친화적으로 변환
const errorPattern = /app\.use\(\(err, req, res, next\) => \{[\s\S]*?\n\}\);\n\nmodule\.exports = \{ app, initialize: initDb, apiRouter: api, hasPermission \};/;
if (!errorPattern.test(updated)) fail('공통 오류 처리 부분을 찾지 못했습니다.');
updated = updated.replace(errorPattern, `app.use((err, req, res, next) => {\n  let status = err.status || 500;\n  let message = err.message || '서버 오류가 발생했습니다.';\n  let details = err.details || undefined;\n\n  if (err instanceof multer.MulterError) {\n    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;\n    if (err.code === 'LIMIT_FILE_SIZE') {\n      message = \`엑셀 파일은 최대 \${MAX_EXCEL_FILE_MB}MB까지 업로드할 수 있습니다.\`;\n      details = { max_file_size_mb: MAX_EXCEL_FILE_MB };\n    } else {\n      message = \`파일 업로드 오류: \${err.message}\`;\n    }\n  }\n\n  if (status >= 500) console.error(err);\n  res.status(status).json({ ok: false, error: message, details });\n});\n\nmodule.exports = { app, initialize: initDb, apiRouter: api, hasPermission };`);

if (updated === original) fail('적용할 변경사항이 없습니다.');

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-optics-upload-fix-v152-'));
const backupPath = path.join(backupDir, 'app.js');
fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(appPath, updated, 'utf8');

const check = spawnSync(process.execPath, ['--check', appPath], { encoding: 'utf8' });
if (check.status !== 0) {
  fs.writeFileSync(appPath, original, 'utf8');
  console.error(check.stderr || check.stdout);
  fail(`문법검사에 실패하여 원본을 복원했습니다. 임시 백업: ${backupPath}`);
}

console.log('\n[완료] MT옵틱스 엑셀 업로드 수정패치 v1.5.2 적용 완료');
console.log(`- 수정 파일: ${appPath}`);
console.log('- 기본 엑셀 업로드 한도: 100MB');
console.log('- 한글 파일명 저장 및 표시 보정: 적용');
console.log(`- 원본 임시 백업: ${backupPath}`);
console.log('\n다음 작업: GitHub Desktop에서 backend/src/app.js를 포함하여 Commit → Push origin 하세요.');
