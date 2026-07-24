'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const appPath = path.join(projectRoot, 'backend', 'src', 'app.js');
const marker = 'MT_OPTICS_UPLOAD_FIX_V151';

function fail(message) {
  console.error(`\n[실패] ${message}`);
  console.error('원본 파일은 변경하지 않았습니다.');
  process.exit(1);
}

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) fail(`${label} 위치를 찾지 못했습니다. 현재 app.js 버전을 확인해 주세요.`);
  return source.replace(oldText, newText);
}

if (!fs.existsSync(appPath)) {
  fail(`다음 파일을 찾을 수 없습니다: ${appPath}\n이 패치를 MT옵틱스 프로젝트 최상위 폴더에 풀어 주세요.`);
}

const original = fs.readFileSync(appPath, 'utf8');
if (original.includes(marker)) {
  console.log('\n[확인] 엑셀 업로드 수정패치 v1.5.1이 이미 적용되어 있습니다.');
  process.exit(0);
}

let updated = original;

updated = replaceOnce(
  updated,
  "const multer = require('multer');",
  "const multer = require('multer');\nconst path = require('path');",
  'path 모듈 추가'
);

const uploadLinePattern = /^const upload = multer\(\{ storage: multer\.memoryStorage\(\), limits: \{ fileSize: .*?, files: \d+ \} \}\);$/m;
if (!uploadLinePattern.test(updated)) {
  fail('Multer 업로드 용량 설정을 찾지 못했습니다.');
}
updated = updated.replace(
  uploadLinePattern,
  `// ${marker}\nconst MAX_EXCEL_FILE_MB = 100;\nconst upload = multer({\n  storage: multer.memoryStorage(),\n  limits: { fileSize: MAX_EXCEL_FILE_MB * 1024 * 1024, files: 1 }\n});`
);

const cleanFunction = `function clean(value) {\n  if (value === undefined || value === null) return null;\n  const trimmed = String(value).trim();\n  return trimmed === '' ? null : trimmed;\n}`;

const filenameFunction = `${cleanFunction}\n\n/**\n * Windows/Chrome에서 multipart 파일명이 latin1로 잘못 해석되어\n * '거래처 정보.xls'가 'ê±°ëž˜ì²˜ ...'처럼 표시되는 현상을 복구합니다.\n */\nfunction normalizeUploadedFileName(value) {\n  const originalName = path.basename(String(value || 'upload.xlsx').replace(/\\0/g, '')).normalize('NFC');\n  if (!originalName) return 'upload.xlsx';\n\n  // 이미 정상 한글이면 그대로 사용합니다.\n  if (/[\\uAC00-\\uD7A3]/.test(originalName)) return originalName;\n\n  // Busboy/Multer가 UTF-8 바이트를 latin1로 해석한 경우에만 복구합니다.\n  if (/[\\u0080-\\u00FF]/.test(originalName)) {\n    const decoded = Buffer.from(originalName, 'latin1').toString('utf8').normalize('NFC');\n    if (decoded && !decoded.includes('\\uFFFD') && /[\\uAC00-\\uD7A3]/.test(decoded)) {\n      return path.basename(decoded);\n    }\n  }\n\n  return originalName;\n}`;

updated = replaceOnce(updated, cleanFunction, filenameFunction, '한글 파일명 변환 함수 추가');

const batchResponseOld = `  respond(res, rows);\n}));\n\napi.get('/imports/batches/:id/errors'`;
const batchResponseNew = `  respond(res, rows.map((row) => ({\n    ...row,\n    file_name: normalizeUploadedFileName(row.file_name)\n  })));\n}));\n\napi.get('/imports/batches/:id/errors'`;
updated = replaceOnce(updated, batchResponseOld, batchResponseNew, '기존 가져오기 이력 파일명 표시 보정');

updated = replaceOnce(
  updated,
  '      fileName: file.originalname,',
  '      fileName: normalizeUploadedFileName(file.originalname),',
  '신규 업로드 파일명 저장 보정'
);

const errorMiddlewarePattern = /app\.use\(\(err, req, res, next\) => \{[\s\S]*?\n\}\);\n\nmodule\.exports = \{ app, initialize: initDb, apiRouter: api, hasPermission \};/;
if (!errorMiddlewarePattern.test(updated)) {
  fail('공통 오류 처리 부분을 찾지 못했습니다.');
}

const errorMiddlewareReplacement = `app.use((err, req, res, next) => {\n  let status = err.status || 500;\n  let message = err.message || '서버 오류가 발생했습니다.';\n  let details = err.details || undefined;\n\n  if (err instanceof multer.MulterError) {\n    if (err.code === 'LIMIT_FILE_SIZE') {\n      status = 413;\n      message = \`엑셀 파일은 최대 \${MAX_EXCEL_FILE_MB}MB까지 업로드할 수 있습니다.\`;\n      details = { max_file_size_mb: MAX_EXCEL_FILE_MB };\n    } else if (err.code === 'LIMIT_FILE_COUNT') {\n      status = 400;\n      message = '엑셀 파일은 한 번에 1개씩 업로드해 주세요.';\n    } else {\n      status = 400;\n      message = \`파일 업로드 오류: \${err.message}\`;\n    }\n  }\n\n  if (status >= 500) console.error(err);\n  res.status(status).json({\n    ok: false,\n    error: message,\n    details\n  });\n});\n\nmodule.exports = { app, initialize: initDb, apiRouter: api, hasPermission };`;

updated = updated.replace(errorMiddlewarePattern, errorMiddlewareReplacement);

if (updated === original) fail('적용할 변경사항이 없습니다.');

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-optics-upload-fix-'));
const backupPath = path.join(backupDir, 'app.js');
fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(appPath, updated, 'utf8');

const check = spawnSync(process.execPath, ['--check', appPath], { encoding: 'utf8' });
if (check.status !== 0) {
  fs.writeFileSync(appPath, original, 'utf8');
  console.error(check.stderr || check.stdout);
  fail(`문법검사에 실패하여 원본을 복원했습니다. 임시 백업: ${backupPath}`);
}

console.log('\n[완료] MT옵틱스 엑셀 업로드 수정패치 v1.5.1 적용 완료');
console.log(`- 수정 파일: ${appPath}`);
console.log('- 엑셀 최대 업로드 용량: 100MB');
console.log('- 한글 파일명 저장 및 표시 보정: 적용');
console.log('- File too large 오류 메시지 한글화: 적용');
console.log(`- 원본 임시 백업: ${backupPath}`);
console.log('\n다음 작업: GitHub Desktop에서 Changes를 확인하고 Commit → Push origin 하세요.');
