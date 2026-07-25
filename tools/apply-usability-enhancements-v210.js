const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const backendApp = path.join(projectRoot, 'backend', 'src', 'app.js');
const excelImport = path.join(projectRoot, 'backend', 'src', 'excelImport.js');
const backendModule = path.join(projectRoot, 'backend', 'src', 'finalEnhancements.js');
const textEncodingModule = path.join(projectRoot, 'backend', 'src', 'textEncoding.js');
const frontendApp = path.join(projectRoot, 'frontend', 'app.js');
const frontendModule = path.join(
  projectRoot,
  'frontend',
  'final-enhancements-v210.js'
);

const requiredFiles = [
  backendApp,
  excelImport,
  backendModule,
  textEncodingModule,
  frontendApp,
  frontendModule
];

function fail(message) {
  console.error(`[실패] ${message}`);
  console.error('원본 파일은 변경하지 않았습니다.');
  process.exit(1);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    fail(`필요한 파일을 찾을 수 없습니다: ${file}\nZIP 내용을 실제 GitHub 작업 폴더 최상위에 풀었는지 확인하세요.`);
  }
}

function ensureRequire(source, anchor, statement, label) {
  if (source.includes(statement)) return source;
  if (!source.includes(anchor)) {
    fail(`${label}의 기준 구문을 찾지 못했습니다: ${anchor}`);
  }
  return source.replace(anchor, `${anchor}\n${statement}`);
}

function timestamp() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

let backendSource = fs.readFileSync(backendApp, 'utf8');
let excelSource = fs.readFileSync(excelImport, 'utf8');
let frontendSource = fs.readFileSync(frontendApp, 'utf8');

const excelImportRequire =
  "const { importExcelBuffer } = require('./excelImport');";
const encodingRequire =
  "const { normalizeUploadedFileName } = require('./textEncoding');";
const finalRequire =
  "const { createFinalEnhancementsRouter } = require('./finalEnhancements');";

backendSource = ensureRequire(
  backendSource,
  excelImportRequire,
  encodingRequire,
  'backend/src/app.js'
);
backendSource = ensureRequire(
  backendSource,
  encodingRequire,
  finalRequire,
  'backend/src/app.js'
);

const finalMount = "api.use('/final', createFinalEnhancementsRouter());";
if (!backendSource.includes(finalMount)) {
  const authAnchor = 'api.use(authRequired);';
  if (!backendSource.includes(authAnchor)) {
    fail('backend/src/app.js의 인증 적용 위치(api.use(authRequired);)를 찾지 못했습니다.');
  }
  backendSource = backendSource.replace(
    authAnchor,
    `${authAnchor}\n\n// MT_OPTICS_FINAL_BACKEND_V210\n${finalMount}`
  );
}
backendSource = backendSource.replace(
  /\/\/ MT_OPTICS_FINAL_BACKEND_V\d+/g,
  '// MT_OPTICS_FINAL_BACKEND_V210'
);

if (!backendSource.includes('fileName: normalizeUploadedFileName(file.originalname)')) {
  const originalNamePattern = /fileName\s*:\s*file\.originalname\s*,/;
  if (!originalNamePattern.test(backendSource)) {
    fail('backend/src/app.js의 업로드 파일명 전달 구문(file.originalname)을 찾지 못했습니다.');
  }
  backendSource = backendSource.replace(
    originalNamePattern,
    'fileName: normalizeUploadedFileName(file.originalname),'
  );
}

const xlsxRequire = "const XLSX = require('xlsx');";
const excelEncodingRequire =
  "const { normalizeUploadedFileName, repairMojibake } = require('./textEncoding');";
excelSource = ensureRequire(
  excelSource,
  xlsxRequire,
  excelEncodingRequire,
  'backend/src/excelImport.js'
);

if (!excelSource.includes('repairMojibake(String(value))')) {
  const cleanPattern = /const s = String\(value\)\.replace\(\/\\u00a0\/g, ' '\)\.trim\(\);/;
  if (!cleanPattern.test(excelSource)) {
    fail('backend/src/excelImport.js의 clean 함수 문자열 정리 구문을 찾지 못했습니다.');
  }
  excelSource = excelSource.replace(
    cleanPattern,
    "const s = repairMojibake(String(value)).replace(/\\u00a0/g, ' ').trim();"
  );
}

const importFunctionAnchor =
  'async function importExcelBuffer(pool, { buffer, fileName, importedBy }) {';
if (!excelSource.includes('fileName = normalizeUploadedFileName(fileName);')) {
  if (!excelSource.includes(importFunctionAnchor)) {
    fail('backend/src/excelImport.js의 importExcelBuffer 함수를 찾지 못했습니다.');
  }
  excelSource = excelSource.replace(
    importFunctionAnchor,
    `${importFunctionAnchor}\n  fileName = normalizeUploadedFileName(fileName);`
  );
}

if (!excelSource.includes("codepage: /\\.xls$/i.test(fileName) ? 949 : undefined")) {
  const workbookPattern =
    /const workbook = XLSX\.read\(buffer, \{ type: 'buffer', cellDates: false, raw: false \}\);/;
  if (!workbookPattern.test(excelSource)) {
    fail('backend/src/excelImport.js의 XLSX.read 구문을 찾지 못했습니다.');
  }
  excelSource = excelSource.replace(
    workbookPattern,
    [
      'const workbook = XLSX.read(buffer, {',
      "    type: 'buffer',",
      '    cellDates: false,',
      '    raw: false,',
      "    codepage: /\\.xls$/i.test(fileName) ? 949 : undefined",
      '  });'
    ].join('\n')
  );
}

excelSource = excelSource.replace(
  /`엑셀 수금 \$\{fileName\} \$\{item\.rowNo\}행`/g,
  '`엑셀 업로드 수금 · ${item.rowNo}행`'
);

const frontendLoaderPattern =
  /\/\/ MT_OPTICS_FINAL_FEATURES_LOADER_V\d+\s*\r?\nimport\(["']\/final-enhancements-v\d+\.js(?:\?v=\d+)?["']\)\.catch\(console\.error\);?/m;
const frontendLoader = [
  '// MT_OPTICS_FINAL_FEATURES_LOADER_V210',
  'import("/final-enhancements-v210.js?v=210").catch(console.error);'
].join('\n');

if (frontendLoaderPattern.test(frontendSource)) {
  frontendSource = frontendSource.replace(frontendLoaderPattern, frontendLoader);
} else if (!frontendSource.includes('MT_OPTICS_FINAL_FEATURES_LOADER_V210')) {
  frontendSource = `${frontendSource.trimEnd()}\n\n${frontendLoader}\n`;
}

const backupBase = path.join(
  projectRoot,
  '_backup',
  `mt-optics-v210-${timestamp()}`
);
let backupDir = backupBase;
let backupIndex = 2;
while (fs.existsSync(backupDir)) {
  backupDir = `${backupBase}-${backupIndex}`;
  backupIndex += 1;
}
fs.mkdirSync(backupDir, { recursive: true });

const backupTargets = [
  [backendApp, 'backend-app.js'],
  [excelImport, 'excelImport.js'],
  [frontendApp, 'frontend-app.js']
];
for (const [source, name] of backupTargets) {
  fs.copyFileSync(source, path.join(backupDir, name));
}

fs.writeFileSync(backendApp, backendSource, 'utf8');
fs.writeFileSync(excelImport, excelSource, 'utf8');
fs.writeFileSync(frontendApp, frontendSource, 'utf8');

console.log('[완료] MT옵틱스 사용성·한글·미수금 고도화 v2.1 적용 완료');
console.log(`- 수정: ${backendApp}`);
console.log(`- 수정: ${excelImport}`);
console.log(`- 수정: ${frontendApp}`);
console.log(`- 추가/갱신: ${backendModule}`);
console.log(`- 추가/갱신: ${textEncodingModule}`);
console.log(`- 추가/갱신: ${frontendModule}`);
console.log(`- 원본 백업: ${backupDir}`);
console.log('');
console.log('다음 작업: GitHub Desktop에서 변경 파일을 Commit 후 Push origin 하세요.');
