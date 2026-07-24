const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appFile = path.join(root, 'frontend', 'app.js');
const uiFile = path.join(root, 'frontend', 'excel-upload-ui-fix.js');

if (!fs.existsSync(appFile)) {
  console.error(`[실패] frontend/app.js를 찾을 수 없습니다: ${appFile}`);
  process.exit(1);
}

if (!fs.existsSync(uiFile)) {
  console.error(`[실패] frontend/excel-upload-ui-fix.js를 찾을 수 없습니다: ${uiFile}`);
  process.exit(1);
}

let source = fs.readFileSync(appFile, 'utf8');

const loaderPattern =
  /\/\/ MT_OPTICS_UPLOAD_UI_LOADER_V\d+\s*\r?\nimport\(["']\/excel-upload-ui-fix\.js(?:\?v=\d+)?["']\)\.catch\(console\.error\);?/m;

const loader = [
  '// MT_OPTICS_UPLOAD_UI_LOADER_V156',
  'import("/excel-upload-ui-fix.js?v=156").catch(console.error);'
].join('\n');

if (loaderPattern.test(source)) {
  source = source.replace(loaderPattern, loader);
} else if (!source.includes('MT_OPTICS_UPLOAD_UI_LOADER_V156')) {
  source = `${source.trimEnd()}\n\n${loader}\n`;
}

fs.writeFileSync(appFile, source, 'utf8');

console.log('[완료] MT옵틱스 엑셀 연속등록·완료알림 패치 v1.5.6 적용 완료');
console.log('- frontend/app.js: v1.5.6 로더 적용');
console.log('- frontend/excel-upload-ui-fix.js: 교체');
console.log('- 연속 클릭 및 첫 처리와 두 번째 처리의 겹침 차단');
console.log('- 완료 요약 메시지 및 다음 파일 등록 가능 메시지 추가');
