const path = require('path');

// Windows-1252 characters that may appear when UTF-8 bytes are decoded as ANSI.
const CP1252_BYTES = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84],
  ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88],
  ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c],
  ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93],
  ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f]
]);

function cp1252Byte(character) {
  const code = character.charCodeAt(0);
  if (code <= 0xff) return code;
  return CP1252_BYTES.get(character);
}

function isByteLike(character) {
  return cp1252Byte(character) !== undefined;
}

function textScore(value) {
  const text = String(value || '');
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const jamo = (text.match(/[ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const replacement = (text.match(/�/g) || []).length;
  const controls = (text.match(/[\u0080-\u009f]/g) || []).length;
  const suspicious = (
    text.match(/[ÃÂâêëìíîïðñòóôõöøùúûüýþæçžœš]/gi) || []
  ).length;
  const nulls = (text.match(/\u0000/g) || []).length;

  return (
    hangul * 12 +
    jamo * 3 -
    replacement * 80 -
    controls * 25 -
    suspicious * 4 -
    nulls * 100
  );
}

function decodeByteRun(run) {
  if (!run) return run;

  const bytes = [];
  for (const character of run) {
    const byte = cp1252Byte(character);
    if (byte === undefined) return run;
    bytes.push(byte);
  }

  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.includes('�')) return run;

  return textScore(decoded) > textScore(run) ? decoded : run;
}

/**
 * Repairs mojibake even when a string mixes valid Korean and a broken segment.
 * Example: "엑셀 수금 ìê¸...". Previous whole-string decoding failed
 * because the valid Korean prefix cannot be represented as a single byte.
 */
function decodeMojibakeSegments(value) {
  const text = String(value ?? '');
  let output = '';
  let byteRun = '';

  const flush = () => {
    if (!byteRun) return;
    output += decodeByteRun(byteRun);
    byteRun = '';
  };

  for (const character of text) {
    if (isByteLike(character)) {
      byteRun += character;
    } else {
      flush();
      output += character;
    }
  }
  flush();

  return output;
}

function repairMojibake(value) {
  let current = String(value ?? '');

  for (let pass = 0; pass < 4; pass += 1) {
    const decoded = decodeMojibakeSegments(current);
    if (decoded === current) break;
    current = decoded;
  }

  return current.normalize('NFC');
}

function normalizeUploadedFileName(value) {
  let name = repairMojibake(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  // Browsers should send a base name, but strip any client-side path safely.
  name = path.basename(name.replaceAll('\\', '/'));
  return name || 'upload.xlsx';
}

function normalizeImportedPaymentMemo({ paymentNo, memo }) {
  const repaired = repairMojibake(memo || '').trim();
  if (!String(paymentNo || '').startsWith('PAY-IMP-')) return repaired;

  const rowMatch = repaired.match(/(\d+)\s*행/);
  return rowMatch
    ? `엑셀 업로드 수금 · ${rowMatch[1]}행`
    : '엑셀 업로드 수금';
}

function paymentDisplayNote({ paymentNo, approvalNo, memo }) {
  if (String(paymentNo || '').startsWith('PAY-IMP-')) {
    return normalizeImportedPaymentMemo({ paymentNo, memo });
  }
  const approval = repairMojibake(approvalNo || '').trim();
  if (approval) return approval;
  return repairMojibake(memo || '').trim();
}

module.exports = {
  repairMojibake,
  normalizeUploadedFileName,
  normalizeImportedPaymentMemo,
  paymentDisplayNote,
  textScore
};
