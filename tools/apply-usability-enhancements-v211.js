const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const backendApp = path.join(projectRoot, 'backend', 'src', 'app.js');
const excelImport = path.join(projectRoot, 'backend', 'src', 'excelImport.js');
const backendModule = path.join(projectRoot, 'backend', 'src', 'finalEnhancements.js');
const textEncodingModule = path.join(projectRoot, 'backend', 'src', 'textEncoding.js');
const frontendApp = path.join(projectRoot, 'frontend', 'app.js');
const frontendModule = path.join(projectRoot, 'frontend', 'final-enhancements-v210.js');

const requiredFiles = [
  backendApp,
  excelImport,
  backendModule,
  textEncodingModule,
  frontendApp,
  frontendModule
];

function stop(message) {
  console.error(`[실패] ${message}`);
  process.exit(1);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    stop(
      `필요한 파일을 찾을 수 없습니다: ${file}\n` +
      'ZIP 내용을 실제 GitHub 작업 폴더 최상위에 압축 해제했는지 확인하세요.'
    );
  }
}

function ensureRequire(source, anchor, statement, label) {
  if (source.includes(statement)) return source;
  if (!source.includes(anchor)) {
    stop(`${label}의 기준 구문을 찾지 못했습니다: ${anchor}`);
  }
  return source.replace(anchor, `${anchor}\n${statement}`);
}

function timestamp() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

/**
 * v2.1에서 발생한 중복 선언을 안전하게 복구한다.
 *
 * 이전 업로드 패치가 app.js 안에
 *   function normalizeUploadedFileName(...) { ... }
 * 를 이미 만들었는데, v2.1이 같은 이름으로 require 하면서
 * SyntaxError: Identifier ... has already been declared가 발생했다.
 *
 * 모듈 함수는 별칭(normalizeUploadedFileNameV211)으로 가져오므로
 * 기존 로컬 함수가 있어도 충돌하지 않는다.
 */
function normalizeTextEncodingImport(source) {
  const importPattern = /^const[ \t]+\{([^}\r\n]*)\}[ \t]*=[ \t]*require\((['"])\.\/textEncoding\2\);?[ \t]*\r?$/gm;
  const collected = [];

  source = source.replace(importPattern, (full, inner) => {
    for (const rawPart of String(inner).split(',')) {
      const part = rawPart.trim();
      if (!part) continue;
      if (/^normalizeUploadedFileName(?:\s*:\s*\w+)?$/.test(part)) {
        collected.push('normalizeUploadedFileName: normalizeUploadedFileNameV211');
      } else {
        collected.push(part);
      }
    }
    return '';
  });

  if (!collected.some((part) => part.includes('normalizeUploadedFileName'))) {
    collected.push('normalizeUploadedFileName: normalizeUploadedFileNameV211');
  }

  const unique = [];
  const seen = new Set();
  for (const part of collected) {
    const key = part.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  const statement = `const { ${unique.join(', ')} } = require('./textEncoding');`;
  const excelImportRequire = "const { importExcelBuffer } = require('./excelImport');";
  if (!source.includes(excelImportRequire)) {
    stop('backend/src/app.js에서 excelImport require 구문을 찾지 못했습니다.');
  }

  // 제거한 import 자리에서 생긴 과도한 공백을 정리한 뒤 한 번만 삽입한다.
  source = source.replace(/\r?\n{3,}/g, '\n\n');
  return source.replace(excelImportRequire, `${excelImportRequire}\n${statement}`);
}

function checkSyntax(file) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    stop(`${path.relative(projectRoot, file)} 구문 점검 실패\n${output}`);
  }
}

let backendSource = fs.readFileSync(backendApp, 'utf8');
let excelSource = fs.readFileSync(excelImport, 'utf8');
let frontendSource = fs.readFileSync(frontendApp, 'utf8');

// 1) v2.1 중복 선언 오류 복구 + 안전한 별칭 import
backendSource = normalizeTextEncodingImport(backendSource);

const encodingRequire =
  "const { normalizeUploadedFileName: normalizeUploadedFileNameV211 } = require('./textEncoding');";
const finalRequire =
  "const { createFinalEnhancementsRouter } = require('./finalEnhancements');";

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
    stop('backend/src/app.js의 인증 적용 위치(api.use(authRequired);)를 찾지 못했습니다.');
  }
  backendSource = backendSource.replace(
    authAnchor,
    `${authAnchor}\n\n// MT_OPTICS_FINAL_BACKEND_V211\n${finalMount}`
  );
}
backendSource = backendSource.replace(
  /\/\/ MT_OPTICS_FINAL_BACKEND_V\d+/g,
  '// MT_OPTICS_FINAL_BACKEND_V211'
);

// 기존 로컬 함수와 충돌하지 않도록 업로드 라우트에서는 별칭만 사용한다.
backendSource = backendSource.replace(
  /fileName\s*:\s*normalizeUploadedFileName(?:V\d+)?\(\s*file\.originalname\s*\)\s*,/g,
  'fileName: normalizeUploadedFileNameV211(file.originalname),'
);
backendSource = backendSource.replace(
  /fileName\s*:\s*file\.originalname\s*,/g,
  'fileName: normalizeUploadedFileNameV211(file.originalname),'
);

if (!backendSource.includes('fileName: normalizeUploadedFileNameV211(file.originalname),')) {
  stop('backend/src/app.js의 업로드 파일명 전달 구문을 안전한 별칭으로 변경하지 못했습니다.');
}

// 2) Excel 내부 문자열 및 구형 XLS 코드페이지 보완
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
    stop('backend/src/excelImport.js의 clean 함수 문자열 정리 구문을 찾지 못했습니다.');
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
    stop('backend/src/excelImport.js의 importExcelBuffer 함수를 찾지 못했습니다.');
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
    stop('backend/src/excelImport.js의 XLSX.read 구문을 찾지 못했습니다.');
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

// 3) 프런트 고도화 모듈 로더 추가/갱신
const frontendLoaderPattern =
  /\/\/ MT_OPTICS_FINAL_FEATURES_LOADER_V\d+\s*\r?\nimport\(["']\/final-enhancements-v\d+\.js(?:\?v=\d+)?["']\)\.catch\(console\.error\);?/m;
const frontendLoader = [
  '// MT_OPTICS_FINAL_FEATURES_LOADER_V211',
  'import("/final-enhancements-v210.js?v=211").catch(console.error);'
].join('\n');

if (frontendLoaderPattern.test(frontendSource)) {
  frontendSource = frontendSource.replace(frontendLoaderPattern, frontendLoader);
} else if (!frontendSource.includes('MT_OPTICS_FINAL_FEATURES_LOADER_V211')) {
  frontendSource = `${frontendSource.trimEnd()}\n\n${frontendLoader}\n`;
}

// 4) 원본 백업 후 반영
const backupBase = path.join(
  projectRoot,
  '_backup',
  `mt-optics-v211-${timestamp()}`
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

// 5) 즉시 구문 점검. 여기서 중복 선언 오류도 다시 확인된다.
for (const file of [
  backendApp,
  excelImport,
  backendModule,
  textEncodingModule,
  frontendApp,
  frontendModule,
  __filename
]) {
  checkSyntax(file);
}

console.log('[완료] MT옵틱스 v2.1.1 중복 선언 복구 및 고도화 적용 완료');
console.log(`- 수정: ${backendApp}`);
console.log(`- 수정: ${excelImport}`);
console.log(`- 수정: ${frontendApp}`);
console.log(`- 추가/갱신: ${backendModule}`);
console.log(`- 추가/갱신: ${textEncodingModule}`);
console.log(`- 추가/갱신: ${frontendModule}`);
console.log(`- 원본 백업: ${backupDir}`);
console.log('');
console.log('SUCCESS: JavaScript 구문 점검을 모두 통과했습니다.');
console.log('다음 작업: GitHub Desktop에서 변경 파일을 Commit 후 Push origin 하세요.');
