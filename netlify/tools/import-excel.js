const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initDb, closeDb } = require('../backend/src/db');
const { importExcelBuffer } = require('../backend/src/excelImport');

async function main() {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../import/excel');
  if (!fs.existsSync(dir)) {
    console.error(`엑셀 폴더를 찾을 수 없습니다: ${dir}`);
    process.exitCode = 1;
    return;
  }
  const files = fs.readdirSync(dir).filter((file) => /\.(xls|xlsx)$/i.test(file));
  if (files.length === 0) {
    console.log(`가져올 엑셀 파일이 없습니다: ${dir}`);
    return;
  }
  const pool = await initDb();
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const result = await importExcelBuffer(pool, {
        buffer: fs.readFileSync(filePath),
        fileName: file,
        importedBy: null
      });
      console.log(`[완료] ${file}:`, result);
    } catch (error) {
      console.error(`[실패] ${file}: ${error.message}`);
    }
  }
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  try { await closeDb(); } catch (_) {}
  process.exitCode = 1;
});
