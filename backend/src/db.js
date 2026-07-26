const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

let pool;
let initPromise;

const permissions = [
  ['dashboard.view', '대시보드 보기', 'dashboard'],
  ['customers.read', '거래처 조회', 'customers'],
  ['customers.write', '거래처 등록/수정', 'customers'],
  ['products.read', '제품·재고 조회', 'products'],
  ['products.write', '제품 등록/수정', 'products'],
  ['inventory.write', '재고 조정', 'inventory'],
  ['orders.read', '주문 조회', 'orders'],
  ['orders.write', '주문 등록/출고', 'orders'],
  ['payments.read', '수금 조회', 'payments'],
  ['payments.write', '수금 등록', 'payments'],
  ['production.read', '생산 조회', 'production'],
  ['production.write', '생산지시/입고', 'production'],
  ['audit.read', '수정이력 조회', 'audit'],
  ['masters.read', '기준정보 조회', 'masters'],
  ['masters.write', '기준정보 등록/수정', 'masters'],
  ['imports.manage', '엑셀자료 가져오기', 'imports'],
  ['users.manage', '사용자/권한 관리', 'users']
];

const roles = [
  ['admin', '관리자', '전체 권한'],
  ['sales', '영업', '거래처·주문·출고 중심'],
  ['accounting', '경리/수금', '거래처·수금·미수금 중심'],
  ['production', '생산/재고', '제품·재고·생산 중심'],
  ['viewer', '조회전용', '수정 없이 조회만 가능']
];

const rolePermissionMap = {
  admin: permissions.map((p) => p[0]),
  sales: ['dashboard.view', 'customers.read', 'customers.write', 'products.read', 'masters.read', 'orders.read', 'orders.write', 'payments.read'],
  accounting: ['dashboard.view', 'customers.read', 'masters.read', 'orders.read', 'payments.read', 'payments.write', 'audit.read'],
  production: ['dashboard.view', 'products.read', 'products.write', 'masters.read', 'masters.write', 'inventory.write', 'orders.read', 'production.read', 'production.write'],
  viewer: ['dashboard.view', 'customers.read', 'products.read', 'masters.read', 'orders.read', 'payments.read', 'production.read']
};

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(raw).toLowerCase());
}

function dbConfig(includeDatabase = true) {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    multipleStatements: true,
    timezone: '+09:00',
    charset: 'utf8mb4'
  };
  if (envBool('DB_SSL', false)) {
    // AWS RDS 등 외부 MySQL에서 TLS 접속이 필요할 때 사용합니다.
    // 운영에서 CA 인증서를 별도로 관리하지 않는 초보자 테스트 환경을 위해 rejectUnauthorized=false를 허용합니다.
    cfg.ssl = { rejectUnauthorized: envBool('DB_SSL_REJECT_UNAUTHORIZED', false) };
  }
  if (includeDatabase) cfg.database = process.env.DB_NAME || 'mt_optics';
  return cfg;
}

function schemaSql() {
  return fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
}

function quoteIdentifier(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `\`${name}\``;
}

async function createDatabaseIfNeeded() {
  if (!envBool('DB_AUTO_CREATE_DATABASE', true)) return;
  const database = process.env.DB_NAME || 'mt_optics';
  const conn = await mysql.createConnection(dbConfig(false));
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

async function seedRolesPermissions(targetPool) {
  for (const [name, label, description] of roles) {
    await targetPool.execute(
      'INSERT IGNORE INTO roles(name, label, description) VALUES (?, ?, ?)',
      [name, label, description]
    );
  }

  for (const [code, label, module] of permissions) {
    await targetPool.execute(
      'INSERT IGNORE INTO permissions(code, label, module) VALUES (?, ?, ?)',
      [code, label, module]
    );
  }

  const [roleRows] = await targetPool.query('SELECT id, name FROM roles');
  const [permissionRows] = await targetPool.query('SELECT id, code FROM permissions');
  const roleIdByName = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));
  const permIdByCode = Object.fromEntries(permissionRows.map((row) => [row.code, row.id]));

  for (const [roleName, permCodes] of Object.entries(rolePermissionMap)) {
    const roleId = roleIdByName[roleName];
    if (!roleId) continue;
    for (const code of permCodes) {
      const permissionId = permIdByCode[code];
      if (!permissionId) continue;
      await targetPool.execute(
        'INSERT IGNORE INTO role_permissions(role_id, permission_id) VALUES (?, ?)',
        [roleId, permissionId]
      );
    }
  }
}

async function seedAdminUser(targetPool) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin1234!';
  const fullName = process.env.ADMIN_FULL_NAME || '시스템관리자';
  const email = process.env.ADMIN_EMAIL || 'admin@mtoptics.local';
  const [rolesRows] = await targetPool.execute('SELECT id FROM roles WHERE name = ?', ['admin']);
  const roleId = rolesRows[0]?.id;
  if (!roleId) throw new Error('admin role not found');

  const [existing] = await targetPool.execute('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await targetPool.execute(
      'INSERT INTO users(username, password_hash, full_name, email, role_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [username, hash, fullName, email, roleId]
    );
  }
}

async function columnExists(targetPool, tableName, columnName) {
  const [rows] = await targetPool.execute(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureColumn(targetPool, tableName, columnName, definition) {
  if (!(await columnExists(targetPool, tableName, columnName))) {
    await targetPool.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`);
  }
}

async function ensureIndex(targetPool, tableName, indexName, ddl) {
  const [rows] = await targetPool.execute(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(rows[0]?.cnt || 0) === 0) await targetPool.query(ddl);
}

async function ensureV13Schema(targetPool) {
  const productColumns = [
    ['product_type', 'VARCHAR(80) NULL'],
    ['brand', 'VARCHAR(120) NULL'],
    ['model_no', 'VARCHAR(120) NULL'],
    ['color_code', 'VARCHAR(80) NULL'],
    ['color_name', 'VARCHAR(120) NULL'],
    ['size_eye', 'INT NULL'],
    ['bridge_size', 'INT NULL'],
    ['temple_length', 'INT NULL'],
    ['lens_width', 'DECIMAL(8,2) NULL'],
    ['frame_width', 'DECIMAL(8,2) NULL'],
    ['frame_material', 'VARCHAR(120) NULL'],
    ['lens_material', 'VARCHAR(120) NULL'],
    ['gender', 'VARCHAR(40) NULL'],
    ['origin', 'VARCHAR(80) NULL'],
    ['barcode', 'VARCHAR(120) NULL'],
    ['material_id', 'BIGINT UNSIGNED NULL']
  ];
  for (const [name, definition] of productColumns) {
    await ensureColumn(targetPool, 'products', name, definition);
  }
  await ensureIndex(targetPool, 'products', 'idx_products_category', 'CREATE INDEX idx_products_category ON products(category)');
  await ensureIndex(targetPool, 'products', 'idx_products_brand_model', 'CREATE INDEX idx_products_brand_model ON products(brand, model_no)');
  await seedDefaultCodes(targetPool);
}

async function seedDefaultCodes(targetPool) {
  const groups = [
    ['PRODUCT_CATEGORY', '제품분류', '안경테, 선글라스, 렌즈, 부속품 등'],
    ['PRODUCT_TYPE', '제품유형', '완제품/부품/자재 구분'],
    ['FRAME_MATERIAL', '프레임소재', 'TR, 티타늄, 메탈, 아세테이트 등'],
    ['DELIVERY_GROUP', '박싱구분', '영업부, 다빈치, 기타'],
    ['DELIVERY_METHOD', '배송방법', '택배, 영업방문, 직접수령'],
    ['DELIVERY_TYPE', '발송구분', '택배, 영업방문, 기타. 수금/미수금도 이 구분으로 집계합니다.'],
    ['ORDER_SOURCE', '주문접수경로', '전화, 카톡, 영업방문, 이카운트 등'],
    ['PAYMENT_METHOD', '수금방법', '카드, 송금, 현금'],
    ['POPULARITY_GRADE', '인기도', '생산단위 판단 기준']
  ];
  for (const [code, name, description] of groups) {
    await targetPool.execute(
      `INSERT INTO code_groups(group_code, group_name, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description)`,
      [code, name, description]
    );
  }
  const items = {
    PRODUCT_CATEGORY: [['FRAME','안경테'],['SUNGLASSES','선글라스'],['LENS','렌즈'],['PARTS','부속품'],['CASE','케이스'],['ETC','기타']],
    PRODUCT_TYPE: [['FINISHED','완제품'],['SEMI','반제품'],['MATERIAL','자재'],['PART','부품']],
    FRAME_MATERIAL: [['TR','TR'],['TITANIUM','티타늄'],['METAL','메탈'],['ACETATE','아세테이트'],['ULTEM','울템'],['MIX','혼합소재']],
    DELIVERY_GROUP: [['SALES','영업부'],['DAVINCI','다빈치'],['ETC','기타']],
    DELIVERY_METHOD: [['PARCEL','택배'],['VISIT','영업방문'],['PICKUP','직접수령']],
    DELIVERY_TYPE: [['PARCEL','택배'],['SALES_VISIT','영업방문'],['OTHER','기타']],
    ORDER_SOURCE: [['PHONE','전화'],['KAKAO','카톡'],['SALES_VISIT','영업방문'],['ECOUNT','이카운트'],['OTHER','기타']],
    PAYMENT_METHOD: [['CARD','카드'],['BANK','송금'],['CASH','현금']],
    POPULARITY_GRADE: [['A','A 인기/1000개'],['B','B 보통/500개'],['C','C 기본/300개']]
  };
  const [groupRows] = await targetPool.query('SELECT id, group_code FROM code_groups');
  const groupId = Object.fromEntries(groupRows.map((row) => [row.group_code, row.id]));
  for (const [groupCode, list] of Object.entries(items)) {
    const gid = groupId[groupCode];
    if (!gid) continue;
    for (let i = 0; i < list.length; i += 1) {
      const [itemCode, itemName] = list[i];
      await targetPool.execute(
        `INSERT INTO code_items(group_id, item_code, item_name, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), sort_order = VALUES(sort_order), is_active = 1`,
        [gid, itemCode, itemName, (i + 1) * 10]
      );
    }
  }
}


async function ensureV14Schema(targetPool) {
  // v1.4: 같은 거래처의 지역/지점/납품처와 발송구분별 수금·미수금 관리를 위한 확장
  await targetPool.query(`CREATE TABLE IF NOT EXISTS customer_sites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    site_code VARCHAR(80) NULL UNIQUE,
    site_name VARCHAR(150) NOT NULL,
    original_customer_name VARCHAR(180) NULL,
    business_no VARCHAR(40) NULL,
    owner_name VARCHAR(80) NULL,
    phone VARCHAR(50) NULL,
    mobile VARCHAR(50) NULL,
    address VARCHAR(255) NULL,
    region VARCHAR(80) NULL,
    default_delivery_type VARCHAR(40) NOT NULL DEFAULT '택배',
    default_delivery_group VARCHAR(40) NOT NULL DEFAULT '기타',
    sales_rep_id BIGINT UNSIGNED NULL,
    opening_receivable DECIMAL(14,2) NOT NULL DEFAULT 0,
    credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    memo TEXT NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customer_sites_customer_region_delivery (customer_id, site_name, default_delivery_type),
    INDEX idx_customer_sites_customer (customer_id),
    INDEX idx_customer_sites_region (region),
    INDEX idx_customer_sites_delivery_type (default_delivery_type),
    INDEX idx_customer_sites_status (status),
    CONSTRAINT fk_customer_sites_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_sites_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_sites_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_customer_sites_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await ensureColumn(targetPool, 'sales_orders', 'customer_site_id', 'BIGINT UNSIGNED NULL');
  await ensureColumn(targetPool, 'sales_orders', 'delivery_type', "VARCHAR(40) NOT NULL DEFAULT '택배'");
  await ensureColumn(targetPool, 'shipments', 'customer_site_id', 'BIGINT UNSIGNED NULL');
  await ensureColumn(targetPool, 'shipments', 'delivery_type', "VARCHAR(40) NOT NULL DEFAULT '택배'");
  await ensureColumn(targetPool, 'payments', 'customer_site_id', 'BIGINT UNSIGNED NULL');
  await ensureColumn(targetPool, 'payments', 'delivery_type', "VARCHAR(40) NOT NULL DEFAULT '택배'");
  await ensureColumn(targetPool, 'receivable_transactions', 'customer_site_id', 'BIGINT UNSIGNED NULL');
  await ensureColumn(targetPool, 'receivable_transactions', 'delivery_type', "VARCHAR(40) NOT NULL DEFAULT '택배'");

  await ensureIndex(targetPool, 'customer_sites', 'idx_customer_sites_customer', 'CREATE INDEX idx_customer_sites_customer ON customer_sites(customer_id)');
  await ensureIndex(targetPool, 'customer_sites', 'idx_customer_sites_delivery_type', 'CREATE INDEX idx_customer_sites_delivery_type ON customer_sites(default_delivery_type)');
  await ensureIndex(targetPool, 'sales_orders', 'idx_sales_orders_site', 'CREATE INDEX idx_sales_orders_site ON sales_orders(customer_site_id)');
  await ensureIndex(targetPool, 'sales_orders', 'idx_sales_orders_delivery_type', 'CREATE INDEX idx_sales_orders_delivery_type ON sales_orders(delivery_type)');
  await ensureIndex(targetPool, 'payments', 'idx_payments_site', 'CREATE INDEX idx_payments_site ON payments(customer_site_id)');
  await ensureIndex(targetPool, 'payments', 'idx_payments_delivery_type', 'CREATE INDEX idx_payments_delivery_type ON payments(delivery_type)');
  await ensureIndex(targetPool, 'receivable_transactions', 'idx_receivable_site_date', 'CREATE INDEX idx_receivable_site_date ON receivable_transactions(customer_site_id, txn_date)');
  await ensureIndex(targetPool, 'receivable_transactions', 'idx_receivable_delivery_type', 'CREATE INDEX idx_receivable_delivery_type ON receivable_transactions(delivery_type)');
  await ensureIndex(targetPool, 'customers', 'idx_customers_name_status', 'CREATE INDEX idx_customers_name_status ON customers(name, status)');
  await ensureIndex(targetPool, 'customers', 'idx_customers_code_status', 'CREATE INDEX idx_customers_code_status ON customers(code, status)');
  await ensureIndex(targetPool, 'customers', 'idx_customers_phone', 'CREATE INDEX idx_customers_phone ON customers(phone)');
  await ensureIndex(targetPool, 'customers', 'idx_customers_business_no', 'CREATE INDEX idx_customers_business_no ON customers(business_no)');
  await ensureIndex(targetPool, 'customer_sites', 'idx_customer_sites_site_name', 'CREATE INDEX idx_customer_sites_site_name ON customer_sites(site_name)');
  await ensureIndex(targetPool, 'customer_sites', 'idx_customer_sites_original_name', 'CREATE INDEX idx_customer_sites_original_name ON customer_sites(original_customer_name)');

  // 기존 거래처에는 기본 납품처를 하나 만들어 과거 자료와 새 구조를 연결합니다.
  await targetPool.query(`INSERT IGNORE INTO customer_sites(customer_id, site_code, site_name, original_customer_name, phone, mobile, address, region, default_delivery_type, default_delivery_group, sales_rep_id, opening_receivable, credit_limit, status, memo, created_by, updated_by)
    SELECT c.id,
           CONCAT('CUST-', c.id, '-DEFAULT'),
           COALESCE(NULLIF(c.region, ''), '기본'),
           c.name,
           c.phone,
           c.mobile,
           c.address,
           c.region,
           '택배',
           '기타',
           c.sales_rep_id,
           0,
           c.credit_limit,
           c.status,
           'v1.4 자동 생성 기본 납품처',
           c.created_by,
           c.updated_by
      FROM customers c
     WHERE c.status <> 'deleted'
       AND NOT EXISTS (SELECT 1 FROM customer_sites cs WHERE cs.customer_id = c.id)`);

  await targetPool.query(`UPDATE sales_orders so
    LEFT JOIN customer_sites cs ON cs.customer_id = so.customer_id
    SET so.customer_site_id = COALESCE(so.customer_site_id, cs.id),
        so.delivery_type = COALESCE(NULLIF(so.delivery_type, ''), CASE WHEN so.delivery_method LIKE '%방문%' THEN '영업방문' WHEN so.delivery_method LIKE '%기타%' THEN '기타' ELSE '택배' END)
    WHERE so.customer_site_id IS NULL OR so.delivery_type IS NULL OR so.delivery_type = ''`);
  await targetPool.query(`UPDATE payments p
    LEFT JOIN sales_orders so ON so.id = p.order_id
    LEFT JOIN customer_sites cs ON cs.customer_id = p.customer_id
    SET p.customer_site_id = COALESCE(p.customer_site_id, so.customer_site_id, cs.id),
        p.delivery_type = COALESCE(NULLIF(p.delivery_type, ''), so.delivery_type, '택배')
    WHERE p.customer_site_id IS NULL OR p.delivery_type IS NULL OR p.delivery_type = ''`);
  await targetPool.query(`UPDATE receivable_transactions rt
    LEFT JOIN sales_orders so ON so.id = rt.order_id
    LEFT JOIN payments p ON p.id = rt.payment_id
    LEFT JOIN customer_sites cs ON cs.customer_id = rt.customer_id
    SET rt.customer_site_id = COALESCE(rt.customer_site_id, so.customer_site_id, p.customer_site_id, cs.id),
        rt.delivery_type = COALESCE(NULLIF(rt.delivery_type, ''), so.delivery_type, p.delivery_type, '택배')
    WHERE rt.customer_site_id IS NULL OR rt.delivery_type IS NULL OR rt.delivery_type = ''`);

  await targetPool.query(`CREATE OR REPLACE VIEW v_customer_receivable_by_delivery_type AS
    SELECT
      c.id AS customer_id,
      c.code,
      c.name AS customer_name,
      cs.id AS customer_site_id,
      COALESCE(cs.site_name, '기본') AS site_name,
      COALESCE(rt.delivery_type, '택배') AS delivery_type,
      COALESCE(SUM(CASE WHEN rt.amount > 0 THEN rt.amount ELSE 0 END), 0) AS sales_amount,
      COALESCE(SUM(CASE WHEN rt.amount < 0 THEN -rt.amount ELSE 0 END), 0) AS payment_amount,
      COALESCE(SUM(rt.amount), 0) AS receivable_balance
    FROM customers c
    LEFT JOIN receivable_transactions rt ON rt.customer_id = c.id
    LEFT JOIN customer_sites cs ON cs.id = rt.customer_site_id
    GROUP BY c.id, c.code, c.name, cs.id, cs.site_name, COALESCE(rt.delivery_type, '택배')`);

  await targetPool.query(`CREATE OR REPLACE VIEW v_customer_site_receivable_balance AS
    SELECT
      c.id AS customer_id,
      c.code,
      c.name AS customer_name,
      cs.id AS customer_site_id,
      cs.site_name,
      cs.region,
      cs.default_delivery_type,
      cs.opening_receivable + COALESCE(SUM(rt.amount), 0) AS receivable_balance
    FROM customer_sites cs
    JOIN customers c ON c.id = cs.customer_id
    LEFT JOIN receivable_transactions rt ON rt.customer_site_id = cs.id
    GROUP BY c.id, c.code, c.name, cs.id, cs.site_name, cs.region, cs.default_delivery_type, cs.opening_receivable`);

  await targetPool.execute('INSERT IGNORE INTO schema_migrations(version) VALUES (?)', ['2026-07-22-v1.4-aws-delivery-type-sites']);
}


async function ensureV15Schema(targetPool) {
  // v1.5: 주소검색 상세필드, 주문/수금 논리삭제, 감사 사유 저장
  const addressColumns = [
    ['postal_code', 'VARCHAR(20) NULL'],
    ['road_address', 'VARCHAR(255) NULL'],
    ['jibun_address', 'VARCHAR(255) NULL'],
    ['detail_address', 'VARCHAR(255) NULL'],
    ['address_type', 'VARCHAR(20) NULL']
  ];
  for (const tableName of ['customers', 'customer_sites']) {
    for (const [name, definition] of addressColumns) {
      await ensureColumn(targetPool, tableName, name, definition);
    }
  }

  const orderColumns = [
    ['deleted_at', 'DATETIME NULL'],
    ['deleted_by', 'BIGINT UNSIGNED NULL'],
    ['delete_reason', 'VARCHAR(500) NULL']
  ];
  for (const [name, definition] of orderColumns) {
    await ensureColumn(targetPool, 'sales_orders', name, definition);
  }

  const paymentColumns = [
    ['updated_by', 'BIGINT UNSIGNED NULL'],
    ['status', "VARCHAR(30) NOT NULL DEFAULT 'active'"],
    ['deleted_at', 'DATETIME NULL'],
    ['deleted_by', 'BIGINT UNSIGNED NULL'],
    ['delete_reason', 'VARCHAR(500) NULL']
  ];
  for (const [name, definition] of paymentColumns) {
    await ensureColumn(targetPool, 'payments', name, definition);
  }

  await ensureColumn(targetPool, 'audit_logs', 'change_reason', 'VARCHAR(500) NULL');
  await ensureIndex(targetPool, 'sales_orders', 'idx_sales_orders_deleted_at', 'CREATE INDEX idx_sales_orders_deleted_at ON sales_orders(deleted_at)');
  await ensureIndex(targetPool, 'payments', 'idx_payments_deleted_at', 'CREATE INDEX idx_payments_deleted_at ON payments(deleted_at)');
  await ensureIndex(targetPool, 'payments', 'idx_payments_status', 'CREATE INDEX idx_payments_status ON payments(status)');

  await targetPool.execute('INSERT IGNORE INTO schema_migrations(version) VALUES (?)', ['2026-07-24-v1.5-security-mobile-address-audit']);
}

async function initDb() {
  if (pool) return pool;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await createDatabaseIfNeeded();
    pool = mysql.createPool(dbConfig(true));
    if (envBool('AUTO_MIGRATE', true)) {
      await pool.query(schemaSql());
      await seedRolesPermissions(pool);
      await seedAdminUser(pool);
      await ensureV13Schema(pool);
      await ensureV14Schema(pool);
      await ensureV15Schema(pool);
    }
    return pool;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    pool = null;
    throw err;
  }
}

async function getPool() {
  return initDb();
}


async function closeDb() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  initPromise = null;
  await activePool.end();
}

async function withTransaction(callback) {
  const activePool = await getPool();
  const conn = await activePool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  initDb,
  closeDb,
  getPool,
  withTransaction,
  permissions,
  roles,
  rolePermissionMap,
  envBool
};
