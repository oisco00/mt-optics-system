-- v1.4 발송구분별 미수금 조회 뷰. schema.sql 실행 후 또는 앱 자동마이그레이션 후 생성됩니다.
CREATE OR REPLACE VIEW v_customer_receivable_by_delivery_type AS
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
GROUP BY c.id, c.code, c.name, cs.id, cs.site_name, COALESCE(rt.delivery_type, '택배');

CREATE OR REPLACE VIEW v_customer_site_receivable_balance AS
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
GROUP BY c.id, c.code, c.name, cs.id, cs.site_name, cs.region, cs.default_delivery_type, cs.opening_receivable;
