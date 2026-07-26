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


  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatBusinessNo(value) {
    const raw = clean(value);
    if (!raw) return null;
    const digits = onlyDigits(raw);
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    return raw;
  }

  function formatPhoneNumber(value) {
    const raw = clean(value);
    if (!raw) return null;
    const digits = onlyDigits(raw);
    if (!digits) return raw;
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return raw;
  }

  function looksLikeIdentifierName(value) {
    const text = clean(value);
    if (!text) return true;
    const digits = onlyDigits(text);
    if (digits.length >= 8 && text.replace(/[0-9\-\s().]/g, '').length === 0) return true;
    if (/^[0-9\-\s]+$/.test(text)) return true;
    return false;
  }

  function displayCustomerName(row) {
    const candidates = [
      row?.customer_name,
      row?.name,
      row?.original_customer_name,
      row?.site_name && !['기본', '기타'].includes(String(row.site_name)) ? row.site_name : null,
      row?.code ? `거래처 ${row.code}` : null,
      row?.customer_code ? `거래처 ${row.customer_code}` : null,
      row?.id ? `거래처-${row.id}` : null,
      row?.customer_id ? `거래처-${row.customer_id}` : null
    ];
    for (const value of candidates) {
      const repaired = repairMojibake(value || '').trim();
      if (repaired && !looksLikeIdentifierName(repaired)) return repaired;
    }
    return clean(candidates.find(Boolean)) || '거래처명 미등록';
  }

  function decorateContactRow(row) {
    if (!row) return row;
    const phone = formatPhoneNumber(row.phone);
    const mobile = formatPhoneNumber(row.mobile);
    const businessNo = formatBusinessNo(row.business_no);
    return {
      ...row,
      phone,
      mobile,
      business_no: businessNo,
      phone_display: phone || '',
      mobile_display: mobile || '',
      business_no_display: businessNo || '',
      name: row.name ? repairMojibake(row.name) : row.name,
      customer_name: displayCustomerName(row),
      display_name: displayCustomerName(row)
    };
  }

  function decorateCustomer(row) {
    return decorateContactRow(row);
  }

  function decorateSite(row) {
    const decorated = decorateContactRow(row);
    return {
      ...decorated,
      site_name: repairMojibake(row.site_name || ''),
      original_customer_name: repairMojibake(row.original_customer_name || '')
    };
  }

  function decorateOrder(row) {
    return {
      ...row,
      customer_name: displayCustomerName(row),
      site_name: repairMojibake(row.site_name || '')
    };
  }

  function decoratePayment(row) {
    return {
      ...row,
      customer_name: displayCustomerName(row),
      site_name: repairMojibake(row.site_name || '')
    };
  }

  function decorateReceivable(row) {
    return {
      ...row,
      customer_name: displayCustomerName(row),
      site_name: repairMojibake(row.site_name || '')
    };
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
            (
              SELECT cs.original_customer_name
                FROM customer_sites cs
               WHERE cs.customer_id = c.id
                 AND cs.original_customer_name IS NOT NULL
                 AND cs.original_customer_name <> ''
               ORDER BY cs.id
               LIMIT 1
            ) AS original_customer_name,
            u.full_name AS sales_rep_name,
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

      send(res, rows.map(decorateSite));
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
            cs.site_name,
            cs.region,
            cs.original_customer_name,
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

      send(res, rows.map(decorateOrder));
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
        send(res, rows.map(decorateReceivable));
        return;
      }

      // One row per customer and dispatch type. A payment can therefore be
      // applied directly without redundant left-side checkboxes.
      const [rows] = await pool.execute(
        `SELECT
            customer_id,
            MAX(customer_name) AS customer_name,
            MAX(original_customer_name) AS original_customer_name,
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

      send(res, rows.map(decorateReceivable));
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
            cs.site_name,
            cs.region,
            cs.original_customer_name,
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
          return decoratePayment({
            ...row,
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
    '/date-bounds',
    requirePermission('dashboard.view'),
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const [[row]] = await pool.query(`SELECT
          DATE_FORMAT(COALESCE((SELECT MIN(order_date) FROM sales_orders WHERE deleted_at IS NULL), CURDATE()), '%Y-%m-%d') AS min_order_date,
          DATE_FORMAT(COALESCE((SELECT MIN(payment_date) FROM payments WHERE deleted_at IS NULL), CURDATE()), '%Y-%m-%d') AS min_payment_date,
          DATE_FORMAT(COALESCE((SELECT MIN(txn_date) FROM receivable_transactions), CURDATE()), '%Y-%m-%d') AS min_receivable_date,
          DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today_date`);
      send(res, {
        min_order_date: row.min_order_date,
        min_payment_date: row.min_payment_date,
        min_receivable_date: row.min_receivable_date,
        today_date: row.today_date
      });
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

        let contactFormatsUpdated = 0;
        for (const tableName of ['customers', 'customer_sites']) {
          const [rows] = await conn.query(
            `SELECT id, business_no, phone, mobile
               FROM ${tableName}
              LIMIT 50000`
          );
          for (const row of rows) {
            const updates = [];
            const values = [];
            const phone = formatPhoneNumber(row.phone);
            const mobile = formatPhoneNumber(row.mobile);
            const businessNo = formatBusinessNo(row.business_no);
            if (phone !== row.phone) { updates.push('phone = ?'); values.push(phone); }
            if (mobile !== row.mobile) { updates.push('mobile = ?'); values.push(mobile); }
            if (businessNo !== row.business_no) { updates.push('business_no = ?'); values.push(businessNo); }
            if (updates.length) {
              await conn.execute(
                `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = ?`,
                values.concat(row.id)
              );
              updated += 1;
              contactFormatsUpdated += 1;
            }
          }
        }

        details.push({
          table: 'customers/customer_sites',
          column: 'phone_business_format',
          scanned: 0,
          updated: contactFormatsUpdated
        });


        return { scanned, updated, details };
      });

      send(res, result);
    })
  );

  return router;
}

module.exports = {
  createFinalEnhancementsRouter
};
