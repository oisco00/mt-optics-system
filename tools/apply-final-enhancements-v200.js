const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const backendApp = path.join(projectRoot, 'backend', 'src', 'app.js');
const backendModule = path.join(
  projectRoot,
  'backend',
  'src',
  'finalEnhancements.js'
);
const frontendApp = path.join(projectRoot, 'frontend', 'app.js');
const frontendModule = path.join(
  projectRoot,
  'frontend',
  'final-enhancements-v200.js'
);

const requiredFiles = [
  backendApp,
  backendModule,
  frontendApp,
  frontendModule
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`[실패] 필요한 파일을 찾을 수 없습니다: ${file}`);
    console.error('압축 내용을 실제 GitHub 작업 폴더 최상위에 풀었는지 확인하세요.');
    process.exit(1);
  }
}

const backupDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'mt-optics-final-v200-')
);
fs.copyFileSync(
  backendApp,
  path.join(backupDir, 'backend-app.js')
);
fs.copyFileSync(
  frontendApp,
  path.join(backupDir, 'frontend-app.js')
);

let backendSource = fs.readFileSync(backendApp, 'utf8');
let frontendSource = fs.readFileSync(frontendApp, 'utf8');

const backendRequire =
  "const { createFinalEnhancementsRouter } = require('./finalEnhancements');";

if (!backendSource.includes(backendRequire)) {
  const importAnchor =
    "const { importExcelBuffer } = require('./excelImport');";

  if (!backendSource.includes(importAnchor)) {
    console.error('[실패] backend/src/app.js의 Excel import 구문을 찾지 못했습니다.');
    console.error('원본 파일은 변경하지 않았습니다.');
    process.exit(1);
  }

  backendSource = backendSource.replace(
    importAnchor,
    `${importAnchor}\n${backendRequire}`
  );
}

const backendMount =
  "api.use('/final', createFinalEnhancementsRouter());";

if (!backendSource.includes(backendMount)) {
  const authAnchor = 'api.use(authRequired);';

  if (!backendSource.includes(authAnchor)) {
    console.error('[실패] backend/src/app.js의 인증 적용 위치를 찾지 못했습니다.');
    console.error('원본 파일은 변경하지 않았습니다.');
    process.exit(1);
  }

  backendSource = backendSource.replace(
    authAnchor,
    `${authAnchor}\n\n// MT_OPTICS_FINAL_BACKEND_V200\n${backendMount}`
  );
}

const frontendLoaderPattern =
  /\/\/ MT_OPTICS_FINAL_FEATURES_LOADER_V\d+\s*\r?\nimport\(["']\/final-enhancements-v\d+\.js(?:\?v=\d+)?["']\)\.catch\(console\.error\);?/m;

const frontendLoader = [
  '// MT_OPTICS_FINAL_FEATURES_LOADER_V200',
  'import("/final-enhancements-v200.js?v=200").catch(console.error);'
].join('\n');

if (frontendLoaderPattern.test(frontendSource)) {
  frontendSource = frontendSource.replace(
    frontendLoaderPattern,
    frontendLoader
  );
} else if (!frontendSource.includes('MT_OPTICS_FINAL_FEATURES_LOADER_V200')) {
  frontendSource = `${frontendSource.trimEnd()}\n\n${frontendLoader}\n`;
}

fs.writeFileSync(backendApp, backendSource, 'utf8');
fs.writeFileSync(frontendApp, frontendSource, 'utf8');

console.log('[완료] MT옵틱스 최종 기능 보완 v2.0 적용 완료');
console.log(`- 수정: ${backendApp}`);
console.log(`- 수정: ${frontendApp}`);
console.log(`- 추가: ${backendModule}`);
console.log(`- 추가: ${frontendModule}`);
console.log(`- 원본 임시 백업: ${backupDir}`);
console.log('');
console.log('다음 작업: GitHub Desktop에서 변경 파일을 Commit 후 Push origin 하세요.');
