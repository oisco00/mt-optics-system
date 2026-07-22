const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');

function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\u00a0/g, ' ').trim();
  if (!s || /^합\s*계/.test(s) || /^합계/.test(s)) return null;
  return s;
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, '').replace(/원/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toInt(value) {
  return Math.trunc(toNumber(value));
}

function toDateText(value) {
  const s = clean(value);
  if (!s) return null;
  const m = s.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function stripLeadingCustomerPrefix(name) {
  const s = clean(name);
  if (!s) return null;
  return s.replace(/^\d+\s*,\s*/, '').trim();
}

function normalizeCustomerBaseName(name) {
  const full = stripLeadingCustomerPrefix(name);
  if (!full) return null;
  const withoutBranch = full
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutBranch || full;
}

function extractSiteName(name, fallbackRegion = null) {
  const full = stripLeadingCustomerPrefix(name);
  if (!full) return clean(fallbackRegion) || '기본';
  const paren = full.match(/\(([^)]{1,80})\)/);
  if (paren && clean(paren[1])) return clean(paren[1]);
  const bracket = full.match(/\[([^\]]{1,80})\]/);
  if (bracket && clean(bracket[1])) return clean(bracket[1]);
  return clean(fallbackRegion) || '기본';
}

function normalizeDeliveryType(value, defaultValue = '택배') {
  const raw = clean(value);
  if (!raw) return defaultValue;
  const s = raw.toUpperCase();
  if (s.includes('SALES') || raw.includes('영업') || raw.includes('방문')) return '영업방문';
  if (s.includes('PARCEL') || raw.includes('택배') || raw.includes('화물')) return '택배';
  if (s.includes('OTHER') || raw.includes('기타')) return '기타';
  return defaultValue;
}

function detectDeliveryTypeFromRow(row, fileName = '') {
  const values = Object.values(row || {}).map((v) => clean(v)).filter(Boolean).join(' ');
  return normalizeDeliveryType(`${fileName} ${values}`, '택배');
}

function hashText(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function safeSkuFromName(name, spec = '') {
  const base = `${clean(name) || 'ITEM'}|${clean(spec) || ''}`;
  return `IMP-${hashText(base).slice(0, 10).toUpperCase()}`;
}

function detectFileType(fileName, headerMap) {
  const name = path.basename(fileName || '');
  const headers = Object.keys(headerMap).join('|');
  if (/수금|미수금/.test(name) || (headers.includes('거래처코드') && headers.includes('미수금액'))) return 'receivable_statement';
  if (/거래처원장/.test(name) || (headers.includes('거래항목') && headers.includes('품목명/규격'))) return 'customer_ledger';
  if (/판매명세서/.test(name) || (headers.includes('상세규격') && headers.includes('담당자'))) return 'sales_detail';
  if (/거래처별/.test(name) || (headers.includes('상계잔액') && headers.includes('미지급금'))) return 'customer_sales_summary';
  return 'unknown_excel';
}

function findHeaderRow(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const values = (rows[r] || []).map((v) => clean(v)).filter(Boolean);
    if (values.length >= 3 && (values.includes('거래처명') || values.includes('거래일자') || values.includes('거래처코드'))) return r;
  }
  return -1;
}

function sheetRows(workbook) {
  const out = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: null, blankrows: false });
    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) continue;
    const headers = rows[headerRow].map((h) => clean(h));
    const headerMap = {};
    headers.forEach((h, idx) => { if (h) headerMap[h] = idx; });
    const type = detectFileType(workbook.__fileName, headerMap);
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const row = rows[r] || [];
      const obj = {};
      for (const [h, idx] of Object.entries(headerMap)) obj[h] = row[idx];
      const hasAny = Object.values(obj).some((v) => clean(v) !== null);
      if (!hasAny) continue;
      out.push({ sheetName, rowNo: r + 1, type, row: obj, headerMap });
    }
  }
  return out;
}

async function getRecord(conn, tableName, id) {
  const [rows] = await conn.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function writeAudit(conn, tableName, recordId, action, before, after, userId) {
  await conn.execute(
    `INSERT INTO audit_logs(table_name, record_id, action, before_data, after_data, changed_by, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, 'excel-import', 'excel-import')`,
    [tableName, String(recordId), action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, userId || null]
  );
}

async function rowAlreadyImported(conn, rowHash) {
  const [rows] = await conn.execute('SELECT row_hash FROM import_row_hashes WHERE row_hash = ?', [rowHash]);
  return rows.length > 0;
}

async function markImported(conn, rowHash, batchId, tableName, targetId) {
  await conn.execute(
    `INSERT IGNORE INTO import_row_hashes(row_hash, import_batch_id, target_table, target_id)
     VALUES (?, ?, ?, ?)`,
    [rowHash, batchId, tableName, targetId || null]
  );
}

async function upsertCustomer(conn, payload, userId) {
  const code = clean(payload.code);
  const originalName = stripLeadingCustomerPrefix(payload.name);
  const name = normalizeCustomerBaseName(payload.name);
  if (!name) return null;

  let [rows] = await conn.execute('SELECT * FROM customers WHERE name = ? LIMIT 1', [name]);
  if (rows.length === 0 && code) [rows] = await conn.execute('SELECT * FROM customers WHERE code = ? LIMIT 1', [code]);

  const updateData = {
    code: code || undefined,
    name,
    business_no: clean(payload.business_no) || undefined,
    phone: clean(payload.phone) || undefined,
    region: clean(payload.region) || undefined,
    opening_receivable: payload.opening_receivable !== undefined ? toNumber(payload.opening_receivable) : undefined,
    memo: clean(payload.memo) || (originalName && originalName !== name ? `원거래처명: ${originalName}` : undefined),
    updated_by: userId || null
  };

  if (rows.length === 0) {
    const fields = ['code', 'name', 'business_no', 'phone', 'region', 'opening_receivable', 'memo', 'created_by', 'updated_by'];
    const values = [code, name, clean(payload.business_no), clean(payload.phone), clean(payload.region), toNumber(payload.opening_receivable), updateData.memo || null, userId || null, userId || null];
    const [result] = await conn.execute(`INSERT INTO customers(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, values);
    const after = await getRecord(conn, 'customers', result.insertId);
    await writeAudit(conn, 'customers', result.insertId, 'IMPORT', null, after, userId);
    return after;
  }

  const before = rows[0];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updateData)) {
    if (value === undefined) continue;
    if (key === 'code' && before.code && before.code !== value) continue;
    if (key !== 'opening_receivable' && value === null) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length) {
    await conn.execute(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, values.concat([before.id]));
    const after = await getRecord(conn, 'customers', before.id);
    await writeAudit(conn, 'customers', before.id, 'IMPORT_UPDATE', before, after, userId);
    return after;
  }
  return before;
}

async function upsertCustomerSite(conn, payload, userId) {
  const customer = await upsertCustomer(conn, payload, userId);
  if (!customer) return { customer: null, site: null };
  const siteName = clean(payload.site_name) || extractSiteName(payload.name, payload.region);
  const deliveryType = normalizeDeliveryType(payload.delivery_type || payload.default_delivery_type, '택배');
  const siteCode = clean(payload.site_code) || (clean(payload.code) ? `SITE-${clean(payload.code)}-${deliveryType}` : null);

  let rows = [];
  if (siteCode) [rows] = await conn.execute('SELECT * FROM customer_sites WHERE site_code = ? LIMIT 1', [siteCode]);
  if (rows.length === 0) {
    [rows] = await conn.execute(
      'SELECT * FROM customer_sites WHERE customer_id = ? AND site_name = ? AND default_delivery_type = ? LIMIT 1',
      [customer.id, siteName, deliveryType]
    );
  }

  const common = {
    customer_id: customer.id,
    site_code: siteCode,
    site_name: siteName,
    original_customer_name: stripLeadingCustomerPrefix(payload.name),
    business_no: clean(payload.business_no),
    phone: clean(payload.phone),
    mobile: clean(payload.mobile),
    address: clean(payload.address),
    region: clean(payload.region) || (siteName === '기본' ? null : siteName),
    default_delivery_type: deliveryType,
    default_delivery_group: clean(payload.delivery_group) || '기타',
    opening_receivable: payload.site_opening_receivable !== undefined ? toNumber(payload.site_opening_receivable) : 0,
    memo: clean(payload.memo),
    updated_by: userId || null
  };

  if (rows.length === 0) {
    const fields = Object.keys(common).concat(['created_by']);
    const values = Object.values(common).concat([userId || null]);
    const [result] = await conn.execute(`INSERT INTO customer_sites(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, values);
    const after = await getRecord(conn, 'customer_sites', result.insertId);
    await writeAudit(conn, 'customer_sites', result.insertId, 'IMPORT', null, after, userId);
    return { customer, site: after };
  }

  const before = rows[0];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(common)) {
    if (value === undefined || value === null || key === 'customer_id') continue;
    if (key === 'site_code' && before.site_code && before.site_code !== value) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length) {
    await conn.execute(`UPDATE customer_sites SET ${fields.join(', ')} WHERE id = ?`, values.concat([before.id]));
    const after = await getRecord(conn, 'customer_sites', before.id);
    await writeAudit(conn, 'customer_sites', before.id, 'IMPORT_UPDATE', before, after, userId);
    return { customer, site: after };
  }
  return { customer, site: before };
}

async function upsertProduct(conn, payload, userId) {
  const name = clean(payload.name);
  if (!name) return null;
  const spec = clean(payload.spec);
  const sku = clean(payload.sku) || safeSkuFromName(name, spec);
  let [rows] = await conn.execute('SELECT * FROM products WHERE sku = ? LIMIT 1', [sku]);
  if (rows.length === 0) [rows] = await conn.execute('SELECT * FROM products WHERE name = ? AND COALESCE(spec, \'\') = COALESCE(?, \'\') LIMIT 1', [name, spec]);
  if (rows.length === 0) {
    const [result] = await conn.execute(
      `INSERT INTO products(sku, name, spec, category, product_type, unit, default_price, safety_stock, production_lot_size, popularity_grade, memo, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, '개', ?, 300, 300, 'C', ?, ?, ?)`,
      [sku, name, spec, clean(payload.category) || '안경제품', 'FINISHED', toNumber(payload.default_price), clean(payload.memo), userId || null, userId || null]
    );
    const after = await getRecord(conn, 'products', result.insertId);
    await writeAudit(conn, 'products', result.insertId, 'IMPORT', null, after, userId);
    return after;
  }
  const before = rows[0];
  const updates = [];
  const values = [];
  if (payload.default_price !== undefined && toNumber(payload.default_price) !== 0) {
    updates.push('default_price = ?'); values.push(toNumber(payload.default_price));
  }
  if (spec && !before.spec) { updates.push('spec = ?'); values.push(spec); }
  updates.push('updated_by = ?'); values.push(userId || null);
  if (updates.length) {
    await conn.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values.concat([before.id]));
    const after = await getRecord(conn, 'products', before.id);
    await writeAudit(conn, 'products', before.id, 'IMPORT_UPDATE', before, after, userId);
    return after;
  }
  return before;
}

async function insertReceivable(conn, customerId, txnDate, txnType, amount, refs, memo, userId) {
  await conn.execute(
    `INSERT INTO receivable_transactions(customer_id, customer_site_id, delivery_type, txn_date, txn_type, order_id, payment_id, amount, memo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId,
      refs?.customer_site_id || null,
      normalizeDeliveryType(refs?.delivery_type, '택배'),
      txnDate,
      txnType,
      refs?.order_id || null,
      refs?.payment_id || null,
      amount,
      memo,
      userId || null
    ]
  );
}

async function importSalesRow(conn, batchId, fileName, item, userId, counters) {
  const row = item.row;
  const date = toDateText(row['거래일자'] || row['거래일자 ']);
  const customerName = row['거래처명'];
  const productName = row['품목명/규격'];
  const spec = row['상세규격'];
  const qty = toInt(row['수량']);
  const unitPrice = toNumber(row['단가']);
  const vat = toNumber(row['부가세']);
  const total = row['합계'] !== undefined ? toNumber(row['합계']) : toNumber(row['매출/매입액']);
  const supply = row['공급가액'] !== undefined ? toNumber(row['공급가액']) : total - vat;
  if (!date || !stripLeadingCustomerPrefix(customerName) || !clean(productName) || qty === 0) {
    counters.skipped += 1;
    return;
  }
  const rowHash = hashText(`${fileName}|${item.sheetName}|${item.rowNo}|sales|${date}|${customerName}|${productName}|${qty}|${unitPrice}|${total}`);
  if (await rowAlreadyImported(conn, rowHash)) { counters.skipped += 1; return; }
  const deliveryType = detectDeliveryTypeFromRow(row, fileName);
  const { customer, site } = await upsertCustomerSite(conn, { name: customerName, delivery_type: deliveryType, memo: `엑셀 가져오기: ${fileName}` }, userId);
  const product = await upsertProduct(conn, { name: productName, spec, default_price: unitPrice, memo: `엑셀 가져오기: ${fileName}` }, userId);
  const orderNo = `IMP-${date.replace(/-/g, '')}-${rowHash.slice(0, 8).toUpperCase()}`;
  const [orderResult] = await conn.execute(
    `INSERT INTO sales_orders(order_no, order_date, customer_id, customer_site_id, source, delivery_type, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo, created_by, updated_by)
     VALUES (?, ?, ?, ?, 'excel', ?, '기타', ?, 'delivered', ?, ?, ?, 1, ?, ?, ?)`,
    [orderNo, date, customer.id, site?.id || null, deliveryType, deliveryType, supply, vat, total, `엑셀 가져오기 ${fileName} ${item.sheetName} ${item.rowNo}행`, userId || null, userId || null]
  );
  await conn.execute(
    `INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderResult.insertId, product?.id || null, clean(productName), clean(spec), qty, unitPrice, total, `엑셀 ${item.rowNo}행`]
  );
  if (total !== 0) await insertReceivable(conn, customer.id, date, 'sales', total, { order_id: orderResult.insertId, customer_site_id: site?.id || null, delivery_type: deliveryType }, `엑셀 매출 ${orderNo}`, userId);
  const after = await getRecord(conn, 'sales_orders', orderResult.insertId);
  await writeAudit(conn, 'sales_orders', orderResult.insertId, 'IMPORT', null, after, userId);
  await markImported(conn, rowHash, batchId, 'sales_orders', orderResult.insertId);
  counters.inserted += 1;
}

async function importLedgerRow(conn, batchId, fileName, item, userId, counters) {
  const row = item.row;
  const customerName = row['거래처명'];
  const entryType = clean(row['거래항목']);
  const date = toDateText(row['거래일자']);
  if (!stripLeadingCustomerPrefix(customerName) || !entryType) { counters.skipped += 1; return; }
  if (entryType.includes('이월')) {
    await upsertCustomerSite(conn, { name: customerName, site_opening_receivable: toNumber(row['잔액']), memo: `원장 이월잔액 ${fileName}` }, userId);
    counters.updated += 1;
    return;
  }
  if (entryType.includes('매출')) {
    await importSalesRow(conn, batchId, fileName, {
      ...item,
      row: {
        '거래일자': date,
        '거래처명': customerName,
        '품목명/규격': row['품목명/규격'],
        '수량': row['수량'],
        '단가': row['단가'],
        '공급가액': row['공급가액'],
        '부가세': row['부가세'],
        '합계': row['매출/매입액']
      }
    }, userId, counters);
    return;
  }
  const paymentAmount = toNumber(row['수금/지급액']);
  if (paymentAmount > 0 && date) {
    const rowHash = hashText(`${fileName}|${item.sheetName}|${item.rowNo}|payment|${date}|${customerName}|${paymentAmount}`);
    if (await rowAlreadyImported(conn, rowHash)) { counters.skipped += 1; return; }
    const deliveryType = detectDeliveryTypeFromRow(row, fileName);
    const { customer, site } = await upsertCustomerSite(conn, { name: customerName, delivery_type: deliveryType, memo: `엑셀 가져오기: ${fileName}` }, userId);
    const paymentNo = `PAY-IMP-${date.replace(/-/g, '')}-${rowHash.slice(0, 8).toUpperCase()}`;
    const [paymentResult] = await conn.execute(
      `INSERT INTO payments(payment_no, customer_id, customer_site_id, delivery_type, payment_date, method, amount, memo, created_by)
       VALUES (?, ?, ?, ?, ?, 'bank', ?, ?, ?)`,
      [paymentNo, customer.id, site?.id || null, deliveryType, date, paymentAmount, `엑셀 수금 ${fileName} ${item.rowNo}행`, userId || null]
    );
    await insertReceivable(conn, customer.id, date, 'payment', -paymentAmount, { payment_id: paymentResult.insertId, customer_site_id: site?.id || null, delivery_type: deliveryType }, `엑셀 수금 ${paymentNo}`, userId);
    await markImported(conn, rowHash, batchId, 'payments', paymentResult.insertId);
    counters.inserted += 1;
    return;
  }
  counters.skipped += 1;
}

async function importReceivableStatementRow(conn, fileName, item, userId, counters) {
  const row = item.row;
  const name = row['거래처명'];
  if (!stripLeadingCustomerPrefix(name)) { counters.skipped += 1; return; }
  await upsertCustomerSite(conn, {
    code: row['거래처코드'],
    name,
    business_no: row['사업자번호'],
    phone: row['전화번호'],
    site_opening_receivable: row['이월미수금액'],
    memo: `엑셀 미수금명세서: 현재미수 ${toNumber(row['미수금액']).toLocaleString('ko-KR')}원 / ${fileName}`
  }, userId);
  counters.updated += 1;
}

async function importSummaryRow(conn, fileName, item, userId, counters) {
  const row = item.row;
  const date = toDateText(row['거래일자']);
  if (clean(row['거래일자']) === '이월금액') {
    counters.skipped += 1;
    return;
  }
  if (!date) { counters.skipped += 1; return; }
  counters.skipped += 1;
}

async function processItem(conn, batchId, fileName, item, userId, counters) {
  if (item.type === 'sales_detail') return importSalesRow(conn, batchId, fileName, item, userId, counters);
  if (item.type === 'customer_ledger') return importLedgerRow(conn, batchId, fileName, item, userId, counters);
  if (item.type === 'receivable_statement') return importReceivableStatementRow(conn, fileName, item, userId, counters);
  if (item.type === 'customer_sales_summary') return importSummaryRow(conn, fileName, item, userId, counters);
  counters.skipped += 1;
  return undefined;
}

async function importExcelBuffer(pool, { buffer, fileName, importedBy }) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  workbook.__fileName = fileName;
  const items = sheetRows(workbook);
  const fileType = items[0]?.type || detectFileType(fileName, {});
  const conn = await pool.getConnection();
  const counters = { total: items.length, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let batchId;
  try {
    await conn.beginTransaction();
    const [batch] = await conn.execute(
      `INSERT INTO import_batches(file_name, file_type, source, status, total_rows, imported_by)
       VALUES (?, ?, 'excel', 'processing', ?, ?)`,
      [fileName, fileType, items.length, importedBy || null]
    );
    batchId = batch.insertId;
    for (const item of items) {
      try {
        await processItem(conn, batchId, fileName, item, importedBy, counters);
      } catch (error) {
        counters.errors += 1;
        await conn.execute(
          `INSERT INTO import_errors(import_batch_id, row_no, sheet_name, message, row_data)
           VALUES (?, ?, ?, ?, ?)`,
          [batchId, item.rowNo, item.sheetName, String(error.message).slice(0, 500), JSON.stringify(item.row)]
        );
      }
    }
    await conn.execute(
      `UPDATE import_batches
          SET status = 'completed', inserted_rows = ?, updated_rows = ?, skipped_rows = ?, error_rows = ?, summary = ?
        WHERE id = ?`,
      [counters.inserted, counters.updated, counters.skipped, counters.errors, JSON.stringify(counters), batchId]
    );
    await conn.commit();
    return { batch_id: batchId, file_name: fileName, file_type: fileType, ...counters };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { importExcelBuffer };
