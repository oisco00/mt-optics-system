const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { initDb, closeDb, getPool, withTransaction, permissions: permissionSeed } = require('./db');
const { importExcelBuffer } = require('./excelImport');
const { normalizeUploadedFileName: normalizeUploadedFileNameFinal } = require('./textEncoding');

const { createFinalEnhancementsRouter } = require('./finalEnhancements');

const app = express();
const api = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-long-random-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
// MT_OPTICS_UPLOAD_FIX_V152
const MAX_EXCEL_FILE_MB = Math.max(Number(process.env.MAX_EXCEL_FILE_MB || 100), 1);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EXCEL_FILE_MB * 1024 * 1024, files: 10, fields: 20, parts: 30, fieldNestingDepth: 4 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(xls|xlsx)$/i.test(normalizeUploadedFileName(file.originalname));
    cb(allowed ? null : badRequest('엑셀 파일(.xls, .xlsx)만 업로드할 수 있습니다.'), allowed);
  }
});

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

const allowedOrigins = String(process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(forbidden('허용되지 않은 접속 주소입니다.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // X-Frame-Options is intentionally not set because the Daum/Kakao postcode widget uses nested frames.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');  // Cross-Origin-Opener-Policy is not set so third-party postcode popup/layer can communicate normally.
  res.setHeader('Content-Security-Policy', "default-src 'self' https: http: data: blob: about:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.daumcdn.net https://*.kakaocdn.net https://*.daumcdn.net https://postcode.map.kakao.com https://postcode.map.daum.net https: http: data: blob:; style-src 'self' 'unsafe-inline' https: http:; img-src 'self' data: blob: https: http:; connect-src 'self' https://postcode.map.kakao.com https://postcode.map.daum.net https://*.kakao.com https://*.daum.net https: http:; frame-src 'self' about: data: blob: https://postcode.map.kakao.com https://postcode.map.daum.net https://*.kakao.com https://*.daum.net https://*.kakaocdn.net https://*.daumcdn.net https: http:; child-src 'self' about: data: blob: https://postcode.map.kakao.com https://postcode.map.daum.net https://*.kakao.com https://*.daum.net https://*.kakaocdn.net https://*.daumcdn.net https: http:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '3mb' }));

function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ ok: false, error: message });
    }
    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets.entries()) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    return next();
  };
}

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Math.max(Number(process.env.API_RATE_LIMIT_PER_15M || 1200), 100),
  message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'
});
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Math.max(Number(process.env.LOGIN_RATE_LIMIT_PER_15M || 20), 5),
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.'
});
app.use('/api', apiLimiter);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function respond(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function badRequest(message, details) {
  const err = new Error(message);
  err.status = 400;
  err.details = details;
  return err;
}

function forbidden(message = '권한이 없습니다.') {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function notFound(message = '자료를 찾을 수 없습니다.') {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function toInt(value, defaultValue = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function toMoney(value, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function todayKst() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function dateText(value, fallback = null) {
  if (!value) return fallback;
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return fallback;
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePhoneValue(value) {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
}

/** multipart 업로드 과정에서 latin1로 잘못 해석된 한글 파일명을 UTF-8로 복구합니다. */
function normalizeUploadedFileName(value) {
  const raw = path.basename(String(value || 'upload.xlsx').replace(/\0/g, '')).normalize('NFC');
  if (!raw) return 'upload.xlsx';
  if (/[\uAC00-\uD7A3]/.test(raw)) return raw;
  if (/[\u0080-\u00FF]/.test(raw)) {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8').normalize('NFC');
    if (decoded && !decoded.includes('\uFFFD') && /[\uAC00-\uD7A3]/.test(decoded)) return path.basename(decoded);
  }
  return raw;
}

function isExcelFileBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  return isZip || isOle;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role_id: user.role_id,
    role_name: user.role_name,
    role_label: user.role_label,
    is_active: Boolean(user.is_active),
    permissions: user.permissions || []
  };
}

function generateNo(prefix) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

function sqlLimit(req, fallback = 200, max = 500) {
  return Math.min(Math.max(toInt(req.query.limit, fallback), 1), max);
}

function offset(req) {
  return Math.max(toInt(req.query.offset, 0), 0);
}

function limitOffsetClause(req, fallback = 200, max = 500) {
  const limitValue = sqlLimit(req, fallback, max);
  const offsetValue = offset(req);
  return `LIMIT ${limitValue} OFFSET ${offsetValue}`;
}

async function getRecord(conn, tableName, id) {
  const [rows] = await conn.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function auditLog(conn, tableName, recordId, action, beforeData, afterData, req, reason = null) {
  const changeReason = clean(reason || req.body?.delete_reason || req.body?.change_reason || req.body?.reason);
  await conn.execute(
    `INSERT INTO audit_logs(table_name, record_id, action, before_data, after_data, changed_by, ip_address, user_agent, change_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tableName,
      String(recordId),
      action,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      req.user?.id || null,
      req.ip || null,
      String(req.get('user-agent') || '').slice(0, 255),
      changeReason
    ]
  );
}

async function loadUserById(userId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.password_hash, u.full_name, u.email, u.phone, u.role_id, u.is_active,
            r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user || !user.is_active) return null;
  const [permRows] = await pool.execute(
    `SELECT p.code
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ?`,
    [user.role_id]
  );
  user.permissions = permRows.map((row) => row.code);
  return user;
}

async function authRequired(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw forbidden('로그인이 필요합니다.');
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await loadUserById(payload.sub);
    if (!user) throw forbidden('사용자 계정이 비활성화되었거나 존재하지 않습니다.');
    req.user = user;
    next();
  } catch (err) {
    err.status = err.status || 401;
    next(err);
  }
}

function hasPermission(user, code) {
  if (!user) return false;
  if (user.role_name === 'admin') return true;
  return (user.permissions || []).includes(code);
}

function requirePermission(code) {
  return (req, res, next) => {
    if (!hasPermission(req.user, code)) return next(forbidden());
    next();
  };
}

function assertCanModifyRecord(req, record, ownerFields = ['created_by']) {
  if (req.user?.role_name === 'admin' || req.user?.role_name === 'accounting') return;
  const owned = ownerFields.some((field) => Number(record?.[field] || 0) === Number(req.user?.id || 0));
  if (!owned) throw forbidden('본인이 등록한 자료만 수정하거나 삭제할 수 있습니다.');
}

function pick(body, allowed) {
  const result = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) result[key] = body[key];
  }
  return result;
}

function normalizeDeliveryType(value, defaultValue = '택배') {
  const raw = clean(value);
  if (!raw) return defaultValue;
  const upper = String(raw).toUpperCase();
  if (['PARCEL', '택배', '화물', '택배발송'].includes(upper) || raw.includes('택배')) return '택배';
  if (['SALES_VISIT', 'VISIT', '방문', '영업방문', '영업직원'].includes(upper) || raw.includes('방문') || raw.includes('영업')) return '영업방문';
  if (['OTHER', '기타'].includes(upper) || raw.includes('기타')) return '기타';
  return raw;
}

function normalizeCustomerSitePayload(body) {
  const data = pick(body, [
    'customer_id', 'site_code', 'site_name', 'original_customer_name', 'business_no', 'owner_name', 'phone', 'mobile',
    'address', 'postal_code', 'road_address', 'jibun_address', 'detail_address', 'address_type', 'region', 'default_delivery_type', 'default_delivery_group', 'sales_rep_id', 'opening_receivable',
    'credit_limit', 'status', 'memo'
  ]);
  if (Object.prototype.hasOwnProperty.call(data, 'customer_id')) data.customer_id = toInt(data.customer_id);
  for (const key of ['site_code', 'site_name', 'original_customer_name', 'business_no', 'owner_name', 'phone', 'mobile', 'address', 'postal_code', 'road_address', 'jibun_address', 'detail_address', 'address_type', 'region', 'default_delivery_group', 'status', 'memo']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  for (const key of ['phone', 'mobile']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = normalizePhoneValue(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'default_delivery_type')) data.default_delivery_type = normalizeDeliveryType(data.default_delivery_type);
  if (Object.prototype.hasOwnProperty.call(data, 'sales_rep_id')) data.sales_rep_id = data.sales_rep_id ? toInt(data.sales_rep_id) : null;
  if (Object.prototype.hasOwnProperty.call(data, 'opening_receivable')) data.opening_receivable = toMoney(data.opening_receivable);
  if (Object.prototype.hasOwnProperty.call(data, 'credit_limit')) data.credit_limit = toMoney(data.credit_limit);
  if (!data.site_name && data.region) data.site_name = data.region;
  return data;
}

function normalizeCustomerPayload(body) {
  const data = pick(body, [
    'code', 'name', 'business_no', 'owner_name', 'phone', 'mobile', 'address', 'postal_code', 'road_address', 'jibun_address', 'detail_address', 'address_type', 'region',
    'sales_rep_id', 'payment_terms', 'opening_receivable', 'credit_limit', 'status', 'memo'
  ]);
  if (Object.prototype.hasOwnProperty.call(data, 'name') && !clean(data.name)) {
    throw badRequest('거래처명은 필수입니다.');
  }
  for (const key of ['code', 'business_no', 'owner_name', 'phone', 'mobile', 'address', 'postal_code', 'road_address', 'jibun_address', 'detail_address', 'address_type', 'region', 'payment_terms', 'status', 'memo']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  for (const key of ['phone', 'mobile']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = normalizePhoneValue(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sales_rep_id')) data.sales_rep_id = data.sales_rep_id ? toInt(data.sales_rep_id) : null;
  if (Object.prototype.hasOwnProperty.call(data, 'opening_receivable')) data.opening_receivable = toMoney(data.opening_receivable);
  if (Object.prototype.hasOwnProperty.call(data, 'credit_limit')) data.credit_limit = toMoney(data.credit_limit);
  return data;
}

function normalizeProductPayload(body) {
  const data = pick(body, [
    'sku', 'name', 'spec', 'category', 'product_type', 'brand', 'model_no', 'color_code', 'color_name',
    'size_eye', 'bridge_size', 'temple_length', 'lens_width', 'frame_width', 'frame_material', 'lens_material',
    'gender', 'origin', 'barcode', 'material_id', 'unit', 'default_price', 'current_stock', 'safety_stock',
    'production_lot_size', 'popularity_grade', 'location', 'status', 'memo'
  ]);
  if (Object.prototype.hasOwnProperty.call(data, 'name') && !clean(data.name)) {
    throw badRequest('제품명은 필수입니다.');
  }
  for (const key of ['sku', 'name', 'spec', 'category', 'product_type', 'brand', 'model_no', 'color_code', 'color_name', 'frame_material', 'lens_material', 'gender', 'origin', 'barcode', 'unit', 'popularity_grade', 'location', 'status', 'memo']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  for (const key of ['size_eye', 'bridge_size', 'temple_length', 'material_id']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = data[key] ? toInt(data[key]) : null;
  }
  for (const key of ['lens_width', 'frame_width']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = data[key] ? toMoney(data[key]) : null;
  }
  if (!data.sku && data.name) data.sku = `SKU-${Date.now()}`;
  if (Object.prototype.hasOwnProperty.call(data, 'default_price')) data.default_price = toMoney(data.default_price);
  for (const key of ['current_stock', 'safety_stock', 'production_lot_size']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = toInt(data[key]);
  }
  return data;
}

function normalizeCodeGroupPayload(body) {
  const data = pick(body, ['group_code', 'group_name', 'description', 'sort_order', 'is_active']);
  for (const key of ['group_code', 'group_name', 'description']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sort_order')) data.sort_order = toInt(data.sort_order);
  if (Object.prototype.hasOwnProperty.call(data, 'is_active')) data.is_active = data.is_active ? 1 : 0;
  return data;
}

function normalizeCodeItemPayload(body) {
  const data = pick(body, ['group_id', 'item_code', 'item_name', 'item_value', 'sort_order', 'is_active', 'memo']);
  for (const key of ['item_code', 'item_name', 'item_value', 'memo']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'group_id')) data.group_id = toInt(data.group_id);
  if (Object.prototype.hasOwnProperty.call(data, 'sort_order')) data.sort_order = toInt(data.sort_order);
  if (Object.prototype.hasOwnProperty.call(data, 'is_active')) data.is_active = data.is_active ? 1 : 0;
  return data;
}

function normalizeMaterialPayload(body) {
  const data = pick(body, [
    'material_code', 'material_name', 'material_type', 'unit', 'default_purchase_price', 'current_stock',
    'safety_stock', 'supplier_name', 'location', 'status', 'memo'
  ]);
  for (const key of ['material_code', 'material_name', 'material_type', 'unit', 'supplier_name', 'location', 'status', 'memo']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = clean(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'default_purchase_price')) data.default_purchase_price = toMoney(data.default_purchase_price);
  for (const key of ['current_stock', 'safety_stock']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = toInt(data[key]);
  }
  if (!data.material_code && data.material_name) data.material_code = `MAT-${Date.now()}`;
  return data;
}

async function receivableBalance(conn, customerId) {
  const [rows] = await conn.execute(
    `SELECT c.opening_receivable + COALESCE(SUM(rt.amount), 0) AS balance
       FROM customers c
       LEFT JOIN receivable_transactions rt ON rt.customer_id = c.id
      WHERE c.id = ?
      GROUP BY c.id, c.opening_receivable`,
    [customerId]
  );
  return Number(rows[0]?.balance || 0);
}

async function addReceivable(conn, payload, req) {
  const beforeBalance = await receivableBalance(conn, payload.customer_id);
  const afterBalance = beforeBalance + Number(payload.amount || 0);
  const [result] = await conn.execute(
    `INSERT INTO receivable_transactions(customer_id, customer_site_id, delivery_type, txn_date, txn_type, order_id, payment_id, amount, balance_after, memo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.customer_id,
      payload.customer_site_id || null,
      normalizeDeliveryType(payload.delivery_type),
      payload.txn_date || todayKst(),
      payload.txn_type,
      payload.order_id || null,
      payload.payment_id || null,
      payload.amount,
      afterBalance,
      payload.memo || null,
      req.user?.id || null
    ]
  );
  const after = await getRecord(conn, 'receivable_transactions', result.insertId);
  await auditLog(conn, 'receivable_transactions', result.insertId, 'INSERT', null, after, req);
  return { id: result.insertId, balance_after: afterBalance };
}

function suggestedLot(product) {
  const configured = toInt(product.production_lot_size, 0);
  if (configured > 0) return configured;
  const grade = String(product.popularity_grade || 'C').toUpperCase();
  if (grade === 'A') return 1000;
  if (grade === 'B') return 500;
  return 300;
}

function suggestedProductionQty(product) {
  const shortage = Math.max(toInt(product.safety_stock) - toInt(product.current_stock), 0);
  const lot = suggestedLot(product);
  return shortage > 0 ? Math.max(lot, Math.ceil(shortage / lot) * lot) : lot;
}

async function normalizeOrderItems(conn, items) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('주문 품목을 1개 이상 입력하세요.');
  const normalizedItems = [];
  for (const raw of items) {
    const productId = raw.product_id ? toInt(raw.product_id) : null;
    let product = null;
    if (productId) {
      const [productRows] = await conn.execute("SELECT * FROM products WHERE id = ? AND status <> 'deleted'", [productId]);
      product = productRows[0];
      if (!product) throw badRequest(`제품 ID ${productId}를 찾을 수 없습니다.`);
    }
    const quantity = toInt(raw.quantity);
    if (quantity === 0) throw badRequest('품목 수량은 0이 될 수 없습니다.');
    const unitPrice = raw.unit_price !== undefined && raw.unit_price !== null && raw.unit_price !== ''
      ? toMoney(raw.unit_price)
      : toMoney(product?.default_price);
    const itemName = clean(raw.item_name) || product?.name;
    if (!itemName) throw badRequest('품목명을 입력하세요.');
    normalizedItems.push({
      product_id: productId,
      item_name: itemName,
      spec: clean(raw.spec) || product?.spec || null,
      quantity,
      unit_price: unitPrice,
      amount: quantity * unitPrice,
      memo: clean(raw.memo)
    });
  }
  return normalizedItems;
}

api.get('/health', asyncHandler(async (req, res) => {
  const pool = await initDb();
  const [rows] = await pool.query('SELECT 1 AS ok');
  respond(res, { status: 'ok', database: rows[0]?.ok === 1, time: new Date().toISOString() });
}));

api.post('/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const pool = await initDb();
  const username = clean(req.body.username);
  const password = String(req.body.password || '');
  if (!username || !password) throw badRequest('아이디와 비밀번호를 입력하세요.');

  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.password_hash, u.full_name, u.email, u.phone, u.role_id, u.is_active,
            r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1`,
    [username, username]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw forbidden('계정 정보가 올바르지 않습니다.');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw forbidden('계정 정보가 올바르지 않습니다.');
  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const loaded = await loadUserById(user.id);
  const token = jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  respond(res, { token, user: publicUser(loaded) });
}));

api.use(authRequired);

// MT_OPTICS_FINAL_BACKEND_V304
api.use('/final', createFinalEnhancementsRouter());

api.get('/auth/me', asyncHandler(async (req, res) => {
  respond(res, publicUser(req.user));
}));

api.post('/auth/logout', asyncHandler(async (req, res) => {
  respond(res, { message: '로그아웃되었습니다.' });
}));

api.post('/system/shutdown', asyncHandler(async (req, res) => {
  if (req.user.role_name !== 'admin') throw forbidden('관리자만 프로그램을 종료할 수 있습니다.');
  if (!['1', 'true', 'yes', 'on'].includes(String(process.env.ALLOW_REMOTE_SHUTDOWN || 'false').toLowerCase())) {
    throw forbidden('운영 서버에서는 원격 프로그램 종료가 비활성화되어 있습니다. PM2로 재시작하거나 중지하세요.');
  }
  respond(res, { message: '데이터베이스 연결을 정상 종료하고 프로그램을 종료합니다.' });
  setTimeout(async () => {
    try { await closeDb(); } catch (error) { console.error(error); }
    if (!process.env.NETLIFY) process.exit(0);
  }, 300);
}));

api.get('/meta', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [roles] = await pool.query('SELECT id, name, label, description FROM roles ORDER BY id');
  respond(res, { roles, permissions: permissionSeed.map(([code, label, module]) => ({ code, label, module })) });
}));

api.get('/code-groups', requirePermission('masters.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query('SELECT * FROM code_groups ORDER BY sort_order, group_code');
  respond(res, rows);
}));

api.post('/code-groups', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const data = normalizeCodeGroupPayload(req.body);
  if (!data.group_code || !data.group_name) throw badRequest('그룹코드와 그룹명은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    const fields = Object.keys(data);
    const [result] = await conn.execute(`INSERT INTO code_groups(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(data));
    const after = await getRecord(conn, 'code_groups', result.insertId);
    await auditLog(conn, 'code_groups', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/code-groups/:id', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'code_groups', id);
    if (!before) throw notFound('코드그룹을 찾을 수 없습니다.');
    const data = normalizeCodeGroupPayload(req.body);
    const fields = Object.keys(data);
    if (fields.length) await conn.execute(`UPDATE code_groups SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, Object.values(data).concat([id]));
    const after = await getRecord(conn, 'code_groups', id);
    await auditLog(conn, 'code_groups', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.get('/code-items', requirePermission('masters.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const groupCode = clean(req.query.group_code);
  const params = [];
  let where = 'WHERE 1=1';
  if (groupCode) {
    where += ' AND g.group_code = ?';
    params.push(groupCode);
  }
  const [rows] = await pool.execute(
    `SELECT ci.*, g.group_code, g.group_name
       FROM code_items ci
       JOIN code_groups g ON g.id = ci.group_id
       ${where}
      ORDER BY g.sort_order, g.group_code, ci.sort_order, ci.item_code`,
    params
  );
  respond(res, rows);
}));

api.post('/code-items', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const data = normalizeCodeItemPayload(req.body);
  if (!data.group_id || !data.item_code || !data.item_name) throw badRequest('그룹, 코드, 명칭은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    const fields = Object.keys(data);
    const [result] = await conn.execute(`INSERT INTO code_items(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(data));
    const after = await getRecord(conn, 'code_items', result.insertId);
    await auditLog(conn, 'code_items', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/code-items/:id', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'code_items', id);
    if (!before) throw notFound('코드항목을 찾을 수 없습니다.');
    const data = normalizeCodeItemPayload(req.body);
    const fields = Object.keys(data);
    if (fields.length) await conn.execute(`UPDATE code_items SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, Object.values(data).concat([id]));
    const after = await getRecord(conn, 'code_items', id);
    await auditLog(conn, 'code_items', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.get('/materials', requirePermission('masters.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const q = clean(req.query.q);
  const params = [];
  let where = "WHERE status <> 'deleted'";
  if (q) {
    where += ' AND (material_code LIKE ? OR material_name LIKE ? OR material_type LIKE ? OR supplier_name LIKE ? OR location LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const [rows] = await pool.execute(`SELECT * FROM materials ${where} ORDER BY updated_at DESC ${limitOffsetClause(req)}`, params);
  respond(res, rows);
}));

api.post('/materials', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const data = normalizeMaterialPayload(req.body);
  if (!data.material_name) throw badRequest('자재명은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    data.created_by = req.user.id;
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    const [result] = await conn.execute(`INSERT INTO materials(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(data));
    const after = await getRecord(conn, 'materials', result.insertId);
    await auditLog(conn, 'materials', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/materials/:id', requirePermission('masters.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'materials', id);
    if (!before) throw notFound('자재를 찾을 수 없습니다.');
    const data = normalizeMaterialPayload(req.body);
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    if (fields.length) await conn.execute(`UPDATE materials SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, Object.values(data).concat([id]));
    const after = await getRecord(conn, 'materials', id);
    await auditLog(conn, 'materials', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.get('/imports/batches', requirePermission('imports.manage'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.execute(
    `SELECT ib.*, u.full_name AS imported_by_name
       FROM import_batches ib
       LEFT JOIN users u ON u.id = ib.imported_by
      ORDER BY ib.imported_at DESC, ib.id DESC
      ${limitOffsetClause(req, 100, 300)}`
  );
  respond(res, rows.map((row) => ({ ...row, file_name: normalizeUploadedFileName(row.file_name) })));
}));

api.get('/imports/batches/:id/errors', requirePermission('imports.manage'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.execute('SELECT * FROM import_errors WHERE import_batch_id = ? ORDER BY id', [toInt(req.params.id)]);
  respond(res, rows);
}));

api.post('/imports/excel', requirePermission('imports.manage'), upload.array('files', 10), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) throw badRequest('업로드할 엑셀 파일을 선택하세요.');
  const pool = await getPool();
  const results = [];
  for (const file of req.files) {
    if (!isExcelFileBuffer(file.buffer)) {
      throw badRequest(`${normalizeUploadedFileName(file.originalname)}: 파일 내용이 올바른 Excel 형식이 아닙니다.`);
    }
    const result = await importExcelBuffer(pool, {
      buffer: file.buffer,
      fileName: normalizeUploadedFileNameFinal(file.originalname),
      importedBy: req.user.id,
      auditUserId: req.user.id
    });
    results.push(result);
  }
  respond(res, results);
}));

api.get('/dashboard', requirePermission('dashboard.view'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [[customerStats]] = await pool.query('SELECT COUNT(*) AS total_customers FROM customers WHERE status <> \'deleted\'');
  const [[productStats]] = await pool.query(
    `SELECT COUNT(*) AS total_products,
            SUM(CASE WHEN current_stock < safety_stock THEN 1 ELSE 0 END) AS low_stock_count
       FROM products WHERE status <> 'deleted'`
  );
  const [[orderStats]] = await pool.query(
    `SELECT SUM(CASE WHEN status NOT IN ('delivered', 'canceled') THEN 1 ELSE 0 END) AS open_orders,
            COALESCE(SUM(CASE WHEN status <> 'canceled' AND order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN total_amount ELSE 0 END), 0) AS sales_30d
       FROM sales_orders
      WHERE deleted_at IS NULL`
  );
  const [[paymentStats]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN payment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN amount ELSE 0 END), 0) AS payments_30d
       FROM payments
      WHERE deleted_at IS NULL`
  );
  const [[receivableStats]] = await pool.query(
    `SELECT COALESCE(SUM(receivable_balance), 0) AS total_receivable FROM v_customer_receivable_balance`
  );
  const [[productionStats]] = await pool.query(
    `SELECT COUNT(*) AS pending_production FROM production_orders WHERE status IN ('planned','issued','in_progress')`
  );
  const [lowStock] = await pool.query(
    `SELECT id, sku, name, spec, current_stock, safety_stock, production_lot_size, popularity_grade,
            GREATEST(safety_stock - current_stock, 0) AS shortage
       FROM products
      WHERE status <> 'deleted' AND current_stock < safety_stock
      ORDER BY shortage DESC, name
      LIMIT 10`
  );
  const [recentOrders] = await pool.query(
    `SELECT so.id, so.order_no, so.order_date, so.status, so.delivery_type, so.delivery_group, so.total_amount, c.name AS customer_name
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
      WHERE so.deleted_at IS NULL
      ORDER BY so.created_at DESC
      LIMIT 8`
  );
  const [recentPayments] = await pool.query(
    `SELECT p.id, p.payment_no, p.payment_date, p.delivery_type, p.method, p.amount, c.name AS customer_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 8`
  );
  respond(res, {
    stats: {
      total_customers: Number(customerStats.total_customers || 0),
      total_products: Number(productStats.total_products || 0),
      low_stock_count: Number(productStats.low_stock_count || 0),
      open_orders: Number(orderStats.open_orders || 0),
      sales_30d: Number(orderStats.sales_30d || 0),
      payments_30d: Number(paymentStats.payments_30d || 0),
      total_receivable: Number(receivableStats.total_receivable || 0),
      pending_production: Number(productionStats.pending_production || 0)
    },
    low_stock: lowStock.map((p) => ({ ...p, suggested_qty: suggestedProductionQty(p) })),
    recent_orders: recentOrders,
    recent_payments: recentPayments
  });
}));

api.get('/customers', requirePermission('customers.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE c.status <> \'deleted\'';
  const q = clean(req.query.q);
  if (q) {
    where += ' AND (c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.mobile LIKE ? OR c.business_no LIKE ? OR c.address LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (clean(req.query.status)) {
    where += ' AND c.status = ?';
    params.push(clean(req.query.status));
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT c.*, u.full_name AS sales_rep_name,
            COALESCE(v.receivable_balance, c.opening_receivable) AS receivable_balance,
            (SELECT COUNT(*) FROM customer_sites cs WHERE cs.customer_id = c.id AND cs.status <> 'deleted') AS site_count,
            (SELECT COALESCE(SUM(receivable_balance),0) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.delivery_type = '택배') AS parcel_receivable,
            (SELECT COALESCE(SUM(receivable_balance),0) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.delivery_type = '영업방문') AS visit_receivable,
            (SELECT COALESCE(SUM(receivable_balance),0) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.delivery_type = '기타') AS other_receivable
       FROM customers c
       LEFT JOIN users u ON u.id = c.sales_rep_id
       LEFT JOIN v_customer_receivable_balance v ON v.customer_id = c.id
       ${where}
      ORDER BY c.updated_at DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.get('/customers/:id/ledger', requirePermission('customers.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const customerId = toInt(req.params.id);
  const [customerRows] = await pool.execute('SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!customerRows[0]) throw notFound('거래처를 찾을 수 없습니다.');
  const [rows] = await pool.execute(
    `SELECT rt.*, so.order_no, p.payment_no, cs.site_name, cs.region, u.full_name AS created_by_name
       FROM receivable_transactions rt
       LEFT JOIN sales_orders so ON so.id = rt.order_id
       LEFT JOIN payments p ON p.id = rt.payment_id
       LEFT JOIN customer_sites cs ON cs.id = rt.customer_site_id
       LEFT JOIN users u ON u.id = rt.created_by
      WHERE rt.customer_id = ?
      ORDER BY rt.txn_date DESC, rt.id DESC
      LIMIT 300`,
    [customerId]
  );
  respond(res, { customer: customerRows[0], rows });
}));

api.post('/customers', requirePermission('customers.write'), asyncHandler(async (req, res) => {
  const data = normalizeCustomerPayload(req.body);
  if (!data.name) throw badRequest('거래처명은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    const fields = Object.keys(data).concat(['created_by', 'updated_by']);
    const values = Object.values(data).concat([req.user.id, req.user.id]);
    const marks = fields.map(() => '?').join(', ');
    const [result] = await conn.execute(`INSERT INTO customers(${fields.join(', ')}) VALUES (${marks})`, values);
    const after = await getRecord(conn, 'customers', result.insertId);
    await auditLog(conn, 'customers', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/customers/:id', requirePermission('customers.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'customers', id);
    if (!before) throw notFound('거래처를 찾을 수 없습니다.');
    const data = normalizeCustomerPayload(req.body);
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    if (fields.length > 0) {
      await conn.execute(
        `UPDATE customers SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        Object.values(data).concat([id])
      );
    }
    const after = await getRecord(conn, 'customers', id);
    await auditLog(conn, 'customers', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.get('/customer-sites', requirePermission('customers.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = "WHERE cs.status <> 'deleted'";
  const customerId = toInt(req.query.customer_id, 0);
  if (customerId) {
    where += ' AND cs.customer_id = ?';
    params.push(customerId);
  }
  const q = clean(req.query.q);
  if (q) {
    where += ' AND (c.name LIKE ? OR cs.site_name LIKE ? OR cs.original_customer_name LIKE ? OR cs.region LIKE ? OR cs.address LIKE ? OR cs.phone LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT cs.*, c.name AS customer_name, c.code AS customer_code,
            COALESCE(v.receivable_balance, cs.opening_receivable) AS receivable_balance
       FROM customer_sites cs
       JOIN customers c ON c.id = cs.customer_id
       LEFT JOIN v_customer_site_receivable_balance v ON v.customer_site_id = cs.id
       ${where}
      ORDER BY c.name, cs.site_name, cs.default_delivery_type
      ${limitOffsetClause(req, 300, 1000)}`,
    params
  );
  respond(res, rows);
}));

api.post('/customer-sites', requirePermission('customers.write'), asyncHandler(async (req, res) => {
  const data = normalizeCustomerSitePayload(req.body);
  if (!data.customer_id) throw badRequest('거래처를 선택하세요.');
  if (!data.site_name) throw badRequest('납품처/지역명은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    const [customers] = await conn.execute('SELECT id FROM customers WHERE id = ?', [data.customer_id]);
    if (!customers[0]) throw notFound('거래처를 찾을 수 없습니다.');
    data.default_delivery_type = normalizeDeliveryType(data.default_delivery_type);
    data.created_by = req.user.id;
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    const [result] = await conn.execute(`INSERT INTO customer_sites(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(data));
    const after = await getRecord(conn, 'customer_sites', result.insertId);
    await auditLog(conn, 'customer_sites', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/customer-sites/:id', requirePermission('customers.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'customer_sites', id);
    if (!before) throw notFound('납품처를 찾을 수 없습니다.');
    const data = normalizeCustomerSitePayload(req.body);
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    if (fields.length) await conn.execute(`UPDATE customer_sites SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, Object.values(data).concat([id]));
    const after = await getRecord(conn, 'customer_sites', id);
    await auditLog(conn, 'customer_sites', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.get('/receivables/by-delivery', requirePermission('payments.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE 1=1';
  const customerId = toInt(req.query.customer_id, 0);
  if (customerId) { where += ' AND customer_id = ?'; params.push(customerId); }
  const [rows] = await pool.execute(
    `SELECT * FROM v_customer_receivable_by_delivery_type
      ${where}
     ORDER BY customer_name, site_name, FIELD(delivery_type, '택배', '영업방문', '기타'), delivery_type`,
    params
  );
  respond(res, rows);
}));

api.get('/products', requirePermission('products.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE status <> \'deleted\'';
  const q = clean(req.query.q);
  if (q) {
    where += ' AND (sku LIKE ? OR name LIKE ? OR spec LIKE ? OR category LIKE ? OR brand LIKE ? OR model_no LIKE ? OR color_name LIKE ? OR barcode LIKE ? OR location LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }
  if (clean(req.query.low_stock) === '1') {
    where += ' AND current_stock < safety_stock';
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT *, GREATEST(safety_stock - current_stock, 0) AS shortage
       FROM products
       ${where}
      ORDER BY shortage DESC, updated_at DESC
      ${limitClause}`,
    params
  );
  respond(res, rows.map((p) => ({ ...p, suggested_qty: suggestedProductionQty(p) })));
}));

api.post('/products', requirePermission('products.write'), asyncHandler(async (req, res) => {
  const data = normalizeProductPayload(req.body);
  if (!data.name) throw badRequest('제품명은 필수입니다.');
  if (!data.sku) data.sku = `SKU-${Date.now()}`;
  const inserted = await withTransaction(async (conn) => {
    data.created_by = req.user.id;
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    const [result] = await conn.execute(
      `INSERT INTO products(${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      Object.values(data)
    );
    const after = await getRecord(conn, 'products', result.insertId);
    await auditLog(conn, 'products', result.insertId, 'INSERT', null, after, req);
    if (toInt(after.current_stock) !== 0) {
      await conn.execute(
        `INSERT INTO inventory_transactions(product_id, txn_type, qty_change, stock_after, ref_table, ref_id, memo, created_by)
         VALUES (?, 'initial', ?, ?, 'products', ?, '초기재고', ?)`,
        [after.id, after.current_stock, after.current_stock, after.id, req.user.id]
      );
    }
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/products/:id', requirePermission('products.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'products', id);
    if (!before) throw notFound('제품을 찾을 수 없습니다.');
    const data = normalizeProductPayload(req.body);
    data.updated_by = req.user.id;
    const fields = Object.keys(data);
    if (fields.length > 0) {
      await conn.execute(
        `UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        Object.values(data).concat([id])
      );
    }
    const after = await getRecord(conn, 'products', id);
    await auditLog(conn, 'products', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, updated);
}));

api.post('/products/:id/adjust-stock', requirePermission('inventory.write'), asyncHandler(async (req, res) => {
  const productId = toInt(req.params.id);
  const qtyChange = toInt(req.body.qty_change);
  if (qtyChange === 0) throw badRequest('재고 조정 수량을 입력하세요.');
  const result = await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId]);
    const before = rows[0];
    if (!before) throw notFound('제품을 찾을 수 없습니다.');
    const stockAfter = toInt(before.current_stock) + qtyChange;
    await conn.execute('UPDATE products SET current_stock = ?, updated_by = ? WHERE id = ?', [stockAfter, req.user.id, productId]);
    const [tx] = await conn.execute(
      `INSERT INTO inventory_transactions(product_id, txn_type, qty_change, stock_after, ref_table, ref_id, memo, created_by)
       VALUES (?, 'adjustment', ?, ?, 'products', ?, ?, ?)`,
      [productId, qtyChange, stockAfter, productId, clean(req.body.memo) || '수기 재고조정', req.user.id]
    );
    const after = await getRecord(conn, 'products', productId);
    await auditLog(conn, 'products', productId, 'UPDATE', before, after, req);
    const inventoryAfter = await getRecord(conn, 'inventory_transactions', tx.insertId);
    await auditLog(conn, 'inventory_transactions', tx.insertId, 'INSERT', null, inventoryAfter, req);
    return { product: after, inventory_transaction: inventoryAfter };
  });
  respond(res, result);
}));

api.get('/inventory-transactions', requirePermission('products.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const productId = toInt(req.query.product_id, 0);
  const params = [];
  let where = 'WHERE 1=1';
  if (productId) {
    where += ' AND it.product_id = ?';
    params.push(productId);
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT it.*, pr.sku, pr.name AS product_name, u.full_name AS created_by_name
       FROM inventory_transactions it
       JOIN products pr ON pr.id = it.product_id
       LEFT JOIN users u ON u.id = it.created_by
       ${where}
      ORDER BY it.txn_date DESC, it.id DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.get('/orders', requirePermission('orders.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE so.deleted_at IS NULL';
  const q = clean(req.query.q);
  if (q) {
    where += ' AND (so.order_no LIKE ? OR c.name LIKE ? OR cs.site_name LIKE ? OR so.delivery_type LIKE ? OR so.delivery_group LIKE ? OR so.status LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (clean(req.query.status)) {
    where += ' AND so.status = ?';
    params.push(clean(req.query.status));
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT so.*, c.name AS customer_name, c.code AS customer_code, cs.site_name, cs.region, u.full_name AS created_by_name,
            COUNT(oi.id) AS item_count
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
       LEFT JOIN users u ON u.id = so.created_by
       LEFT JOIN order_items oi ON oi.order_id = so.id
       ${where}
      GROUP BY so.id
      ORDER BY so.created_at DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.get('/orders/:id', requirePermission('orders.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const id = toInt(req.params.id);
  const [orders] = await pool.execute(
    `SELECT so.*, c.name AS customer_name, c.phone, c.mobile, c.address, cs.site_name, cs.region, cs.address AS site_address, cs.phone AS site_phone
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
      WHERE so.id = ? AND so.deleted_at IS NULL`,
    [id]
  );
  if (!orders[0]) throw notFound('주문을 찾을 수 없습니다.');
  const [items] = await pool.execute(
    `SELECT oi.*, p.sku, p.current_stock
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id`,
    [id]
  );
  const [shipments] = await pool.execute('SELECT * FROM shipments WHERE order_id = ? ORDER BY id DESC', [id]);
  respond(res, { order: orders[0], items, shipments });
}));

api.post('/orders', requirePermission('orders.write'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const customerId = toInt(body.customer_id);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!customerId) throw badRequest('거래처를 선택하세요.');
  if (items.length === 0) throw badRequest('주문 품목을 1개 이상 입력하세요.');

  const created = await withTransaction(async (conn) => {
    const [customerRows] = await conn.execute('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customerRows[0]) throw notFound('거래처를 찾을 수 없습니다.');
    const customerSiteId = body.customer_site_id ? toInt(body.customer_site_id) : null;
    let customerSite = null;
    if (customerSiteId) {
      const [siteRows] = await conn.execute('SELECT * FROM customer_sites WHERE id = ? AND customer_id = ?', [customerSiteId, customerId]);
      customerSite = siteRows[0];
      if (!customerSite) throw badRequest('선택한 납품처가 거래처와 일치하지 않습니다.');
    } else {
      const [siteRows] = await conn.execute("SELECT * FROM customer_sites WHERE customer_id = ? AND status <> 'deleted' ORDER BY id LIMIT 1", [customerId]);
      customerSite = siteRows[0] || null;
    }
    const deliveryType = normalizeDeliveryType(body.delivery_type || body.delivery_method || customerSite?.default_delivery_type);

    const normalizedItems = [];
    for (const raw of items) {
      const productId = raw.product_id ? toInt(raw.product_id) : null;
      let product = null;
      if (productId) {
        const [productRows] = await conn.execute('SELECT * FROM products WHERE id = ?', [productId]);
        product = productRows[0];
        if (!product) throw badRequest(`제품 ID ${productId}를 찾을 수 없습니다.`);
      }
      const quantity = toInt(raw.quantity);
      if (quantity === 0) throw badRequest('품목 수량은 0이 될 수 없습니다.');
      const unitPrice = raw.unit_price !== undefined && raw.unit_price !== null && raw.unit_price !== ''
        ? toMoney(raw.unit_price)
        : toMoney(product?.default_price);
      const itemName = clean(raw.item_name) || product?.name;
      if (!itemName) throw badRequest('품목명을 입력하세요.');
      const amount = quantity * unitPrice;
      normalizedItems.push({
        product_id: productId,
        item_name: itemName,
        spec: clean(raw.spec) || product?.spec || null,
        quantity,
        unit_price: unitPrice,
        amount,
        memo: clean(raw.memo)
      });
    }

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const vat = toMoney(body.vat_amount, 0);
    const total = subtotal + vat;
    const orderNo = clean(body.order_no) || generateNo('SO');
    const orderDate = clean(body.order_date) || todayKst();
    const [orderResult] = await conn.execute(
      `INSERT INTO sales_orders(order_no, order_date, customer_id, customer_site_id, source, delivery_type, delivery_group, delivery_method, status,
                                subtotal, vat_amount, total_amount, receivable_posted, memo, ordered_by, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        orderNo,
        orderDate,
        customerId,
        customerSite?.id || null,
        clean(body.source) || 'phone',
        deliveryType,
        clean(body.delivery_group) || customerSite?.default_delivery_group || '기타',
        clean(body.delivery_method) || deliveryType,
        clean(body.status) || 'confirmed',
        subtotal,
        vat,
        total,
        clean(body.memo),
        body.ordered_by ? toInt(body.ordered_by) : req.user.id,
        req.user.id,
        req.user.id
      ]
    );
    const orderId = orderResult.insertId;
    for (const item of normalizedItems) {
      await conn.execute(
        `INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.item_name, item.spec, item.quantity, item.unit_price, item.amount, item.memo]
      );
    }
    await addReceivable(conn, {
      customer_id: customerId,
      txn_date: orderDate,
      txn_type: total >= 0 ? 'SALE' : 'RETURN',
      order_id: orderId,
      customer_site_id: customerSite?.id || null,
      delivery_type: deliveryType,
      amount: total,
      memo: `주문 ${orderNo}`
    }, req);
    const after = await getRecord(conn, 'sales_orders', orderId);
    const [afterItems] = await conn.execute('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    await auditLog(conn, 'sales_orders', orderId, 'INSERT', null, { ...after, items: afterItems }, req);
    return { order: after, items: afterItems };
  });
  respond(res, created, 201);
}));

api.put('/orders/:id', requirePermission('orders.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const body = req.body || {};
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'sales_orders', id);
    if (!before || before.deleted_at) throw notFound('주문을 찾을 수 없습니다.');
    assertCanModifyRecord(req, before, ['created_by', 'ordered_by']);
    const [[shipmentCount]] = await conn.execute('SELECT COUNT(*) AS cnt FROM shipments WHERE order_id = ?', [id]);
    if (Number(shipmentCount.cnt || 0) > 0) throw badRequest('이미 출고된 주문은 직접 수정할 수 없습니다. 관리자에게 재고·출고 정정을 요청하세요.');

    const customerId = body.customer_id ? toInt(body.customer_id) : before.customer_id;
    const [customerRows] = await conn.execute("SELECT * FROM customers WHERE id = ? AND status <> 'deleted'", [customerId]);
    if (!customerRows[0]) throw notFound('거래처를 찾을 수 없습니다.');
    const customerSiteId = body.customer_site_id ? toInt(body.customer_site_id) : (before.customer_site_id || null);
    let customerSite = null;
    if (customerSiteId) {
      const [siteRows] = await conn.execute("SELECT * FROM customer_sites WHERE id = ? AND customer_id = ? AND status <> 'deleted'", [customerSiteId, customerId]);
      customerSite = siteRows[0];
      if (!customerSite) throw badRequest('선택한 납품처가 거래처와 일치하지 않습니다.');
    }

    const [beforeItems] = await conn.execute('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
    const normalizedItems = body.items ? await normalizeOrderItems(conn, body.items) : beforeItems.map((item) => ({
      product_id: item.product_id,
      item_name: item.item_name,
      spec: item.spec,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
      memo: item.memo
    }));
    const subtotal = normalizedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const vat = body.vat_amount !== undefined ? toMoney(body.vat_amount) : Number(before.vat_amount || 0);
    const total = subtotal + vat;
    const deliveryType = normalizeDeliveryType(body.delivery_type || body.delivery_method || customerSite?.default_delivery_type || before.delivery_type);

    await conn.execute(
      `UPDATE sales_orders
          SET order_date = ?, customer_id = ?, customer_site_id = ?, source = ?, delivery_type = ?, delivery_group = ?, delivery_method = ?,
              subtotal = ?, vat_amount = ?, total_amount = ?, memo = ?, ordered_by = ?, updated_by = ?
        WHERE id = ?`,
      [
        clean(body.order_date) || dateText(before.order_date, todayKst()),
        customerId,
        customerSite?.id || null,
        clean(body.source) || before.source,
        deliveryType,
        clean(body.delivery_group) || customerSite?.default_delivery_group || before.delivery_group || '기타',
        clean(body.delivery_method) || deliveryType,
        subtotal,
        vat,
        total,
        body.memo !== undefined ? clean(body.memo) : before.memo,
        body.ordered_by ? toInt(body.ordered_by) : (before.ordered_by || req.user.id),
        req.user.id,
        id
      ]
    );

    if (body.items) {
      await conn.execute('DELETE FROM order_items WHERE order_id = ?', [id]);
      for (const item of normalizedItems) {
        await conn.execute(
          `INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.product_id, item.item_name, item.spec, item.quantity, item.unit_price, item.amount, item.memo]
        );
      }
    }

    const difference = total - Number(before.total_amount || 0);
    if (before.receivable_posted && Math.abs(difference) > 0.0001) {
      await addReceivable(conn, {
        customer_id: customerId,
        txn_date: clean(body.order_date) || todayKst(),
        txn_type: 'ADJUSTMENT',
        order_id: id,
        customer_site_id: customerSite?.id || null,
        delivery_type: deliveryType,
        amount: difference,
        memo: `주문수정 ${before.order_no}`
      }, req);
    }
    const after = await getRecord(conn, 'sales_orders', id);
    const [afterItems] = await conn.execute('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
    await auditLog(conn, 'sales_orders', id, 'UPDATE', { ...before, items: beforeItems }, { ...after, items: afterItems }, req, body.change_reason);
    return { order: after, items: afterItems };
  });
  respond(res, updated);
}));

api.delete('/orders/:id', requirePermission('orders.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const reason = clean(req.body?.delete_reason);
  if (!reason) throw badRequest('삭제 사유를 입력하세요.');
  const deleted = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'sales_orders', id);
    if (!before || before.deleted_at) throw notFound('주문을 찾을 수 없습니다.');
    assertCanModifyRecord(req, before, ['created_by', 'ordered_by']);
    const [[shipmentCount]] = await conn.execute('SELECT COUNT(*) AS cnt FROM shipments WHERE order_id = ?', [id]);
    if (Number(shipmentCount.cnt || 0) > 0) throw badRequest('출고 이력이 있는 주문은 삭제할 수 없습니다. 관리자에게 출고·재고 정정을 요청하세요.');
    if (before.receivable_posted) {
      await addReceivable(conn, {
        customer_id: before.customer_id,
        txn_date: todayKst(),
        txn_type: 'ADJUSTMENT',
        order_id: id,
        customer_site_id: before.customer_site_id || null,
        delivery_type: before.delivery_type || '택배',
        amount: -Number(before.total_amount || 0),
        memo: `주문삭제 ${before.order_no}: ${reason}`
      }, req);
    }
    await conn.execute(
      `UPDATE sales_orders
          SET status = 'deleted', receivable_posted = 0, deleted_at = NOW(), deleted_by = ?, delete_reason = ?, updated_by = ?
        WHERE id = ?`,
      [req.user.id, reason, req.user.id, id]
    );
    const after = await getRecord(conn, 'sales_orders', id);
    await auditLog(conn, 'sales_orders', id, 'DELETE', before, after, req, reason);
    return after;
  });
  respond(res, deleted);
}));

api.put('/orders/:id/status', requirePermission('orders.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const status = clean(req.body.status);
  if (!status) throw badRequest('변경할 상태를 입력하세요.');
  const result = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'sales_orders', id);
    if (!before) throw notFound('주문을 찾을 수 없습니다.');
    if (status === 'canceled' && before.receivable_posted) {
      await addReceivable(conn, {
        customer_id: before.customer_id,
        txn_date: todayKst(),
        txn_type: 'ADJUSTMENT',
        order_id: id,
        customer_site_id: before.customer_site_id || null,
        delivery_type: before.delivery_type || before.delivery_method || '택배',
        amount: -Number(before.total_amount || 0),
        memo: `주문취소 ${before.order_no}`
      }, req);
      await conn.execute('UPDATE sales_orders SET status = ?, receivable_posted = 0, updated_by = ? WHERE id = ?', [status, req.user.id, id]);
    } else {
      await conn.execute('UPDATE sales_orders SET status = ?, updated_by = ? WHERE id = ?', [status, req.user.id, id]);
    }
    const after = await getRecord(conn, 'sales_orders', id);
    await auditLog(conn, 'sales_orders', id, 'UPDATE', before, after, req);
    return after;
  });
  respond(res, result);
}));

api.post('/orders/:id/ship', requirePermission('orders.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const shipped = await withTransaction(async (conn) => {
    const beforeOrder = await getRecord(conn, 'sales_orders', id);
    if (!beforeOrder) throw notFound('주문을 찾을 수 없습니다.');
    if (beforeOrder.status === 'canceled') throw badRequest('취소된 주문은 출고할 수 없습니다.');
    const [items] = await conn.execute('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
    for (const item of items) {
      const remaining = toInt(item.quantity) - toInt(item.shipped_qty);
      if (!item.product_id || remaining === 0) continue;
      const [productRows] = await conn.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
      const beforeProduct = productRows[0];
      if (!beforeProduct) continue;
      const qtyChange = -remaining;
      const stockAfter = toInt(beforeProduct.current_stock) + qtyChange;
      await conn.execute('UPDATE products SET current_stock = ?, updated_by = ? WHERE id = ?', [stockAfter, req.user.id, item.product_id]);
      const [tx] = await conn.execute(
        `INSERT INTO inventory_transactions(product_id, txn_type, qty_change, stock_after, ref_table, ref_id, memo, created_by)
         VALUES (?, ?, ?, ?, 'sales_orders', ?, ?, ?)`,
        [item.product_id, qtyChange < 0 ? 'order_out' : 'return_in', qtyChange, stockAfter, id, `주문출고 ${beforeOrder.order_no}`, req.user.id]
      );
      await conn.execute('UPDATE order_items SET shipped_qty = quantity WHERE id = ?', [item.id]);
      const afterProduct = await getRecord(conn, 'products', item.product_id);
      await auditLog(conn, 'products', item.product_id, 'UPDATE', beforeProduct, afterProduct, req);
      const inventoryAfter = await getRecord(conn, 'inventory_transactions', tx.insertId);
      await auditLog(conn, 'inventory_transactions', tx.insertId, 'INSERT', null, inventoryAfter, req);
    }
    const [shipment] = await conn.execute(
      `INSERT INTO shipments(order_id, customer_site_id, delivery_type, delivery_group, delivery_method, carrier, invoice_no, box_no, status, shipped_at,
                             receiver_name, confirmation_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        beforeOrder.customer_site_id || null,
        normalizeDeliveryType(req.body.delivery_type || beforeOrder.delivery_type || beforeOrder.delivery_method),
        clean(req.body.delivery_group) || beforeOrder.delivery_group,
        clean(req.body.delivery_method) || beforeOrder.delivery_method,
        clean(req.body.carrier),
        clean(req.body.invoice_no),
        clean(req.body.box_no),
        clean(req.body.status) || 'shipped',
        clean(req.body.shipped_at) || new Date(),
        clean(req.body.receiver_name),
        clean(req.body.confirmation_note),
        req.user.id
      ]
    );
    await conn.execute('UPDATE sales_orders SET status = ?, updated_by = ? WHERE id = ?', [clean(req.body.order_status) || 'shipped', req.user.id, id]);
    const afterOrder = await getRecord(conn, 'sales_orders', id);
    const shipmentAfter = await getRecord(conn, 'shipments', shipment.insertId);
    await auditLog(conn, 'shipments', shipment.insertId, 'INSERT', null, shipmentAfter, req);
    await auditLog(conn, 'sales_orders', id, 'UPDATE', beforeOrder, afterOrder, req);
    return { order: afterOrder, shipment: shipmentAfter };
  });
  respond(res, shipped);
}));

api.get('/payments', requirePermission('payments.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE p.deleted_at IS NULL';
  const q = clean(req.query.q);
  if (q) {
    where += ' AND (p.payment_no LIKE ? OR c.name LIKE ? OR cs.site_name LIKE ? OR p.delivery_type LIKE ? OR p.method LIKE ? OR p.approval_no LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (clean(req.query.date_from)) {
    where += ' AND p.payment_date >= ?';
    params.push(clean(req.query.date_from));
  }
  if (clean(req.query.date_to)) {
    where += ' AND p.payment_date <= ?';
    params.push(clean(req.query.date_to));
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT p.*, c.name AS customer_name, cs.site_name, cs.region, u.full_name AS collector_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       LEFT JOIN customer_sites cs ON cs.id = p.customer_site_id
       LEFT JOIN users u ON u.id = p.collector_user_id
       ${where}
      ORDER BY p.payment_date DESC, p.id DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.post('/payments', requirePermission('payments.write'), asyncHandler(async (req, res) => {
  const customerId = toInt(req.body.customer_id);
  const amount = toMoney(req.body.amount);
  if (!customerId) throw badRequest('거래처를 선택하세요.');
  if (amount <= 0) throw badRequest('수금액은 0보다 커야 합니다.');
  const inserted = await withTransaction(async (conn) => {
    const [customers] = await conn.execute('SELECT id FROM customers WHERE id = ?', [customerId]);
    if (!customers[0]) throw notFound('거래처를 찾을 수 없습니다.');
    const customerSiteId = req.body.customer_site_id ? toInt(req.body.customer_site_id) : null;
    let customerSite = null;
    if (customerSiteId) {
      const [sites] = await conn.execute('SELECT * FROM customer_sites WHERE id = ? AND customer_id = ?', [customerSiteId, customerId]);
      customerSite = sites[0];
      if (!customerSite) throw badRequest('선택한 납품처가 거래처와 일치하지 않습니다.');
    } else if (req.body.order_id) {
      const [orders] = await conn.execute('SELECT customer_site_id, delivery_type FROM sales_orders WHERE id = ? AND customer_id = ?', [toInt(req.body.order_id), customerId]);
      if (orders[0]?.customer_site_id) {
        const [sites] = await conn.execute('SELECT * FROM customer_sites WHERE id = ?', [orders[0].customer_site_id]);
        customerSite = sites[0] || null;
      }
    } else {
      const [sites] = await conn.execute("SELECT * FROM customer_sites WHERE customer_id = ? AND status <> 'deleted' ORDER BY id LIMIT 1", [customerId]);
      customerSite = sites[0] || null;
    }
    const deliveryType = normalizeDeliveryType(req.body.delivery_type || (req.body.order_id ? (await conn.execute('SELECT delivery_type FROM sales_orders WHERE id = ?', [toInt(req.body.order_id)]))[0][0]?.delivery_type : null) || customerSite?.default_delivery_type);
    const paymentNo = clean(req.body.payment_no) || generateNo('PAY');
    const paymentDate = clean(req.body.payment_date) || todayKst();
    const [result] = await conn.execute(
      `INSERT INTO payments(payment_no, customer_id, customer_site_id, order_id, delivery_type, payment_date, method, amount, card_company, approval_no,
                            bank_name, collector_user_id, memo, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentNo,
        customerId,
        customerSite?.id || null,
        req.body.order_id ? toInt(req.body.order_id) : null,
        deliveryType,
        paymentDate,
        clean(req.body.method) || 'card',
        amount,
        clean(req.body.card_company),
        clean(req.body.approval_no),
        clean(req.body.bank_name),
        req.body.collector_user_id ? toInt(req.body.collector_user_id) : req.user.id,
        clean(req.body.memo),
        req.user.id,
        req.user.id
      ]
    );
    await addReceivable(conn, {
      customer_id: customerId,
      txn_date: paymentDate,
      txn_type: 'PAYMENT',
      payment_id: result.insertId,
      customer_site_id: customerSite?.id || null,
      delivery_type: deliveryType,
      amount: -amount,
      memo: `수금 ${paymentNo}`
    }, req);
    const after = await getRecord(conn, 'payments', result.insertId);
    await auditLog(conn, 'payments', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/payments/:id', requirePermission('payments.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const body = req.body || {};
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'payments', id);
    if (!before || before.deleted_at || before.status === 'deleted') throw notFound('수금 자료를 찾을 수 없습니다.');
    assertCanModifyRecord(req, before, ['created_by', 'collector_user_id']);
    const customerId = body.customer_id ? toInt(body.customer_id) : before.customer_id;
    const [customerRows] = await conn.execute("SELECT * FROM customers WHERE id = ? AND status <> 'deleted'", [customerId]);
    if (!customerRows[0]) throw notFound('거래처를 찾을 수 없습니다.');
    const customerSiteId = body.customer_site_id ? toInt(body.customer_site_id) : (before.customer_site_id || null);
    let customerSite = null;
    if (customerSiteId) {
      const [siteRows] = await conn.execute("SELECT * FROM customer_sites WHERE id = ? AND customer_id = ? AND status <> 'deleted'", [customerSiteId, customerId]);
      customerSite = siteRows[0];
      if (!customerSite) throw badRequest('선택한 납품처가 거래처와 일치하지 않습니다.');
    }
    const amount = body.amount !== undefined ? toMoney(body.amount) : Number(before.amount || 0);
    if (amount <= 0) throw badRequest('수금액은 0보다 커야 합니다.');
    const deliveryType = normalizeDeliveryType(body.delivery_type || customerSite?.default_delivery_type || before.delivery_type);
    const paymentDate = clean(body.payment_date) || dateText(before.payment_date, todayKst());
    await conn.execute(
      `UPDATE payments
          SET customer_id = ?, customer_site_id = ?, order_id = ?, delivery_type = ?, payment_date = ?, method = ?, amount = ?,
              card_company = ?, approval_no = ?, bank_name = ?, collector_user_id = ?, memo = ?, updated_by = ?
        WHERE id = ?`,
      [
        customerId,
        customerSite?.id || null,
        body.order_id ? toInt(body.order_id) : (before.order_id || null),
        deliveryType,
        paymentDate,
        clean(body.method) || before.method,
        amount,
        body.card_company !== undefined ? clean(body.card_company) : before.card_company,
        body.approval_no !== undefined ? clean(body.approval_no) : before.approval_no,
        body.bank_name !== undefined ? clean(body.bank_name) : before.bank_name,
        body.collector_user_id ? toInt(body.collector_user_id) : (before.collector_user_id || req.user.id),
        body.memo !== undefined ? clean(body.memo) : before.memo,
        req.user.id,
        id
      ]
    );
    const adjustment = Number(before.amount || 0) - amount;
    const changedGrouping = Number(before.customer_id) !== Number(customerId)
      || Number(before.customer_site_id || 0) !== Number(customerSite?.id || 0)
      || String(before.delivery_type || '') !== String(deliveryType || '');
    if (changedGrouping) {
      await addReceivable(conn, {
        customer_id: before.customer_id,
        txn_date: paymentDate,
        txn_type: 'ADJUSTMENT',
        payment_id: id,
        customer_site_id: before.customer_site_id || null,
        delivery_type: before.delivery_type || '택배',
        amount: Number(before.amount || 0),
        memo: `수금수정 원거래 복원 ${before.payment_no}`
      }, req);
      await addReceivable(conn, {
        customer_id: customerId,
        txn_date: paymentDate,
        txn_type: 'ADJUSTMENT',
        payment_id: id,
        customer_site_id: customerSite?.id || null,
        delivery_type: deliveryType,
        amount: -amount,
        memo: `수금수정 신규반영 ${before.payment_no}`
      }, req);
    } else if (Math.abs(adjustment) > 0.0001) {
      await addReceivable(conn, {
        customer_id: customerId,
        txn_date: paymentDate,
        txn_type: 'ADJUSTMENT',
        payment_id: id,
        customer_site_id: customerSite?.id || null,
        delivery_type: deliveryType,
        amount: adjustment,
        memo: `수금수정 ${before.payment_no}`
      }, req);
    }
    const after = await getRecord(conn, 'payments', id);
    await auditLog(conn, 'payments', id, 'UPDATE', before, after, req, body.change_reason);
    return after;
  });
  respond(res, updated);
}));

api.delete('/payments/:id', requirePermission('payments.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const reason = clean(req.body?.delete_reason);
  if (!reason) throw badRequest('삭제 사유를 입력하세요.');
  const deleted = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'payments', id);
    if (!before || before.deleted_at || before.status === 'deleted') throw notFound('수금 자료를 찾을 수 없습니다.');
    assertCanModifyRecord(req, before, ['created_by', 'collector_user_id']);
    await addReceivable(conn, {
      customer_id: before.customer_id,
      txn_date: todayKst(),
      txn_type: 'ADJUSTMENT',
      payment_id: id,
      customer_site_id: before.customer_site_id || null,
      delivery_type: before.delivery_type || '택배',
      amount: Number(before.amount || 0),
      memo: `수금삭제 ${before.payment_no}: ${reason}`
    }, req);
    await conn.execute(
      `UPDATE payments
          SET status = 'deleted', deleted_at = NOW(), deleted_by = ?, delete_reason = ?, updated_by = ?
        WHERE id = ?`,
      [req.user.id, reason, req.user.id, id]
    );
    const after = await getRecord(conn, 'payments', id);
    await auditLog(conn, 'payments', id, 'DELETE', before, after, req, reason);
    return after;
  });
  respond(res, deleted);
}));

api.get('/production-recommendations', requirePermission('production.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT id, sku, name, spec, current_stock, safety_stock, production_lot_size, popularity_grade,
            GREATEST(safety_stock - current_stock, 0) AS shortage
       FROM products
      WHERE status <> 'deleted' AND current_stock < safety_stock
      ORDER BY shortage DESC, popularity_grade, name
      LIMIT 200`
  );
  respond(res, rows.map((row) => ({ ...row, suggested_qty: suggestedProductionQty(row) })));
}));

api.get('/production-orders', requirePermission('production.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE 1=1';
  if (clean(req.query.status)) {
    where += ' AND po.status = ?';
    params.push(clean(req.query.status));
  }
  const limitClause = limitOffsetClause(req);
  const [rows] = await pool.execute(
    `SELECT po.*, p.sku, p.name AS product_name, p.spec, p.current_stock, p.safety_stock, u.full_name AS ordered_by_name
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       LEFT JOIN users u ON u.id = po.ordered_by
       ${where}
      ORDER BY po.created_at DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.post('/production-orders', requirePermission('production.write'), asyncHandler(async (req, res) => {
  const productId = toInt(req.body.product_id);
  if (!productId) throw badRequest('제품을 선택하세요.');
  const inserted = await withTransaction(async (conn) => {
    const [products] = await conn.execute('SELECT * FROM products WHERE id = ?', [productId]);
    const product = products[0];
    if (!product) throw notFound('제품을 찾을 수 없습니다.');
    const plannedQty = toInt(req.body.planned_qty, suggestedProductionQty(product));
    if (plannedQty <= 0) throw badRequest('생산지시 수량은 0보다 커야 합니다.');
    const [result] = await conn.execute(
      `INSERT INTO production_orders(production_no, product_id, planned_qty, safety_stock_at_plan, current_stock_at_plan,
                                     popularity_grade, priority, status, due_date, decision_reason, memo, ordered_by, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean(req.body.production_no) || generateNo('PO'),
        productId,
        plannedQty,
        product.safety_stock,
        product.current_stock,
        product.popularity_grade,
        clean(req.body.priority) || 'normal',
        clean(req.body.status) || 'planned',
        clean(req.body.due_date),
        clean(req.body.decision_reason) || `안전재고 ${product.safety_stock}, 현재재고 ${product.current_stock}`,
        clean(req.body.memo),
        req.user.id,
        req.body.approved_by ? toInt(req.body.approved_by) : null
      ]
    );
    const after = await getRecord(conn, 'production_orders', result.insertId);
    await auditLog(conn, 'production_orders', result.insertId, 'INSERT', null, after, req);
    return after;
  });
  respond(res, inserted, 201);
}));

api.post('/production-orders/:id/receive', requirePermission('production.write'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const qtyReceived = toInt(req.body.qty_received);
  if (qtyReceived <= 0) throw badRequest('입고 수량은 0보다 커야 합니다.');
  const result = await withTransaction(async (conn) => {
    const [orders] = await conn.execute('SELECT * FROM production_orders WHERE id = ? FOR UPDATE', [id]);
    const beforeOrder = orders[0];
    if (!beforeOrder) throw notFound('생산지시를 찾을 수 없습니다.');
    const [products] = await conn.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [beforeOrder.product_id]);
    const beforeProduct = products[0];
    if (!beforeProduct) throw notFound('제품을 찾을 수 없습니다.');
    const newStock = toInt(beforeProduct.current_stock) + qtyReceived;
    const newReceived = toInt(beforeOrder.received_qty) + qtyReceived;
    const newStatus = newReceived >= toInt(beforeOrder.planned_qty) ? 'completed' : 'in_progress';
    await conn.execute('UPDATE products SET current_stock = ?, updated_by = ? WHERE id = ?', [newStock, req.user.id, beforeProduct.id]);
    await conn.execute(
      `UPDATE production_orders SET received_qty = ?, status = ?, completed_at = CASE WHEN ? = 'completed' THEN NOW() ELSE completed_at END WHERE id = ?`,
      [newReceived, newStatus, newStatus, id]
    );
    const [receipt] = await conn.execute(
      `INSERT INTO production_receipts(production_order_id, product_id, qty_received, received_at, received_by, memo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, beforeProduct.id, qtyReceived, clean(req.body.received_at) || new Date(), req.user.id, clean(req.body.memo)]
    );
    const [tx] = await conn.execute(
      `INSERT INTO inventory_transactions(product_id, txn_type, qty_change, stock_after, ref_table, ref_id, memo, created_by)
       VALUES (?, 'production_in', ?, ?, 'production_orders', ?, ?, ?)`,
      [beforeProduct.id, qtyReceived, newStock, id, `생산입고 ${beforeOrder.production_no}`, req.user.id]
    );
    const afterOrder = await getRecord(conn, 'production_orders', id);
    const afterProduct = await getRecord(conn, 'products', beforeProduct.id);
    const afterReceipt = await getRecord(conn, 'production_receipts', receipt.insertId);
    const afterTx = await getRecord(conn, 'inventory_transactions', tx.insertId);
    await auditLog(conn, 'production_orders', id, 'UPDATE', beforeOrder, afterOrder, req);
    await auditLog(conn, 'products', beforeProduct.id, 'UPDATE', beforeProduct, afterProduct, req);
    await auditLog(conn, 'production_receipts', receipt.insertId, 'INSERT', null, afterReceipt, req);
    await auditLog(conn, 'inventory_transactions', tx.insertId, 'INSERT', null, afterTx, req);
    return { production_order: afterOrder, product: afterProduct, receipt: afterReceipt };
  });
  respond(res, result);
}));

api.get('/audit-logs', requirePermission('audit.read'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const params = [];
  let where = 'WHERE 1=1';
  if (clean(req.query.table_name)) {
    where += ' AND al.table_name = ?';
    params.push(clean(req.query.table_name));
  }
  if (clean(req.query.record_id)) {
    where += ' AND al.record_id = ?';
    params.push(clean(req.query.record_id));
  }
  const limitClause = limitOffsetClause(req, 100);
  const [rows] = await pool.execute(
    `SELECT al.*, u.username, u.full_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.changed_by
       ${where}
      ORDER BY al.changed_at DESC, al.id DESC
      ${limitClause}`,
    params
  );
  respond(res, rows);
}));

api.get('/users', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id, u.is_active, u.last_login_at,
            r.name AS role_name, r.label AS role_label, u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`
  );
  respond(res, rows);
}));

api.get('/roles', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const pool = await getPool();
  const [rows] = await pool.query('SELECT id, name, label, description FROM roles ORDER BY id');
  respond(res, rows);
}));

api.post('/users', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password || '');
  const fullName = clean(req.body.full_name);
  const roleId = toInt(req.body.role_id);
  if (!username || !password || !fullName || !roleId) throw badRequest('아이디, 비밀번호, 이름, 권한은 필수입니다.');
  const inserted = await withTransaction(async (conn) => {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await conn.execute(
      `INSERT INTO users(username, password_hash, full_name, email, phone, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, hash, fullName, clean(req.body.email), clean(req.body.phone), roleId, req.body.is_active === false ? 0 : 1]
    );
    const after = await getRecord(conn, 'users', result.insertId);
    const publicAfter = { ...after, password_hash: undefined };
    await auditLog(conn, 'users', result.insertId, 'INSERT', null, publicAfter, req);
    delete after.password_hash;
    return after;
  });
  respond(res, inserted, 201);
}));

api.put('/users/:id', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const updated = await withTransaction(async (conn) => {
    const before = await getRecord(conn, 'users', id);
    if (!before) throw notFound('사용자를 찾을 수 없습니다.');
    const data = {};
    for (const key of ['full_name', 'email', 'phone']) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) data[key] = clean(req.body[key]);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'role_id')) data.role_id = toInt(req.body.role_id);
    if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) data.is_active = req.body.is_active ? 1 : 0;
    if (clean(req.body.password)) data.password_hash = await bcrypt.hash(String(req.body.password), 10);
    const fields = Object.keys(data);
    if (fields.length) {
      await conn.execute(`UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, Object.values(data).concat([id]));
    }
    const after = await getRecord(conn, 'users', id);
    const beforePublic = { ...before, password_hash: before.password_hash ? '[hidden]' : undefined };
    const afterPublic = { ...after, password_hash: after.password_hash ? '[hidden]' : undefined };
    await auditLog(conn, 'users', id, 'UPDATE', beforePublic, afterPublic, req);
    delete after.password_hash;
    return after;
  });
  respond(res, updated);
}));

app.use('/api', api);

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'API 경로를 찾을 수 없습니다.' });
});

app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || '서버 오류가 발생했습니다.';
  let details = err.details || undefined;

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `엑셀 파일은 최대 ${MAX_EXCEL_FILE_MB}MB까지 업로드할 수 있습니다.`;
      details = { max_file_size_mb: MAX_EXCEL_FILE_MB };
    } else {
      message = `파일 업로드 오류: ${err.message}`;
    }
  }

  if (status >= 500) console.error(err);
  res.status(status).json({ ok: false, error: message, details });
});

module.exports = { app, initialize: initDb, apiRouter: api, hasPermission };
