const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const app=path.join(root,'frontend','app.js');
const src=path.join(root,'frontend','excel-upload-ui-fix.js');
if(!fs.existsSync(app)||!fs.existsSync(src)){console.error('[실패] 필요한 파일이 없습니다.');process.exit(1);}
let text=fs.readFileSync(app,'utf8');
const marker='MT_OPTICS_UPLOAD_UI_LOADER_V155';
if(!text.includes(marker)){
  text += '\n// '+marker+'\nimport("/excel-upload-ui-fix.js").catch(console.error);\n';
  fs.writeFileSync(app,text,'utf8');
}
console.log('[완료] v1.5.5 UI 패치 적용 완료');
console.log('- frontend/app.js 로더 추가');
console.log('- frontend/excel-upload-ui-fix.js 추가');
