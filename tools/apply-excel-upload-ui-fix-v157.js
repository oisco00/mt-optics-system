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
  '// MT_OPTICS_UPLOAD_UI_LOADER_V157',
  'import("/excel-upload-ui-fix.js?v=157").catch(console.error);'
].join('\n');

if (loaderPattern.test(source)) {
  source = source.replace(loaderPattern, loader);
} else if (!source.includes('MT_OPTICS_UPLOAD_UI_LOADER_V157')) {
  source = `${source.trimEnd()}\n\n${loader}\n`;
}

fs.writeFileSync(appFile, source, 'utf8');

console.log('[완료] MT옵틱스 엑셀 완료팝업·자동초기화 패치 v1.5.7 적용 완료');
console.log('- 완료 및 실패 팝업 추가');
console.log('- 확인 클릭 시 경과시간 0초 초기화');
console.log('- 선택 파일 및 버튼 상태 초기화');
console.log('- 확인 클릭 후 자동 새로고침');
console.log('- 연속 업로드 시 F5가 필요하던 현상 자동 처리');
