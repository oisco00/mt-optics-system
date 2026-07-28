const express = require('express');
const { getPool, withTransaction } = require('./db');
const {
  repairMojibake,
  normalizeUploadedFileName,
  normalizeImportedPaymentMemo,
  paymentDisplayNote
} = require('./textEncoding');

function createFinalEnhancementsRouter() {
  const router = express.Router();

  function clean(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
  }

  function toInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function todayKst() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  function oneMonthAgoKst() {
    const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 10);
  }

  function generateNo(prefix) {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${stamp}-${random}`;
  }

  function normalizeDeliveryType(value, fallback = '택배') {
    const raw = clean(value);
    if (!raw) return fallback;
    const upper = raw.toUpperCase();
    if (raw.includes('택배') || ['PARCEL', '택배', '화물'].includes(upper)) return '택배';
    if (raw.includes('방문') || raw.includes('영업') || ['VISIT', 'SALES_VISIT'].includes(upper)) return '영업방문';
    if (raw.includes('기타') || upper === 'OTHER') return '기타';
    return raw;
  }


  function normalizePhoneValue(value) {
    const raw = clean(value);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    return digits || raw;
  }

  function formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return digits;
  }

  function badName(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    if (/[가-힣a-zA-Z]/.test(text)) return false;
    return /^[0-9\-\s().·]+$/.test(text);
  }

  function displayName(row = {}) {
    const candidates = [
      row.display_name, row.customer_display_name, row.name, row.customer_name,
      row.original_customer_name, row.site_original_customer_name,
      row.site_name, row.region
    ];
    for (const candidate of candidates) {
      const text = clean(candidate);
      if (text && !badName(text)) return text;
    }
    return clean(candidates.find(Boolean)) || '거래처명 미등록';
  }

  function isClosedBusinessName(row = {}) {
    return /폐업\s*$/.test(displayName(row));
  }

  function decorateCustomer(row = {}) {
    const name = displayName(row);
    return {
      ...row,
      display_name: name,
      customer_display_name: name,
      phone_display: formatPhone(row.phone || row.customer_phone),
      mobile_display: formatPhone(row.mobile),
      customer_phone_display: formatPhone(row.customer_phone || row.phone)
    };
  }


  let finalIndexPromise = null;
  async function ensureCustomerSearchIndexes(pool) {
    if (finalIndexPromise) return finalIndexPromise;
    finalIndexPromise = (async () => {
      async function ensureIndex(tableName, indexName, columnSql) {
        const [rows] = await pool.execute(
          `SELECT 1
             FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = ?
              AND index_name = ?
            LIMIT 1`,
          [tableName, indexName]
        );
        if (rows.length) return;
        try {
          await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${columnSql}`);
        } catch (error) {
          // Duplicate index or old MySQL metadata races should not block work.
          if (!/Duplicate|already exists|ER_DUP_KEYNAME/i.test(String(error.message || ''))) {
            console.warn(`index create skipped: ${tableName}.${indexName}`, error.message);
          }
        }
      }
      await ensureIndex('customers', 'idx_customers_v303_name_code', '(name, code)');
      await ensureIndex('customers', 'idx_customers_v303_phone', '(phone)');
      await ensureIndex('customers', 'idx_customers_v303_business', '(business_no)');
      await ensureIndex('customer_sites', 'idx_sites_v303_customer_name', '(customer_id, site_name)');
      await ensureIndex('customer_sites', 'idx_sites_v303_original', '(original_customer_name)');
    })();
    return finalIndexPromise;
  }

  function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function customerSearchScore(row, keyword) {
    const kw = String(keyword || '').trim().toLocaleLowerCase('ko-KR');
    const digits = phoneDigits(keyword);
    if (!kw) return 100 + String(row.display_name || row.name || '').length;
    const name = String(row.display_name || row.name || '').trim().toLocaleLowerCase('ko-KR');
    const original = String(row.original_customer_name || row.site_search_text || '').trim().toLocaleLowerCase('ko-KR');
    const code = String(row.code || '').trim().toLocaleLowerCase('ko-KR');
    const region = String(row.region || '').trim().toLocaleLowerCase('ko-KR');
    if (name === kw) return 0;
    if (name.startsWith(kw)) return 10 + name.length;
    if (name.includes(kw)) return 20 + name.indexOf(kw);
    if (original && original.startsWith(kw)) return 30 + original.length;
    if (original && original.includes(kw)) return 40 + original.indexOf(kw);
    if (code && code.startsWith(kw)) return 50 + code.length;
    if (code && code.includes(kw)) return 60 + code.indexOf(kw);
    if (region && region.includes(kw)) return 70 + region.indexOf(kw);
    if (digits.length >= 6) {
      const contacts = [row.phone, row.mobile, row.business_no, row.site_phone, row.site_business_no]
        .map(phoneDigits)
        .join(' ');
      if (contacts.includes(digits)) return 200;
    }
    return 9999;
  }

  function hasPermission(user, code) {
    if (!user) return false;
    if (user.role_name === 'admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(code);
  }

  function requirePermission(code) {
    return (req, res, next) => {
      if (!hasPermission(req.user, code)) {
        return res.status(403).json({ ok: false, error: '권한이 없습니다.' });
      }
      return next();
    };
  }

  function asyncRoute(handler) {
    return (req, res, next) =>
      Promise.resolve(handler(req, res, next)).catch(next);
  }

  function send(res, data, status = 200) {
    return res.status(status).json({ ok: true, data });
  }


  function httpError(status, message, details) {
    const error = new Error(message);
    error.status = status;
    if (details) error.details = details;
    return error;
  }

  async function getRecord(conn, tableName, id) {
    const [rows] = await conn.execute(
      `SELECT * FROM ${tableName} WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async function auditLog(
    conn,
    tableName,
    recordId,
    action,
    beforeData,
    afterData,
    req,
    reason = null
  ) {
    await conn.execute(
      `INSERT INTO audit_logs(
        table_name, record_id, action, before_data, after_data,
        changed_by, ip_address, user_agent, change_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tableName,
        String(recordId),
        action,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        req.user?.id || null,
        req.ip || null,
        String(req.get('user-agent') || '').slice(0, 255),
        clean(reason)
      ]
    );
  }

  async function receivableBalance(conn, customerId) {
    const [rows] = await conn.execute(
      `SELECT c.opening_receivable + COALESCE(SUM(rt.amount), 0) AS balance
         FROM customers c
         LEFT JOIN receivable_transactions rt
           ON rt.customer_id = c.id
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
      `INSERT INTO receivable_transactions(
        customer_id, customer_site_id, delivery_type, txn_date,
        txn_type, order_id, payment_id, amount, balance_after,
        memo, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.customer_id,
        payload.customer_site_id || null,
        normalizeDeliveryType(payload.delivery_type),
        payload.txn_date || todayKst(),
        payload.txn_type,
        payload.order_id || null,
        payload.payment_id || null,
        Number(payload.amount || 0),
        afterBalance,
        clean(payload.memo),
        req.user?.id || null
      ]
    );

    return {
      id: result.insertId,
      balance_after: afterBalance
    };
  }


  router.get(
    '/date-range',
    requirePermission('dashboard.view'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const [[orderRange]] = await pool.query(
        `SELECT MIN(order_date) AS min_order_date, MAX(order_date) AS max_order_date
           FROM sales_orders
          WHERE deleted_at IS NULL`
      );
      const [[paymentRange]] = await pool.query(
        `SELECT MIN(payment_date) AS min_payment_date, MAX(payment_date) AS max_payment_date
           FROM payments
          WHERE deleted_at IS NULL`
      );
      send(res, {
        min_order_date: orderRange?.min_order_date ? String(orderRange.min_order_date).slice(0, 10) : '',
        max_order_date: orderRange?.max_order_date ? String(orderRange.max_order_date).slice(0, 10) : todayKst(),
        min_payment_date: paymentRange?.min_payment_date ? String(paymentRange.min_payment_date).slice(0, 10) : '',
        max_payment_date: paymentRange?.max_payment_date ? String(paymentRange.max_payment_date).slice(0, 10) : todayKst(),
        today: todayKst()
      });
    })
  );


  async function ensureCarrierGroup(conn) {
    await conn.execute(
      `INSERT INTO code_groups(group_code, group_name, description, sort_order, is_active)
       VALUES ('carrier', '택배사', '출고 처리 시 선택하는 택배사 목록', 90, 1)
       ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), is_active = 1`
    );
    const [[group]] = await conn.execute("SELECT id FROM code_groups WHERE group_code = 'carrier' LIMIT 1");
    const defaults = ['우체국', '한진택배', '기타'];
    for (let i = 0; i < defaults.length; i += 1) {
      const name = defaults[i];
      await conn.execute(
        `INSERT INTO code_items(group_id, item_code, item_name, item_value, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), item_value = VALUES(item_value), is_active = 1`,
        [group.id, name, name, name, (i + 1) * 10]
      );
    }
    return group.id;
  }

  router.get(
    '/carriers',
    requirePermission('orders.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        const groupId = await ensureCarrierGroup(conn);
        const [rows] = await conn.execute(
          `SELECT ci.id, ci.item_code, ci.item_name, ci.item_value, ci.sort_order, ci.is_active
             FROM code_items ci
            WHERE ci.group_id = ?
              AND ci.is_active = 1
            ORDER BY ci.sort_order, ci.item_name`,
          [groupId]
        );
        send(res, rows);
      } finally {
        conn.release();
      }
    })
  );

  router.post(
    '/carriers',
    requirePermission('masters.write'),
    asyncRoute(async (req, res) => {
      const name = clean(req.body?.name || req.body?.item_name || req.body?.item_value);
      if (!name) throw httpError(400, '택배사명을 입력하세요.');
      const result = await withTransaction(async (conn) => {
        const groupId = await ensureCarrierGroup(conn);
        const [[maxRow]] = await conn.execute('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM code_items WHERE group_id = ?', [groupId]);
        await conn.execute(
          `INSERT INTO code_items(group_id, item_code, item_name, item_value, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), item_value = VALUES(item_value), is_active = 1`,
          [groupId, name, name, name, Number(maxRow.max_order || 0) + 10]
        );
        const [[row]] = await conn.execute(
          `SELECT ci.id, ci.item_code, ci.item_name, ci.item_value, ci.sort_order, ci.is_active
             FROM code_items ci
            WHERE ci.group_id = ? AND ci.item_code = ?
            LIMIT 1`,
          [groupId, name]
        );
        return row;
      });
      send(res, result, 201);
    })
  );


  router.get(
    '/customer-branches',
    requirePermission('customers.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      await ensureCustomerSearchIndexes(pool);

      const q = clean(req.query.q) || '';
      const limit = Math.min(Math.max(toInt(req.query.limit, 20), 10), 100);
      const offset = Math.max(toInt(req.query.offset, 0), 0);
      const like = `%${q}%`;

      // Business rule: one delivery place can be an independent business even
      // when it was imported under the same customer name. Therefore this query
      // lists customer_sites as the primary customer rows. Customers without
      // any site remain visible as one basic row.
      const branchSql = `
        SELECT
          CONCAT('S-', cs.id) AS branch_key,
          'site' AS record_type,
          c.id AS id,
          c.id AS customer_id,
          cs.id AS customer_site_id,
          COALESCE(NULLIF(cs.original_customer_name, ''), NULLIF(cs.site_name, ''), c.name) AS name,
          COALESCE(NULLIF(cs.original_customer_name, ''), NULLIF(cs.site_name, ''), c.name) AS display_name,
          c.name AS parent_customer_name,
          c.code AS code,
          cs.site_code AS site_code,
          COALESCE(NULLIF(cs.business_no, ''), c.business_no) AS business_no,
          COALESCE(NULLIF(cs.owner_name, ''), c.owner_name) AS owner_name,
          COALESCE(NULLIF(cs.phone, ''), NULLIF(c.phone, ''), c.mobile) AS phone,
          COALESCE(NULLIF(cs.mobile, ''), c.mobile) AS mobile,
          COALESCE(NULLIF(cs.region, ''), c.region) AS region,
          cs.site_name AS site_name,
          cs.original_customer_name AS original_customer_name,
          cs.default_delivery_type AS default_delivery_type,
          cs.default_delivery_group AS default_delivery_group,
          COALESCE(NULLIF(cs.address, ''), NULLIF(cs.road_address, ''), NULLIF(cs.jibun_address, ''), NULLIF(c.address, ''), NULLIF(c.road_address, ''), NULLIF(c.jibun_address, '')) AS address,
          COALESCE(NULLIF(cs.road_address, ''), NULLIF(c.road_address, '')) AS road_address,
          COALESCE(NULLIF(cs.jibun_address, ''), NULLIF(c.jibun_address, '')) AS jibun_address,
          COALESCE(NULLIF(cs.detail_address, ''), NULLIF(c.detail_address, '')) AS detail_address,
          COALESCE(NULLIF(cs.postal_code, ''), NULLIF(c.postal_code, '')) AS postal_code,
          COALESCE(NULLIF(cs.address_type, ''), NULLIF(c.address_type, '')) AS address_type,
          COALESCE(vs.receivable_balance, cs.opening_receivable, 0) AS receivable_balance,
          cs.opening_receivable AS opening_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_site_id = cs.id AND vb.delivery_type = '택배'), 0) AS parcel_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_site_id = cs.id AND vb.delivery_type = '영업방문'), 0) AS visit_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_site_id = cs.id AND vb.delivery_type = '기타'), 0) AS other_receivable,
          1 AS site_count,
          cs.status AS status,
          cs.memo AS memo,
          cs.updated_at AS updated_at
        FROM customer_sites cs
        JOIN customers c ON c.id = cs.customer_id
        LEFT JOIN v_customer_site_receivable_balance vs ON vs.customer_site_id = cs.id
        WHERE cs.status <> 'deleted' AND c.status <> 'deleted'

        UNION ALL

        SELECT
          CONCAT('C-', c.id) AS branch_key,
          'customer' AS record_type,
          c.id AS id,
          c.id AS customer_id,
          NULL AS customer_site_id,
          c.name AS name,
          c.name AS display_name,
          NULL AS parent_customer_name,
          c.code AS code,
          NULL AS site_code,
          c.business_no AS business_no,
          c.owner_name AS owner_name,
          COALESCE(NULLIF(c.phone, ''), c.mobile) AS phone,
          c.mobile AS mobile,
          c.region AS region,
          '본점/기본' AS site_name,
          NULL AS original_customer_name,
          '택배' AS default_delivery_type,
          '기타' AS default_delivery_group,
          COALESCE(NULLIF(c.address, ''), NULLIF(c.road_address, ''), NULLIF(c.jibun_address, '')) AS address,
          c.road_address AS road_address,
          c.jibun_address AS jibun_address,
          c.detail_address AS detail_address,
          c.postal_code AS postal_code,
          c.address_type AS address_type,
          COALESCE(vc.receivable_balance, c.opening_receivable, 0) AS receivable_balance,
          c.opening_receivable AS opening_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.customer_site_id IS NULL AND vb.delivery_type = '택배'), 0) AS parcel_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.customer_site_id IS NULL AND vb.delivery_type = '영업방문'), 0) AS visit_receivable,
          COALESCE((SELECT SUM(vb.receivable_balance) FROM v_customer_receivable_by_delivery_type vb WHERE vb.customer_id = c.id AND vb.customer_site_id IS NULL AND vb.delivery_type = '기타'), 0) AS other_receivable,
          0 AS site_count,
          c.status AS status,
          c.memo AS memo,
          c.updated_at AS updated_at
        FROM customers c
        LEFT JOIN v_customer_receivable_balance vc ON vc.customer_id = c.id
        WHERE c.status <> 'deleted'
          AND NOT EXISTS (
            SELECT 1
              FROM customer_sites csx
             WHERE csx.customer_id = c.id
               AND csx.status <> 'deleted'
          )
      `;

      const whereParts = ['1 = 1'];
      const params = [];
      if (q) {
        whereParts.push(`(
          b.display_name LIKE ? OR b.parent_customer_name LIKE ? OR b.code LIKE ? OR b.site_code LIKE ?
          OR b.region LIKE ? OR b.phone LIKE ? OR b.mobile LIKE ? OR b.business_no LIKE ?
          OR b.address LIKE ? OR b.road_address LIKE ? OR b.jibun_address LIKE ?
        )`);
        for (let i = 0; i < 11; i += 1) params.push(like);
      }
      const where = whereParts.join(' AND ');
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM (${branchSql}) b WHERE ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);
      const [rows] = await pool.execute(
        `SELECT *
           FROM (${branchSql}) b
          WHERE ${where}
          ORDER BY b.display_name ASC, b.site_name ASC, b.branch_key ASC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      send(res, {
        rows: rows.map(decorateCustomer),
        total,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        page_count: Math.max(Math.ceil(total / limit), 1)
      });
    })
  );

  router.get(
    '/customers/search',
    requirePermission('customers.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      await ensureCustomerSearchIndexes(pool);
      const q = clean(req.query.q) || '';
      const limit = Math.min(Math.max(toInt(req.query.limit, 40), 1), 80);
      const digits = phoneDigits(q);
      const includeContact = digits.length >= 6;
      const params = [];
      const conditions = ["c.status <> 'deleted'"];

      if (q) {
        const like = `%${q}%`;
        const contactSql = includeContact
          ? ` OR REPLACE(REPLACE(REPLACE(COALESCE(c.phone,''),'-',''),' ',''),'.','') LIKE ?
              OR REPLACE(REPLACE(REPLACE(COALESCE(c.mobile,''),'-',''),' ',''),'.','') LIKE ?
              OR REPLACE(REPLACE(REPLACE(COALESCE(c.business_no,''),'-',''),' ',''),'.','') LIKE ?`
          : '';
        conditions.push(`(
          c.name LIKE ? OR c.code LIKE ? OR c.region LIKE ?
          OR EXISTS (
              SELECT 1 FROM customer_sites csx
               WHERE csx.customer_id = c.id
                 AND csx.status <> 'deleted'
                 AND (csx.site_name LIKE ? OR csx.original_customer_name LIKE ? OR csx.region LIKE ?)
          )
          ${contactSql}
        )`);
        params.push(like, like, like, like, like, like);
        if (includeContact) params.push(`%${digits}%`, `%${digits}%`, `%${digits}%`);
      }

      const [rows] = await pool.execute(
        `SELECT
            c.*,
            (
              SELECT NULLIF(cs0.original_customer_name, '')
                FROM customer_sites cs0
               WHERE cs0.customer_id = c.id
                 AND cs0.status <> 'deleted'
                 AND cs0.original_customer_name IS NOT NULL
               ORDER BY cs0.id ASC
               LIMIT 1
            ) AS original_customer_name,
            (
              SELECT GROUP_CONCAT(CONCAT_WS(' ', cs1.site_name, cs1.original_customer_name, cs1.region) SEPARATOR ' ')
                FROM customer_sites cs1
               WHERE cs1.customer_id = c.id
                 AND cs1.status <> 'deleted'
            ) AS site_search_text,
            (
              SELECT cs2.phone
                FROM customer_sites cs2
               WHERE cs2.customer_id = c.id
                 AND cs2.status <> 'deleted'
                 AND cs2.phone IS NOT NULL
               ORDER BY cs2.id ASC
               LIMIT 1
            ) AS site_phone,
            (
              SELECT cs3.business_no
                FROM customer_sites cs3
               WHERE cs3.customer_id = c.id
                 AND cs3.status <> 'deleted'
                 AND cs3.business_no IS NOT NULL
               ORDER BY cs3.id ASC
               LIMIT 1
            ) AS site_business_no,
            COALESCE(v.receivable_balance, c.opening_receivable) AS receivable_balance
         FROM customers c
         LEFT JOIN v_customer_receivable_balance v ON v.customer_id = c.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.name ASC, c.id ASC
        LIMIT 240`,
        params
      );

      const sorted = rows
        .map(decorateCustomer)
        .map((row) => ({ row, score: customerSearchScore(row, q) }))
        .filter((item) => !q || item.score < 9999)
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          return displayName(a.row).localeCompare(displayName(b.row), 'ko');
        })
        .slice(0, limit)
        .map((item) => item.row);

      send(res, sorted);
    })
  );

  router.get(
    '/customers',
    requirePermission('customers.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ["c.status <> 'deleted'"];
      const q = clean(req.query.q);

      if (q) {
        const like = `%${q}%`;
        conditions.push(`(
          c.name LIKE ? OR c.code LIKE ? OR c.business_no LIKE ?
          OR c.phone LIKE ? OR c.mobile LIKE ? OR c.region LIKE ?
          OR c.address LIKE ?
        )`);
        params.push(like, like, like, like, like, like, like);
      }

      const limit = Math.min(
        Math.max(toInt(req.query.limit, q ? 1000 : 10000), 1),
        10000
      );

      const [rows] = await pool.execute(
        `SELECT
            c.*,
            u.full_name AS sales_rep_name,
            (
              SELECT NULLIF(cs0.original_customer_name, '')
                FROM customer_sites cs0
               WHERE cs0.customer_id = c.id
                 AND cs0.status <> 'deleted'
                 AND cs0.original_customer_name IS NOT NULL
               ORDER BY cs0.id ASC
               LIMIT 1
            ) AS original_customer_name,
            COALESCE(v.receivable_balance, c.opening_receivable) AS receivable_balance,
            (
              SELECT COUNT(*)
                FROM customer_sites cs
               WHERE cs.customer_id = c.id
                 AND cs.status <> 'deleted'
            ) AS site_count,
            (
              SELECT COALESCE(SUM(vb.receivable_balance), 0)
                FROM v_customer_receivable_by_delivery_type vb
               WHERE vb.customer_id = c.id
                 AND vb.delivery_type = '택배'
            ) AS parcel_receivable,
            (
              SELECT COALESCE(SUM(vb.receivable_balance), 0)
                FROM v_customer_receivable_by_delivery_type vb
               WHERE vb.customer_id = c.id
                 AND vb.delivery_type = '영업방문'
            ) AS visit_receivable,
            (
              SELECT COALESCE(SUM(vb.receivable_balance), 0)
                FROM v_customer_receivable_by_delivery_type vb
               WHERE vb.customer_id = c.id
                 AND vb.delivery_type = '기타'
            ) AS other_receivable
         FROM customers c
         LEFT JOIN users u ON u.id = c.sales_rep_id
         LEFT JOIN v_customer_receivable_balance v ON v.customer_id = c.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.name ASC, c.id ASC
        LIMIT ${limit}`,
        params
      );

      send(res, rows.map(decorateCustomer));
    })
  );

  router.get(
    '/sites',
    requirePermission('customers.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ["cs.status <> 'deleted'"];
      const customerId = toInt(req.query.customer_id, 0);
      const q = clean(req.query.q);

      if (customerId) {
        conditions.push('cs.customer_id = ?');
        params.push(customerId);
      }

      if (q) {
        const like = `%${q}%`;
        conditions.push(`(
          c.name LIKE ? OR cs.site_name LIKE ? OR cs.region LIKE ?
          OR cs.address LIKE ? OR cs.phone LIKE ?
        )`);
        params.push(like, like, like, like, like);
      }

      const [rows] = await pool.execute(
        `SELECT
            cs.*,
            c.name AS customer_name,
            c.code AS customer_code,
            COALESCE(v.receivable_balance, cs.opening_receivable) AS receivable_balance
         FROM customer_sites cs
         JOIN customers c ON c.id = cs.customer_id
         LEFT JOIN v_customer_site_receivable_balance v
           ON v.customer_site_id = cs.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.name ASC, cs.site_name ASC, cs.id ASC
        LIMIT 10000`,
        params
      );

      send(res, rows.map((row) => decorateCustomer({
        ...row,
        name: row.customer_name,
        customer_phone: row.phone
      })));
    })
  );

  router.get(
    '/products',
    requirePermission('products.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const q = clean(req.query.q);
      const params = [];
      let where = "WHERE status <> 'deleted'";

      if (q) {
        const like = `%${q}%`;
        where += ` AND (
          sku LIKE ? OR name LIKE ? OR spec LIKE ?
          OR brand LIKE ? OR model_no LIKE ?
        )`;
        params.push(like, like, like, like, like);
      }

      const [rows] = await pool.execute(
        `SELECT *
           FROM products
           ${where}
          ORDER BY name ASC, sku ASC
          LIMIT 5000`,
        params
      );

      send(res, rows);
    })
  );

  router.get(
    '/orders',
    requirePermission('orders.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ['so.deleted_at IS NULL'];

      const q = clean(req.query.q);
      const customerQ = clean(req.query.customer_q);
      const customerId = toInt(req.query.customer_id, 0);
      const dateFrom = clean(req.query.date_from);
      const dateTo = clean(req.query.date_to);
      const deliveryType = clean(req.query.delivery_type);
      const status = clean(req.query.status);

      if (q) {
        const like = `%${q}%`;
        conditions.push(`(
          so.order_no LIKE ? OR c.name LIKE ? OR cs.site_name LIKE ?
          OR so.delivery_group LIKE ? OR so.memo LIKE ?
        )`);
        params.push(like, like, like, like, like);
      }

      if (customerId) {
        conditions.push('so.customer_id = ?');
        params.push(customerId);
      } else if (customerQ) {
        conditions.push('c.name LIKE ?');
        params.push(`%${customerQ}%`);
      }

      if (dateFrom) {
        conditions.push('so.order_date >= ?');
        params.push(dateFrom);
      }

      if (dateTo) {
        conditions.push('so.order_date <= ?');
        params.push(dateTo);
      }

      if (deliveryType) {
        conditions.push('so.delivery_type = ?');
        params.push(normalizeDeliveryType(deliveryType));
      }

      if (status) {
        conditions.push('so.status = ?');
        params.push(status);
      }

      const [rows] = await pool.execute(
        `SELECT
            so.*,
            c.name AS customer_name,
            c.code AS customer_code,
            c.phone AS customer_phone,
            c.business_no AS customer_business_no,
            cs.site_name,
            cs.original_customer_name AS site_original_customer_name,
            cs.phone AS site_phone,
            cs.region,
            u.full_name AS created_by_name,
            COUNT(oi.id) AS item_count,
            COALESCE(
              SUM(GREATEST(oi.quantity - COALESCE(oi.shipped_qty, 0), 0)),
              0
            ) AS remaining_qty
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
         LEFT JOIN users u ON u.id = so.created_by
         LEFT JOIN order_items oi ON oi.order_id = so.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY so.id
        ORDER BY so.order_date DESC, so.id DESC
        LIMIT 3000`,
        params
      );

      send(res, rows.map((row) => decorateCustomer({
        ...row,
        name: row.customer_name,
        original_customer_name: row.site_original_customer_name,
        phone: row.customer_phone
      })));
    })
  );

  router.get(
    '/receivables',
    requirePermission('payments.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ['1 = 1'];

      const customerQ = clean(req.query.customer_q);
      const customerId = toInt(req.query.customer_id, 0);
      const siteId = toInt(req.query.site_id, 0);
      const deliveryType = clean(req.query.delivery_type);
      const includeZero = String(req.query.include_zero || '') === '1';
      const requireFilter = String(req.query.require_filter || '') === '1';
      const groupMode = clean(req.query.group) || 'customer';
      const limit = Math.min(
        Math.max(toInt(req.query.limit, groupMode === 'detail' ? 2000 : 1000), 1),
        5000
      );

      // Do not load every outstanding row on initial page entry. This prevents
      // a long wait when the customer master and transaction history are large.
      if (
        requireFilter &&
        !customerId &&
        !customerQ &&
        !siteId &&
        !deliveryType
      ) {
        send(res, []);
        return;
      }

      if (customerId) {
        conditions.push('customer_id = ?');
        params.push(customerId);
      } else if (customerQ) {
        conditions.push('customer_name LIKE ?');
        params.push(`%${customerQ}%`);
      }

      if (siteId) {
        conditions.push('customer_site_id = ?');
        params.push(siteId);
      }

      if (deliveryType) {
        conditions.push('delivery_type = ?');
        params.push(normalizeDeliveryType(deliveryType));
      }

      if (!includeZero) {
        conditions.push('receivable_balance <> 0');
      }

      if (groupMode === 'detail') {
        const [rows] = await pool.execute(
          `SELECT *
             FROM v_customer_receivable_by_delivery_type
            WHERE ${conditions.join(' AND ')}
            ORDER BY customer_name ASC, site_name ASC,
                     FIELD(delivery_type, '택배', '영업방문', '기타'),
                     delivery_type ASC
            LIMIT ${limit}`,
          params
        );
        send(res, rows.map((row) => decorateCustomer({ ...row, name: row.customer_name })));
        return;
      }

      // One row per customer and dispatch type. A payment can therefore be
      // applied directly without redundant left-side checkboxes.
      const [rows] = await pool.execute(
        `SELECT
            customer_id,
            MAX(customer_name) AS customer_name,
            CASE
              WHEN COUNT(DISTINCT COALESCE(customer_site_id, 0)) = 1
              THEN MAX(customer_site_id)
              ELSE NULL
            END AS customer_site_id,
            CASE
              WHEN COUNT(DISTINCT COALESCE(customer_site_id, 0)) = 1
              THEN COALESCE(MAX(NULLIF(site_name, '')), '기본')
              ELSE CONCAT(
                COUNT(DISTINCT COALESCE(customer_site_id, 0)),
                '곳'
              )
            END AS site_name,
            COUNT(DISTINCT COALESCE(customer_site_id, 0)) AS site_count,
            delivery_type,
            COALESCE(SUM(sales_amount), 0) AS sales_amount,
            COALESCE(SUM(payment_amount), 0) AS payment_amount,
            COALESCE(SUM(receivable_balance), 0) AS receivable_balance,
            COUNT(*) AS detail_count
         FROM v_customer_receivable_by_delivery_type
        WHERE ${conditions.join(' AND ')}
        GROUP BY customer_id, delivery_type
        ORDER BY MAX(customer_name) ASC,
                 FIELD(delivery_type, '택배', '영업방문', '기타'),
                 delivery_type ASC
        LIMIT ${limit}`,
        params
      );

      send(res, rows.map((row) => decorateCustomer({ ...row, name: row.customer_name })));
    })
  );

  router.get(
    '/payments',
    requirePermission('payments.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ['p.deleted_at IS NULL'];

      const customerQ = clean(req.query.customer_q);
      const customerId = toInt(req.query.customer_id, 0);
      const siteId = toInt(req.query.site_id, 0);
      const deliveryType = clean(req.query.delivery_type);
      const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
      const dateTo = clean(req.query.date_to) || todayKst();
      const limit = Math.min(
        Math.max(toInt(req.query.limit, 500), 1),
        2000
      );

      if (customerId) {
        conditions.push('p.customer_id = ?');
        params.push(customerId);
      } else if (customerQ) {
        conditions.push('c.name LIKE ?');
        params.push(`%${customerQ}%`);
      }

      if (siteId) {
        conditions.push('p.customer_site_id = ?');
        params.push(siteId);
      }

      if (deliveryType) {
        conditions.push('p.delivery_type = ?');
        params.push(normalizeDeliveryType(deliveryType));
      }

      conditions.push('p.payment_date >= ?');
      params.push(dateFrom);
      conditions.push('p.payment_date <= ?');
      params.push(dateTo);

      const [rows] = await pool.execute(
        `SELECT
            p.*,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.business_no AS customer_business_no,
            cs.site_name,
            cs.original_customer_name AS site_original_customer_name,
            cs.phone AS site_phone,
            cs.region,
            u.full_name AS collector_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         LEFT JOIN customer_sites cs ON cs.id = p.customer_site_id
         LEFT JOIN users u ON u.id = p.collector_user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.payment_date DESC, p.id DESC
        LIMIT ${limit}`,
        params
      );

      send(
        res,
        rows.map((row) => {
          const memo = repairMojibake(row.memo);
          const approvalNo = repairMojibake(row.approval_no);
          return decorateCustomer({
            ...row,
            name: row.customer_name,
            original_customer_name: row.site_original_customer_name,
            phone: row.customer_phone,
            memo,
            approval_no: approvalNo,
            display_note: paymentDisplayNote({
              paymentNo: row.payment_no,
              approvalNo,
              memo
            })
          });
        })
      );
    })
  );

  router.get(
    '/open-order-items',
    requirePermission('orders.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = [
        'so.deleted_at IS NULL',
        "so.status NOT IN ('canceled', 'delivered')",
        'oi.quantity > COALESCE(oi.shipped_qty, 0)'
      ];

      const customerId = toInt(req.query.customer_id, 0);
      if (customerId) {
        conditions.push('so.customer_id = ?');
        params.push(customerId);
      }

      const [rows] = await pool.execute(
        `SELECT
            so.id AS order_id,
            so.order_no,
            so.order_date,
            so.customer_id,
            so.customer_site_id,
            so.delivery_type,
            c.name AS customer_name,
            cs.site_name,
            oi.id AS order_item_id,
            oi.product_id,
            oi.item_name,
            oi.spec,
            oi.quantity,
            oi.shipped_qty,
            GREATEST(oi.quantity - COALESCE(oi.shipped_qty, 0), 0)
              AS remaining_qty
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
         JOIN order_items oi ON oi.order_id = so.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY so.order_date ASC, so.id ASC, oi.id ASC`,
        params
      );

      send(res, rows);
    })
  );

  router.post(
    '/quick-order-ship',
    requirePermission('orders.write'),
    asyncRoute(async (req, res) => {
      const body = req.body || {};
      const customerId = toInt(body.customer_id, 0);
      const customerSiteId = toInt(body.customer_site_id, 0) || null;
      const items = Array.isArray(body.items) ? body.items : [];

      if (!customerId) {
        return res.status(400).json({
          ok: false,
          error: '거래처를 선택하세요.'
        });
      }

      if (items.length === 0) {
        return res.status(400).json({
          ok: false,
          error: '출고 품목을 1개 이상 입력하세요.'
        });
      }

      const result = await withTransaction(async (conn) => {
        const [customerRows] = await conn.execute(
          "SELECT * FROM customers WHERE id = ? AND status <> 'deleted'",
          [customerId]
        );
        const customer = customerRows[0];
        if (!customer) throw new Error('거래처를 찾을 수 없습니다.');

        let site = null;
        if (customerSiteId) {
          const [siteRows] = await conn.execute(
            `SELECT *
               FROM customer_sites
              WHERE id = ? AND customer_id = ?
                AND status <> 'deleted'`,
            [customerSiteId, customerId]
          );
          site = siteRows[0];
          if (!site) throw new Error('납품처가 거래처와 일치하지 않습니다.');
        }

        const normalizedItems = [];
        for (const raw of items) {
          const productId = toInt(raw.product_id, 0) || null;
          const quantity = toInt(raw.quantity, 0);
          if (quantity <= 0) throw new Error('출고수량은 0보다 커야 합니다.');

          let product = null;
          if (productId) {
            const [productRows] = await conn.execute(
              "SELECT * FROM products WHERE id = ? AND status <> 'deleted'",
              [productId]
            );
            product = productRows[0];
            if (!product) throw new Error(`제품 ID ${productId}를 찾을 수 없습니다.`);
          }

          const itemName = clean(raw.item_name) || product?.name;
          if (!itemName) throw new Error('품목명을 입력하세요.');

          const unitPrice =
            raw.unit_price !== undefined &&
            raw.unit_price !== null &&
            raw.unit_price !== ''
              ? toNumber(raw.unit_price)
              : toNumber(product?.default_price);

          normalizedItems.push({
            product_id: productId,
            item_name: itemName,
            spec: clean(raw.spec) || product?.spec || null,
            quantity,
            unit_price: unitPrice,
            amount: quantity * unitPrice
          });
        }

        const subtotal = normalizedItems.reduce(
          (sum, item) => sum + item.amount,
          0
        );
        const vat = toNumber(body.vat_amount, 0);
        const total = subtotal + vat;
        const deliveryType = normalizeDeliveryType(
          body.delivery_type || site?.default_delivery_type
        );
        const orderNo = clean(body.order_no) || generateNo('SO');
        const orderDate = clean(body.order_date) || todayKst();

        const [orderResult] = await conn.execute(
          `INSERT INTO sales_orders(
            order_no, order_date, customer_id, customer_site_id,
            source, delivery_type, delivery_group, delivery_method,
            status, subtotal, vat_amount, total_amount,
            receivable_posted, memo, ordered_by, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shipped', ?, ?, ?, 1, ?, ?, ?, ?)`,
          [
            orderNo,
            orderDate,
            customerId,
            site?.id || null,
            clean(body.source) || 'direct_ship',
            deliveryType,
            clean(body.delivery_group) ||
              site?.default_delivery_group ||
              '기타',
            clean(body.delivery_method) || deliveryType,
            subtotal,
            vat,
            total,
            clean(body.memo),
            req.user.id,
            req.user.id,
            req.user.id
          ]
        );

        const orderId = orderResult.insertId;

        for (const item of normalizedItems) {
          const [itemResult] = await conn.execute(
            `INSERT INTO order_items(
              order_id, product_id, item_name, spec,
              quantity, unit_price, amount, shipped_qty
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              item.product_id,
              item.item_name,
              item.spec,
              item.quantity,
              item.unit_price,
              item.amount,
              item.quantity
            ]
          );

          if (item.product_id) {
            const [productRows] = await conn.execute(
              'SELECT * FROM products WHERE id = ? FOR UPDATE',
              [item.product_id]
            );
            const beforeProduct = productRows[0];
            const stockAfter =
              toInt(beforeProduct.current_stock, 0) - item.quantity;

            await conn.execute(
              `UPDATE products
                  SET current_stock = ?, updated_by = ?
                WHERE id = ?`,
              [stockAfter, req.user.id, item.product_id]
            );

            const [inventoryResult] = await conn.execute(
              `INSERT INTO inventory_transactions(
                product_id, txn_type, qty_change, stock_after,
                ref_table, ref_id, memo, created_by
              ) VALUES (?, 'order_out', ?, ?, 'sales_orders', ?, ?, ?)`,
              [
                item.product_id,
                -item.quantity,
                stockAfter,
                orderId,
                `즉시출고 ${orderNo}`,
                req.user.id
              ]
            );

            const afterProduct = await getRecord(
              conn,
              'products',
              item.product_id
            );
            const inventory = await getRecord(
              conn,
              'inventory_transactions',
              inventoryResult.insertId
            );

            await auditLog(
              conn,
              'products',
              item.product_id,
              'UPDATE',
              beforeProduct,
              afterProduct,
              req,
              '주문등록과 즉시출고'
            );

            await auditLog(
              conn,
              'inventory_transactions',
              inventoryResult.insertId,
              'INSERT',
              null,
              inventory,
              req,
              '주문등록과 즉시출고'
            );
          }

          const orderItem = await getRecord(
            conn,
            'order_items',
            itemResult.insertId
          );
          await auditLog(
            conn,
            'order_items',
            itemResult.insertId,
            'INSERT',
            null,
            orderItem,
            req,
            '주문등록과 즉시출고'
          );
        }

        await addReceivable(
          conn,
          {
            customer_id: customerId,
            customer_site_id: site?.id || null,
            delivery_type: deliveryType,
            txn_date: orderDate,
            txn_type: 'SALE',
            order_id: orderId,
            amount: total,
            memo: `즉시출고 주문 ${orderNo}`
          },
          req
        );

        const [shipmentResult] = await conn.execute(
          `INSERT INTO shipments(
            order_id, customer_site_id, delivery_type, delivery_group,
            delivery_method, carrier, invoice_no, box_no, status,
            shipped_at, receiver_name, confirmation_note, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shipped', ?, ?, ?, ?)`,
          [
            orderId,
            site?.id || null,
            deliveryType,
            clean(body.delivery_group) ||
              site?.default_delivery_group ||
              '기타',
            clean(body.delivery_method) || deliveryType,
            clean(body.carrier),
            clean(body.invoice_no),
            clean(body.box_no),
            clean(body.shipped_at) || new Date(),
            clean(body.receiver_name),
            clean(body.confirmation_note),
            req.user.id
          ]
        );

        const order = await getRecord(conn, 'sales_orders', orderId);
        const shipment = await getRecord(
          conn,
          'shipments',
          shipmentResult.insertId
        );
        const [savedItems] = await conn.execute(
          'SELECT * FROM order_items WHERE order_id = ? ORDER BY id',
          [orderId]
        );

        await auditLog(
          conn,
          'sales_orders',
          orderId,
          'INSERT',
          null,
          { ...order, items: savedItems },
          req,
          '주문등록과 즉시출고'
        );

        await auditLog(
          conn,
          'shipments',
          shipmentResult.insertId,
          'INSERT',
          null,
          shipment,
          req,
          '주문등록과 즉시출고'
        );

        return { order, shipment, items: savedItems };
      });

      send(res, result, 201);
    })
  );


  async function orderDeleteSummary(conn, orderId) {
    const [orderRows] = await conn.execute(
      `SELECT so.*, c.name AS customer_name
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
        WHERE so.id = ?`,
      [orderId]
    );
    const order = orderRows[0];
    if (!order || order.deleted_at) {
      throw httpError(404, '주문을 찾을 수 없습니다.');
    }

    const [[itemStats]] = await conn.execute(
      `SELECT COUNT(*) AS order_items,
              COALESCE(SUM(COALESCE(shipped_qty, 0)), 0) AS shipped_qty
         FROM order_items
        WHERE order_id = ?`,
      [orderId]
    );
    const [[shipmentStats]] = await conn.execute(
      'SELECT COUNT(*) AS shipments FROM shipments WHERE order_id = ?',
      [orderId]
    );
    const [[receivableStats]] = await conn.execute(
      'SELECT COUNT(*) AS receivable_transactions FROM receivable_transactions WHERE order_id = ?',
      [orderId]
    );
    const [[paymentStats]] = await conn.execute(
      `SELECT COUNT(*) AS linked_payments
         FROM payments
        WHERE order_id = ?
          AND deleted_at IS NULL`,
      [orderId]
    );
    const [[inventoryStats]] = await conn.execute(
      `SELECT COUNT(*) AS inventory_transactions
         FROM inventory_transactions
        WHERE ref_table = 'sales_orders'
          AND ref_id = ?`,
      [orderId]
    );

    return {
      order_id: orderId,
      order_no: order.order_no,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      total_amount: Number(order.total_amount || 0),
      order_items: Number(itemStats.order_items || 0),
      shipped_qty: Number(itemStats.shipped_qty || 0),
      shipments: Number(shipmentStats.shipments || 0),
      receivable_transactions: Number(receivableStats.receivable_transactions || 0),
      linked_payments: Number(paymentStats.linked_payments || 0),
      inventory_transactions: Number(inventoryStats.inventory_transactions || 0),
      needs_cleanup: Number(itemStats.shipped_qty || 0) > 0 ||
        Number(shipmentStats.shipments || 0) > 0 ||
        Number(receivableStats.receivable_transactions || 0) > 0 ||
        Number(paymentStats.linked_payments || 0) > 0 ||
        Number(inventoryStats.inventory_transactions || 0) > 0
    };
  }



  router.get(
    '/orders/:id/statement',
    requirePermission('orders.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        const orderId = toInt(req.params.id, 0);
        const [orders] = await conn.execute(
          `SELECT so.*, c.name AS customer_name, c.business_no, c.owner_name, c.phone, c.mobile,
                  c.address, c.road_address, c.jibun_address, c.detail_address,
                  cs.site_name, cs.region, cs.phone AS site_phone, cs.business_no AS site_business_no,
                  cs.original_customer_name AS site_original_customer_name
             FROM sales_orders so
             JOIN customers c ON c.id = so.customer_id
             LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
            WHERE so.id = ?
              AND so.deleted_at IS NULL`,
          [orderId]
        );
        const order = orders[0];
        if (!order) throw httpError(404, '주문을 찾을 수 없습니다.');
        const [items] = await conn.execute(
          `SELECT * FROM order_items WHERE order_id = ? ORDER BY id`,
          [orderId]
        );
        const [shipments] = await conn.execute(
          `SELECT * FROM shipments WHERE order_id = ? ORDER BY shipped_at DESC, id DESC`,
          [orderId]
        );
        const currentBalance = await receivableBalance(conn, order.customer_id);
        const todaySale = Number(order.total_amount || 0);
        const previousBalance = currentBalance - todaySale;
        send(res, {
          order,
          customer: {
            id: order.customer_id,
            name: displayName({ name: order.customer_name, original_customer_name: order.site_original_customer_name, site_name: order.site_name }),
            business_no: order.site_business_no || order.business_no,
            owner_name: order.owner_name,
            phone: formatPhone(order.site_phone || order.phone || order.mobile),
            address: [order.road_address || order.address || order.jibun_address, order.detail_address].filter(Boolean).join(' ')
          },
          items,
          shipments,
          today_sale_amount: todaySale,
          previous_balance: previousBalance,
          total_balance: currentBalance
        });
      } finally {
        conn.release();
      }
    })
  );

  router.get(
    '/reports/order-shipments',
    requirePermission('orders.read'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const params = [];
      const conditions = ['so.deleted_at IS NULL'];
      const q = clean(req.query.q);
      const customerQ = clean(req.query.customer_q);
      const customerId = toInt(req.query.customer_id, 0);
      const dateFrom = clean(req.query.date_from);
      const dateTo = clean(req.query.date_to);
      const deliveryType = clean(req.query.delivery_type);
      const status = clean(req.query.status);

      if (q) {
        const like = `%${q}%`;
        conditions.push('(so.order_no LIKE ? OR c.name LIKE ? OR cs.site_name LIKE ? OR so.delivery_group LIKE ? OR so.memo LIKE ?)');
        params.push(like, like, like, like, like);
      }
      if (customerId) { conditions.push('so.customer_id = ?'); params.push(customerId); }
      else if (customerQ) { conditions.push('c.name LIKE ?'); params.push(`%${customerQ}%`); }
      if (dateFrom) { conditions.push('so.order_date >= ?'); params.push(dateFrom); }
      if (dateTo) { conditions.push('so.order_date <= ?'); params.push(dateTo); }
      if (deliveryType) { conditions.push('so.delivery_type = ?'); params.push(normalizeDeliveryType(deliveryType)); }
      if (status) { conditions.push('so.status = ?'); params.push(status); }

      const [rows] = await pool.execute(
        `SELECT so.id, so.order_no, so.order_date, so.status, so.delivery_type, so.delivery_group,
                so.total_amount, c.name AS customer_name, c.code AS customer_code,
                cs.site_name, cs.region, cs.original_customer_name AS site_original_customer_name,
                COALESCE(SUM(oi.quantity), 0) AS order_qty,
                COALESCE(SUM(oi.shipped_qty), 0) AS shipped_qty,
                COALESCE(SUM(GREATEST(oi.quantity - COALESCE(oi.shipped_qty,0),0)), 0) AS remaining_qty,
                GROUP_CONCAT(DISTINCT sh.carrier ORDER BY sh.id SEPARATOR ', ') AS carriers,
                GROUP_CONCAT(DISTINCT sh.invoice_no ORDER BY sh.id SEPARATOR ', ') AS invoice_nos,
                MAX(sh.shipped_at) AS last_shipped_at
           FROM sales_orders so
           JOIN customers c ON c.id = so.customer_id
           LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
           LEFT JOIN order_items oi ON oi.order_id = so.id
           LEFT JOIN shipments sh ON sh.order_id = so.id
          WHERE ${conditions.join(' AND ')}
          GROUP BY so.id
          ORDER BY so.order_date ASC, so.id ASC
          LIMIT 5000`,
        params
      );
      send(res, {
        date_from: dateFrom || '',
        date_to: dateTo || todayKst(),
        rows: rows.map((row) => decorateCustomer({ ...row, name: row.customer_name, original_customer_name: row.site_original_customer_name }))
      });
    })
  );

  router.get(
    '/orders/:id/delete-check',
    requirePermission('orders.write'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        send(res, await orderDeleteSummary(conn, toInt(req.params.id, 0)));
      } finally {
        conn.release();
      }
    })
  );

  router.delete(
    '/orders/:id',
    requirePermission('orders.write'),
    asyncRoute(async (req, res) => {
      const orderId = toInt(req.params.id, 0);
      const reason = clean(req.body?.delete_reason);
      const confirmed = req.body?.confirm_cleanup === true || String(req.body?.confirm_cleanup || '') === '1';
      if (!reason) throw httpError(400, '삭제 사유를 입력하세요.');
      if (!confirmed) throw httpError(400, '삭제 전 관련자료 정리 확인이 필요합니다.');

      const result = await withTransaction(async (conn) => {
        const summary = await orderDeleteSummary(conn, orderId);
        const [orderRows] = await conn.execute('SELECT * FROM sales_orders WHERE id = ? FOR UPDATE', [orderId]);
        const beforeOrder = orderRows[0];
        if (!beforeOrder || beforeOrder.deleted_at) throw httpError(404, '주문을 찾을 수 없습니다.');

        const [beforeItems] = await conn.execute('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
        const [beforeShipments] = await conn.execute('SELECT * FROM shipments WHERE order_id = ? ORDER BY id', [orderId]);
        const [beforeReceivables] = await conn.execute('SELECT * FROM receivable_transactions WHERE order_id = ? ORDER BY id', [orderId]);
        const [beforePayments] = await conn.execute('SELECT * FROM payments WHERE order_id = ? ORDER BY id', [orderId]);

        // 이미 출고된 수량은 주문삭제와 동시에 제품 재고로 복원합니다.
        for (const item of beforeItems) {
          const shippedQty = toInt(item.shipped_qty, 0);
          if (!item.product_id || shippedQty <= 0) continue;
          const [productRows] = await conn.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
          const beforeProduct = productRows[0];
          if (!beforeProduct) continue;
          const stockAfter = toInt(beforeProduct.current_stock, 0) + shippedQty;
          await conn.execute('UPDATE products SET current_stock = ?, updated_by = ? WHERE id = ?', [stockAfter, req.user.id, item.product_id]);
          const [tx] = await conn.execute(
            `INSERT INTO inventory_transactions(product_id, txn_type, qty_change, stock_after, ref_table, ref_id, memo, created_by)
             VALUES (?, 'delete_reversal_in', ?, ?, 'sales_orders', ?, ?, ?)`,
            [item.product_id, shippedQty, stockAfter, orderId, `주문삭제 출고복원 ${beforeOrder.order_no}: ${reason}`, req.user.id]
          );
          const afterProduct = await getRecord(conn, 'products', item.product_id);
          const inventoryAfter = await getRecord(conn, 'inventory_transactions', tx.insertId);
          await auditLog(conn, 'products', item.product_id, 'UPDATE', beforeProduct, afterProduct, req, `주문삭제 출고복원: ${reason}`);
          await auditLog(conn, 'inventory_transactions', tx.insertId, 'INSERT', null, inventoryAfter, req, `주문삭제 출고복원: ${reason}`);
        }

        await conn.execute('UPDATE order_items SET shipped_qty = 0 WHERE order_id = ?', [orderId]);
        await conn.execute('DELETE FROM shipments WHERE order_id = ?', [orderId]);
        await conn.execute('UPDATE payments SET order_id = NULL, updated_by = ? WHERE order_id = ?', [req.user.id, orderId]);
        await conn.execute('DELETE FROM receivable_transactions WHERE order_id = ?', [orderId]);
        await conn.execute(
          `UPDATE sales_orders
              SET status = 'deleted', receivable_posted = 0,
                  deleted_at = NOW(), deleted_by = ?, delete_reason = ?, updated_by = ?
            WHERE id = ?`,
          [req.user.id, reason, req.user.id, orderId]
        );

        const afterOrder = await getRecord(conn, 'sales_orders', orderId);
        await auditLog(
          conn,
          'sales_orders',
          orderId,
          'DELETE',
          { ...beforeOrder, items: beforeItems, shipments: beforeShipments, receivables: beforeReceivables, payments: beforePayments, summary },
          afterOrder,
          req,
          reason
        );

        return { summary, order: afterOrder, message: '주문 관련 자료를 정리하고 삭제했습니다.' };
      });

      send(res, result);
    })
  );



  async function customerSiteDeleteSummary(conn, siteId) {
    const [siteRows] = await conn.execute(
      `SELECT cs.*, c.name AS customer_name, c.business_no AS customer_business_no
         FROM customer_sites cs
         JOIN customers c ON c.id = cs.customer_id
        WHERE cs.id = ?`,
      [siteId]
    );
    const site = siteRows[0];
    if (!site || site.status === 'deleted') throw httpError(404, '거래처/납품장소를 찾을 수 없습니다.');

    const [[orderStats]] = await conn.execute(
      `SELECT COUNT(*) AS orders
         FROM sales_orders
        WHERE customer_site_id = ?
          AND deleted_at IS NULL`,
      [siteId]
    );
    const [[shipmentStats]] = await conn.execute(
      `SELECT COUNT(*) AS shipments
         FROM shipments
        WHERE customer_site_id = ?`,
      [siteId]
    );
    const [[paymentStats]] = await conn.execute(
      `SELECT COUNT(*) AS payments
         FROM payments
        WHERE customer_site_id = ?
          AND deleted_at IS NULL`,
      [siteId]
    );
    const [[receivableStats]] = await conn.execute(
      'SELECT COUNT(*) AS receivable_transactions FROM receivable_transactions WHERE customer_site_id = ?',
      [siteId]
    );

    const orders = Number(orderStats.orders || 0);
    const shipments = Number(shipmentStats.shipments || 0);
    const payments = Number(paymentStats.payments || 0);
    const receivables = Number(receivableStats.receivable_transactions || 0);
    const closedBusiness = isClosedBusinessName({
      display_name: site.original_customer_name,
      name: site.original_customer_name,
      site_name: site.site_name,
      customer_name: site.customer_name
    });
    return {
      customer_site_id: siteId,
      customer_id: site.customer_id,
      customer_name: displayName({ name: site.original_customer_name, site_name: site.site_name, customer_name: site.customer_name }),
      orders,
      shipments,
      payments,
      receivable_transactions: receivables,
      closed_business: closedBusiness,
      can_delete: closedBusiness || (orders === 0 && shipments === 0 && payments === 0 && receivables === 0)
    };
  }

  router.get(
    '/customer-sites/:id/delete-check',
    requirePermission('customers.write'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        send(res, await customerSiteDeleteSummary(conn, toInt(req.params.id, 0)));
      } finally {
        conn.release();
      }
    })
  );

  router.delete(
    '/customer-sites/:id',
    requirePermission('customers.write'),
    asyncRoute(async (req, res) => {
      const siteId = toInt(req.params.id, 0);
      const reason = clean(req.body?.delete_reason);
      if (!reason) throw httpError(400, '삭제 사유를 입력하세요.');
      const deleted = await withTransaction(async (conn) => {
        const summary = await customerSiteDeleteSummary(conn, siteId);
        if (!summary.can_delete) {
          throw httpError(409, "주문·출고·수금·원장 자료가 남아 있어 삭제할 수 없습니다. 단, 거래처명 끝에 '폐업'이 있는 자료는 삭제할 수 있습니다.", summary);
        }
        const before = await getRecord(conn, 'customer_sites', siteId);
        await conn.execute(
          `UPDATE customer_sites
              SET status = 'deleted', updated_by = ?, memo = CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, ?)
            WHERE id = ?`,
          [req.user.id, `삭제처리: ${reason}`, siteId]
        );
        const after = await getRecord(conn, 'customer_sites', siteId);
        await auditLog(conn, 'customer_sites', siteId, 'DELETE', { ...before, summary }, after, req, reason);
        return { customer_site: after, summary };
      });
      send(res, deleted);
    })
  );

  async function customerDeleteSummary(conn, customerId) {
    const [customerRows] = await conn.execute('SELECT * FROM customers WHERE id = ?', [customerId]);
    const customer = customerRows[0];
    if (!customer || customer.status === 'deleted') throw httpError(404, '거래처를 찾을 수 없습니다.');

    const [[siteStats]] = await conn.execute(
      `SELECT COUNT(*) AS sites
         FROM customer_sites
        WHERE customer_id = ?
          AND status <> 'deleted'`,
      [customerId]
    );
    const [[orderStats]] = await conn.execute(
      `SELECT COUNT(*) AS orders
         FROM sales_orders
        WHERE customer_id = ?
          AND deleted_at IS NULL`,
      [customerId]
    );
    const [[shipmentStats]] = await conn.execute(
      `SELECT COUNT(*) AS shipments
         FROM shipments sh
         JOIN sales_orders so ON so.id = sh.order_id
        WHERE so.customer_id = ?
          AND so.deleted_at IS NULL`,
      [customerId]
    );
    const [[paymentStats]] = await conn.execute(
      `SELECT COUNT(*) AS payments
         FROM payments
        WHERE customer_id = ?
          AND deleted_at IS NULL`,
      [customerId]
    );
    const [[receivableStats]] = await conn.execute(
      'SELECT COUNT(*) AS receivable_transactions FROM receivable_transactions WHERE customer_id = ?',
      [customerId]
    );

    const orders = Number(orderStats.orders || 0);
    const shipments = Number(shipmentStats.shipments || 0);
    const payments = Number(paymentStats.payments || 0);
    const receivables = Number(receivableStats.receivable_transactions || 0);
    const closedBusiness = isClosedBusinessName(customer);
    return {
      customer_id: customerId,
      customer_name: displayName(customer),
      sites: Number(siteStats.sites || 0),
      orders,
      shipments,
      payments,
      receivable_transactions: receivables,
      closed_business: closedBusiness,
      can_delete: closedBusiness || (orders === 0 && shipments === 0 && payments === 0 && receivables === 0)
    };
  }

  router.get(
    '/customers/:id/delete-check',
    requirePermission('customers.write'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        send(res, await customerDeleteSummary(conn, toInt(req.params.id, 0)));
      } finally {
        conn.release();
      }
    })
  );

  router.delete(
    '/customers/:id',
    requirePermission('customers.write'),
    asyncRoute(async (req, res) => {
      const customerId = toInt(req.params.id, 0);
      const reason = clean(req.body?.delete_reason);
      if (!reason) throw httpError(400, '삭제 사유를 입력하세요.');

      const deleted = await withTransaction(async (conn) => {
        const summary = await customerDeleteSummary(conn, customerId);
        if (!summary.can_delete) {
          throw httpError(409, '주문·출고·수금·원장 자료가 남아 있어 거래처를 삭제할 수 없습니다. 관련 자료를 먼저 정리하세요.', summary);
        }
        const before = await getRecord(conn, 'customers', customerId);
        const [beforeSites] = await conn.execute('SELECT * FROM customer_sites WHERE customer_id = ? ORDER BY id', [customerId]);
        await conn.execute(
          `UPDATE customer_sites
              SET status = 'deleted', updated_by = ?
            WHERE customer_id = ?`,
          [req.user.id, customerId]
        );
        await conn.execute(
          `UPDATE customers
              SET status = 'deleted', updated_by = ?, memo = CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, ?)
            WHERE id = ?`,
          [req.user.id, `삭제처리: ${reason}`, customerId]
        );
        const after = await getRecord(conn, 'customers', customerId);
        await auditLog(conn, 'customers', customerId, 'DELETE', { ...before, sites: beforeSites, summary }, after, req, reason);
        return { customer: after, summary };
      });
      send(res, deleted);
    })
  );

  router.post(
    '/repair-mojibake',
    requirePermission('payments.write'),
    asyncRoute(async (req, res) => {
      const result = await withTransaction(async (conn) => {
        const targets = [
          ['payments', 'memo'],
          ['payments', 'approval_no'],
          ['receivable_transactions', 'memo'],
          ['import_batches', 'file_name'],
          ['sales_orders', 'memo'],
          ['customers', 'memo'],
          ['customer_sites', 'memo'],
          ['products', 'memo'],
          ['audit_logs', 'change_reason']
        ];

        let scanned = 0;
        let updated = 0;
        const details = [];

        for (const [tableName, columnName] of targets) {
          const [rows] = await conn.query(
            `SELECT id, ${columnName} AS value
               FROM ${tableName}
              WHERE ${columnName} IS NOT NULL
                AND ${columnName} <> ''
              LIMIT 50000`
          );

          let tableUpdated = 0;
          for (const row of rows) {
            scanned += 1;
            const repaired = tableName === 'import_batches'
              ? normalizeUploadedFileName(row.value)
              : repairMojibake(row.value);
            if (repaired !== String(row.value)) {
              await conn.execute(
                `UPDATE ${tableName}
                    SET ${columnName} = ?
                  WHERE id = ?`,
                [repaired, row.id]
              );
              updated += 1;
              tableUpdated += 1;
            }
          }

          details.push({
            table: tableName,
            column: columnName,
            scanned: rows.length,
            updated: tableUpdated
          });
        }

        // Imported payment memos do not need to expose a file name in the
        // day-to-day payment list. Standardizing them also removes characters
        // that were already replaced and can no longer be decoded.
        const [importedPayments] = await conn.query(
          `SELECT id, payment_no, memo
             FROM payments
            WHERE deleted_at IS NULL
              AND payment_no LIKE 'PAY-IMP-%'
            LIMIT 50000`
        );

        let normalizedPayments = 0;
        for (const row of importedPayments) {
          scanned += 1;
          const normalized = normalizeImportedPaymentMemo({
            paymentNo: row.payment_no,
            memo: row.memo
          });
          if (normalized !== String(row.memo || '')) {
            await conn.execute(
              'UPDATE payments SET memo = ? WHERE id = ?',
              [normalized, row.id]
            );
            updated += 1;
            normalizedPayments += 1;
          }
        }

        details.push({
          table: 'payments',
          column: 'imported_memo',
          scanned: importedPayments.length,
          updated: normalizedPayments
        });

        return { scanned, updated, details };
      });

      send(res, result);
    })
  );


  async function ensureSalesManagersRuntime(connOrPool) {
    await connOrPool.query(`CREATE TABLE IF NOT EXISTS sales_managers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      bank_name VARCHAR(80) NULL,
      account_no VARCHAR(120) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      memo VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sales_managers_active_sort (is_active, sort_order, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const columns = [
      ['sales_manager_id', 'BIGINT UNSIGNED NULL'],
      ['sales_manager_name', 'VARCHAR(80) NULL'],
      ['sales_manager_bank', 'VARCHAR(80) NULL'],
      ['sales_manager_account', 'VARCHAR(120) NULL']
    ];
    async function columnExists(tableName, columnName) {
      const [rows] = await connOrPool.execute(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tableName, columnName]);
      return Number(rows[0]?.cnt || 0) > 0;
    }
    async function addColumn(tableName, columnName, definition) {
      if (!(await columnExists(tableName, columnName))) await connOrPool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
    for (const tableName of ['customers', 'customer_sites', 'payments']) {
      for (const [name, definition] of columns) await addColumn(tableName, name, definition);
    }
    const defaults = [['김안구', 10], ['김동열', 20], ['이영성', 30], ['사무실', 40]];
    for (const [name, sortOrder] of defaults) {
      await connOrPool.execute(`INSERT INTO sales_managers(name, sort_order, is_active) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), is_active = 1`, [name, sortOrder]);
    }
    const [officeRows] = await connOrPool.execute('SELECT id, name, bank_name, account_no FROM sales_managers WHERE name = ? LIMIT 1', ['사무실']);
    const office = officeRows[0];
    if (office) {
      for (const tableName of ['customers', 'customer_sites']) {
        await connOrPool.execute(
          `UPDATE ${tableName}
              SET sales_manager_id = ?, sales_manager_name = ?, sales_manager_bank = COALESCE(NULLIF(sales_manager_bank,''), ?), sales_manager_account = COALESCE(NULLIF(sales_manager_account,''), ?)
            WHERE sales_manager_id IS NULL OR sales_manager_name IS NULL OR sales_manager_name = ''`,
          [office.id, office.name, office.bank_name || '', office.account_no || '']
        );
      }
    }
  }

  async function resolveSalesManager(conn, body = {}, customerId = 0, siteId = 0) {
    await ensureSalesManagersRuntime(conn);
    let manager = null;
    const managerId = toInt(body.sales_manager_id, 0);
    if (managerId) {
      const [rows] = await conn.execute('SELECT * FROM sales_managers WHERE id = ? LIMIT 1', [managerId]);
      manager = rows[0] || null;
    }
    if (!manager && clean(body.sales_manager_name)) {
      const [rows] = await conn.execute('SELECT * FROM sales_managers WHERE name = ? LIMIT 1', [clean(body.sales_manager_name)]);
      manager = rows[0] || null;
    }
    if (!manager && siteId) {
      const [rows] = await conn.execute('SELECT sales_manager_id, sales_manager_name, sales_manager_bank, sales_manager_account FROM customer_sites WHERE id = ? LIMIT 1', [siteId]);
      if (rows[0]?.sales_manager_name) manager = { id: rows[0].sales_manager_id, name: rows[0].sales_manager_name, bank_name: rows[0].sales_manager_bank, account_no: rows[0].sales_manager_account };
    }
    if (!manager && customerId) {
      const [rows] = await conn.execute('SELECT sales_manager_id, sales_manager_name, sales_manager_bank, sales_manager_account FROM customers WHERE id = ? LIMIT 1', [customerId]);
      if (rows[0]?.sales_manager_name) manager = { id: rows[0].sales_manager_id, name: rows[0].sales_manager_name, bank_name: rows[0].sales_manager_bank, account_no: rows[0].sales_manager_account };
    }
    if (!manager) return { id: null, name: null, bank_name: null, account_no: null };
    return { id: manager.id || null, name: manager.name || manager.sales_manager_name || null, bank_name: manager.bank_name || manager.sales_manager_bank || null, account_no: manager.account_no || manager.sales_manager_account || null };
  }

  router.get('/sales-managers', requirePermission('customers.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const [rows] = await pool.query('SELECT id, name, bank_name, account_no, sort_order, is_active, memo FROM sales_managers ORDER BY is_active DESC, sort_order, name');
    send(res, rows);
  }));

  router.post('/sales-managers', requirePermission('masters.write'), asyncRoute(async (req, res) => {
    const name = clean(req.body?.name);
    if (!name) throw httpError(400, '영업담당자명을 입력하세요.');
    const result = await withTransaction(async (conn) => {
      await ensureSalesManagersRuntime(conn);
      const id = toInt(req.body?.id, 0);
      if (id) {
        await conn.execute('UPDATE sales_managers SET name = ?, bank_name = ?, account_no = ?, sort_order = ?, is_active = ? WHERE id = ?', [name, clean(req.body.bank_name), clean(req.body.account_no), toInt(req.body.sort_order, 0), req.body.is_active === false || req.body.is_active === '0' ? 0 : 1, id]);
      } else {
        await conn.execute('INSERT INTO sales_managers(name, bank_name, account_no, sort_order, is_active) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE bank_name = VALUES(bank_name), account_no = VALUES(account_no), sort_order = VALUES(sort_order), is_active = VALUES(is_active)', [name, clean(req.body.bank_name), clean(req.body.account_no), toInt(req.body.sort_order, 0), req.body.is_active === false || req.body.is_active === '0' ? 0 : 1]);
      }
      const [rows] = await conn.execute('SELECT * FROM sales_managers WHERE name = ? LIMIT 1', [name]);
      return rows[0];
    });
    send(res, result, 201);
  }));

  router.get('/customers/:id/sales-manager', requirePermission('customers.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const [rows] = await pool.execute(`SELECT c.id, c.name, c.sales_manager_id, c.sales_manager_name, c.sales_manager_bank, c.sales_manager_account,
             sm.name AS manager_name, sm.bank_name AS manager_bank, sm.account_no AS manager_account
        FROM customers c LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id WHERE c.id = ? LIMIT 1`, [toInt(req.params.id, 0)]);
    const r = rows[0] || {};
    send(res, { sales_manager_id: r.sales_manager_id || null, sales_manager_name: r.sales_manager_name || r.manager_name || '', sales_manager_bank: r.sales_manager_bank || r.manager_bank || '', sales_manager_account: r.sales_manager_account || r.manager_account || '' });
  }));

  router.post('/payments-v312', requirePermission('payments.write'), asyncRoute(async (req, res) => {
    const customerId = toInt(req.body.customer_id, 0);
    const amount = toNumber(String(req.body.amount || '0').replace(/,/g, ''), 0);
    if (!customerId) throw httpError(400, '거래처를 선택하세요.');
    if (amount <= 0) throw httpError(400, '수금액은 0보다 커야 합니다.');
    const inserted = await withTransaction(async (conn) => {
      await ensureSalesManagersRuntime(conn);
      const customerSiteId = req.body.customer_site_id ? toInt(req.body.customer_site_id) : null;
      const manager = await resolveSalesManager(conn, req.body, customerId, customerSiteId || 0);
      const deliveryType = normalizeDeliveryType(req.body.delivery_type || '택배');
      const paymentNo = clean(req.body.payment_no) || generateNo('PAY');
      const paymentDate = clean(req.body.payment_date) || todayKst();
      const [result] = await conn.execute(
        `INSERT INTO payments(payment_no, customer_id, customer_site_id, order_id, delivery_type, payment_date, method, amount, card_company, approval_no,
                              bank_name, collector_user_id, memo, sales_manager_id, sales_manager_name, sales_manager_bank, sales_manager_account, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentNo, customerId, customerSiteId, req.body.order_id ? toInt(req.body.order_id) : null, deliveryType, paymentDate, clean(req.body.method) || 'card', amount, clean(req.body.card_company), clean(req.body.approval_no), clean(req.body.bank_name), req.user.id, clean(req.body.memo), manager.id, manager.name, manager.bank_name, manager.account_no, req.user.id, req.user.id]
      );
      await conn.execute(`INSERT INTO receivable_transactions(customer_id, customer_site_id, delivery_type, txn_date, txn_type, payment_id, amount, memo, created_by) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, ?, ?)`, [customerId, customerSiteId, deliveryType, paymentDate, result.insertId, -amount, `수금 ${paymentNo}`, req.user.id]);
      const [rows] = await conn.execute('SELECT * FROM payments WHERE id = ?', [result.insertId]);
      return rows[0];
    });
    send(res, inserted, 201);
  }));




  router.get('/payments-page', requirePermission('payments.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
    const dateTo = clean(req.query.date_to) || todayKst();
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(10, toInt(req.query.limit, 10)));
    const offset = (page - 1) * limit;
    const params = [dateFrom, dateTo];
    const [[summary]] = await pool.execute(
      `SELECT COUNT(*) AS total_count, COALESCE(SUM(p.amount),0) AS total_amount
         FROM payments p
        WHERE p.deleted_at IS NULL
          AND p.payment_date BETWEEN ? AND ?`,
      params
    );
    const [rows] = await pool.execute(
      `SELECT p.id, p.payment_no, p.payment_date, p.delivery_type, p.method, p.amount,
              p.approval_no, p.memo,
              c.name AS customer_name,
              COALESCE(cs.site_name, cs.region, '') AS site_name,
              COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실') AS sales_manager_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         LEFT JOIN customer_sites cs ON cs.id = p.customer_site_id
         LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id
        WHERE p.deleted_at IS NULL
          AND p.payment_date BETWEEN ? AND ?
        ORDER BY p.payment_date DESC, p.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    send(res, { page, limit, total_count: Number(summary.total_count || 0), total_amount: Number(summary.total_amount || 0), rows });
  }));

  router.get('/receivables-page', requirePermission('payments.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(10, toInt(req.query.limit, 10)));
    const offset = (page - 1) * limit;
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS total_count, COALESCE(SUM(receivable_balance),0) AS total_receivable
         FROM v_customer_receivable_by_delivery_type
        WHERE COALESCE(receivable_balance,0) <> 0`
    );
    const [rows] = await pool.execute(
      `SELECT customer_id, customer_name, customer_site_id, site_name, delivery_type,
              sales_amount, payment_amount, receivable_balance
         FROM v_customer_receivable_by_delivery_type
        WHERE COALESCE(receivable_balance,0) <> 0
        ORDER BY customer_name, site_name, FIELD(delivery_type, '택배', '영업방문', '기타'), delivery_type
        LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    send(res, { page, limit, total_count: Number(summary.total_count || 0), total_receivable: Number(summary.total_receivable || 0), rows });
  }));

  // V317 stable report APIs. These endpoints avoid ONLY_FULL_GROUP_BY errors and keep report layouts independent.
  router.get('/reports-v317/customer-sales', requirePermission('orders.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
    const dateTo = clean(req.query.date_to) || todayKst();
    const manager = clean(req.query.sales_manager_name);
    const params = [dateFrom, dateTo];
    let managerWhere = '';
    if (manager) { managerWhere = " AND COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실') = ?"; params.push(manager); }
    const [rows] = await pool.execute(`
      SELECT
        COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실') AS sales_manager_name,
        c.name AS customer_name,
        COALESCE(NULLIF(cs.site_name,''), c.region, '') AS site_name,
        COUNT(DISTINCT so.id) AS order_count,
        COALESCE(SUM(oi.quantity), 0) AS sales_qty,
        COALESCE(SUM(CASE WHEN oi.amount IS NULL OR oi.amount = 0 THEN oi.quantity * oi.unit_price ELSE oi.amount END), 0) AS sales_amount,
        COALESCE((
          SELECT SUM(rt.amount)
            FROM receivable_transactions rt
           WHERE rt.customer_id = c.id
             AND (cs.id IS NULL OR rt.customer_site_id = cs.id OR rt.customer_site_id IS NULL)
        ), 0) AS receivable_amount
      FROM sales_orders so
      JOIN customers c ON c.id = so.customer_id
      LEFT JOIN customer_sites cs ON cs.id = so.customer_site_id
      LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id
      LEFT JOIN order_items oi ON oi.order_id = so.id
      WHERE so.deleted_at IS NULL
        AND so.order_date BETWEEN ? AND ?
        ${managerWhere}
      GROUP BY COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실'), c.id, c.name, cs.id, cs.site_name, c.region
      ORDER BY sales_manager_name, c.name, site_name`, params);
    send(res, { date_from: dateFrom, date_to: dateTo, rows });
  }));

  router.get('/reports-v317/customer-payments', requirePermission('payments.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
    const dateTo = clean(req.query.date_to) || todayKst();
    const manager = clean(req.query.sales_manager_name);
    const params = [dateFrom, dateTo];
    let managerWhere = '';
    if (manager) { managerWhere = " AND COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실') = ?"; params.push(manager); }
    const [rows] = await pool.execute(`
      SELECT
        COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실') AS sales_manager_name,
        c.name AS customer_name,
        COALESCE(NULLIF(cs.site_name,''), c.region, '') AS site_name,
        COUNT(*) AS payment_count,
        COALESCE(SUM(p.amount), 0) AS payment_amount,
        GROUP_CONCAT(DISTINCT p.method ORDER BY p.method SEPARATOR ', ') AS methods
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      LEFT JOIN customer_sites cs ON cs.id = p.customer_site_id
      LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id
      WHERE p.deleted_at IS NULL
        AND p.payment_date BETWEEN ? AND ?
        ${managerWhere}
      GROUP BY COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실'), c.id, c.name, cs.id, cs.site_name, c.region
      ORDER BY sales_manager_name, c.name, site_name`, params);
    send(res, { date_from: dateFrom, date_to: dateTo, rows });
  }));

  router.get('/reports-v317/monthly-sales-matrix', requirePermission('orders.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || `${todayKst().slice(0, 7)}-01`;
    const dateTo = clean(req.query.date_to) || todayKst();
    const manager = clean(req.query.sales_manager_name);
    const params = [dateFrom, dateTo];
    let managerWhere = '';
    if (manager) { managerWhere = " AND COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실') = ?"; params.push(manager); }
    const [salesRows] = await pool.execute(`
      SELECT
        COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실') AS sales_manager_name,
        oi.item_name AS product_name,
        COALESCE(SUM(oi.quantity), 0) AS sales_qty,
        COALESCE(SUM(CASE WHEN oi.amount IS NULL OR oi.amount = 0 THEN oi.quantity * oi.unit_price ELSE oi.amount END), 0) AS sales_amount
      FROM sales_orders so
      JOIN customers c ON c.id = so.customer_id
      LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id
      JOIN order_items oi ON oi.order_id = so.id
      WHERE so.deleted_at IS NULL
        AND so.order_date BETWEEN ? AND ?
        ${managerWhere}
      GROUP BY COALESCE(NULLIF(c.sales_manager_name,''), sm.name, '사무실'), oi.item_name
      ORDER BY oi.item_name, sales_manager_name`, params);

    const paymentParams = [dateFrom, dateTo];
    let paymentManagerWhere = '';
    if (manager) { paymentManagerWhere = " AND COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실') = ?"; paymentParams.push(manager); }
    const [paymentRows] = await pool.execute(`
      SELECT
        COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실') AS sales_manager_name,
        COALESCE(oi.item_name, '미분류') AS product_name,
        COALESCE(SUM(
          CASE
            WHEN so.total_amount > 0 AND oi.amount > 0 THEN p.amount * (oi.amount / so.total_amount)
            WHEN oi.quantity * oi.unit_price > 0 AND so.total_amount > 0 THEN p.amount * ((oi.quantity * oi.unit_price) / so.total_amount)
            ELSE 0
          END
        ), 0) AS payment_amount
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      LEFT JOIN sales_managers sm ON sm.id = c.sales_manager_id
      LEFT JOIN sales_orders so ON so.id = p.order_id
      LEFT JOIN order_items oi ON oi.order_id = so.id
      WHERE p.deleted_at IS NULL
        AND p.payment_date BETWEEN ? AND ?
        ${paymentManagerWhere}
      GROUP BY COALESCE(NULLIF(p.sales_manager_name,''), NULLIF(c.sales_manager_name,''), sm.name, '사무실'), COALESCE(oi.item_name, '미분류')`, paymentParams);

    const managers = Array.from(new Set([...salesRows, ...paymentRows].map((r) => r.sales_manager_name || '사무실'))).sort((a, b) => String(a).localeCompare(String(b), 'ko-KR'));
    const productNames = Array.from(new Set([...salesRows, ...paymentRows].map((r) => r.product_name || '미분류'))).sort((a, b) => String(a).localeCompare(String(b), 'ko-KR'));
    const map = new Map();
    for (const product of productNames) map.set(product, { product_name: product });
    for (const r of salesRows) {
      const product = r.product_name || '미분류';
      const managerName = r.sales_manager_name || '사무실';
      const row = map.get(product) || { product_name: product };
      row[`${managerName}__qty`] = Number(r.sales_qty || 0);
      row[`${managerName}__sales`] = Number(r.sales_amount || 0);
      map.set(product, row);
    }
    for (const r of paymentRows) {
      const product = r.product_name || '미분류';
      const managerName = r.sales_manager_name || '사무실';
      const row = map.get(product) || { product_name: product };
      row[`${managerName}__pay`] = Number(r.payment_amount || 0);
      map.set(product, row);
    }
    const rows = Array.from(map.values()).map((row) => {
      for (const managerName of managers) {
        const sales = Number(row[`${managerName}__sales`] || 0);
        const pay = Number(row[`${managerName}__pay`] || 0);
        row[`${managerName}__qty`] = Number(row[`${managerName}__qty`] || 0);
        row[`${managerName}__sales`] = sales;
        row[`${managerName}__pay`] = pay;
        row[`${managerName}__recv`] = sales - pay;
      }
      return row;
    });
    send(res, { date_from: dateFrom, date_to: dateTo, managers, rows });
  }));

  router.get('/reports/customer-sales', requirePermission('orders.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
    const dateTo = clean(req.query.date_to) || todayKst();
    const [rows] = await pool.execute(`SELECT c.name AS customer_name, COALESCE(cs.site_name, '') AS site_name, COALESCE(c.sales_manager_name, sm.name, '미지정') AS sales_manager_name,
             COUNT(DISTINCT so.id) AS order_count, COALESCE(SUM(oi.quantity),0) AS sales_qty, COALESCE(SUM(oi.amount),0) AS sales_amount
        FROM sales_orders so JOIN customers c ON c.id=so.customer_id LEFT JOIN customer_sites cs ON cs.id=so.customer_site_id LEFT JOIN sales_managers sm ON sm.id=c.sales_manager_id LEFT JOIN order_items oi ON oi.order_id=so.id
       WHERE so.deleted_at IS NULL AND so.order_date BETWEEN ? AND ? GROUP BY c.id, cs.id, sales_manager_name ORDER BY c.name, cs.site_name`, [dateFrom, dateTo]);
    send(res, { date_from: dateFrom, date_to: dateTo, rows });
  }));

  router.get('/reports/customer-payments', requirePermission('payments.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || oneMonthAgoKst();
    const dateTo = clean(req.query.date_to) || todayKst();
    const manager = clean(req.query.sales_manager_name);
    const params = [dateFrom, dateTo];
    let whereManager = '';
    if (manager) { whereManager = ' AND COALESCE(p.sales_manager_name, c.sales_manager_name, sm.name, \'미지정\') = ?'; params.push(manager); }
    const [rows] = await pool.execute(`SELECT c.name AS customer_name, COALESCE(cs.site_name, '') AS site_name, COALESCE(p.sales_manager_name, c.sales_manager_name, sm.name, '미지정') AS sales_manager_name,
             COUNT(*) AS payment_count, COALESCE(SUM(p.amount),0) AS payment_amount, GROUP_CONCAT(DISTINCT p.method ORDER BY p.method SEPARATOR ', ') AS methods
        FROM payments p JOIN customers c ON c.id=p.customer_id LEFT JOIN customer_sites cs ON cs.id=p.customer_site_id LEFT JOIN sales_managers sm ON sm.id=c.sales_manager_id
       WHERE p.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ? ${whereManager} GROUP BY c.id, cs.id, sales_manager_name ORDER BY sales_manager_name, c.name, cs.site_name`, params);
    send(res, { date_from: dateFrom, date_to: dateTo, rows });
  }));

  router.get('/reports/monthly-sales-matrix', requirePermission('orders.read'), asyncRoute(async (req, res) => {
    const pool = await getPool();
    await ensureSalesManagersRuntime(pool);
    const dateFrom = clean(req.query.date_from) || `${todayKst().slice(0, 7)}-01`;
    const dateTo = clean(req.query.date_to) || todayKst();
    const [salesRows] = await pool.execute(`SELECT COALESCE(c.sales_manager_name, sm.name, '미지정') AS sales_manager_name, oi.item_name AS product_name,
             COALESCE(SUM(oi.quantity),0) AS sales_qty, COALESCE(SUM(oi.amount),0) AS sales_amount
        FROM sales_orders so JOIN customers c ON c.id=so.customer_id LEFT JOIN sales_managers sm ON sm.id=c.sales_manager_id JOIN order_items oi ON oi.order_id=so.id
       WHERE so.deleted_at IS NULL AND so.order_date BETWEEN ? AND ? GROUP BY sales_manager_name, oi.item_name ORDER BY oi.item_name, sales_manager_name`, [dateFrom, dateTo]);
    const [managerTotals] = await pool.execute(`SELECT COALESCE(c.sales_manager_name, sm.name, '미지정') AS sales_manager_name,
             COALESCE(SUM(p.amount),0) AS payment_amount
        FROM payments p JOIN customers c ON c.id=p.customer_id LEFT JOIN sales_managers sm ON sm.id=c.sales_manager_id
       WHERE p.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ? GROUP BY sales_manager_name`, [dateFrom, dateTo]);
    const [receivableTotals] = await pool.query(`SELECT COALESCE(c.sales_manager_name, sm.name, '미지정') AS sales_manager_name, COALESCE(SUM(rt.amount),0) AS receivable_amount FROM receivable_transactions rt JOIN customers c ON c.id=rt.customer_id LEFT JOIN sales_managers sm ON sm.id=c.sales_manager_id GROUP BY sales_manager_name`);
    send(res, { date_from: dateFrom, date_to: dateTo, sales: salesRows, payments: managerTotals, receivables: receivableTotals });
  }));

  return router;
}

module.exports = {
  createFinalEnhancementsRouter
};
