-- AWS RDS / MT옵틱스 테이블 생성 확인용
SELECT VERSION() AS mysql_version, DATABASE() AS current_database;
SHOW DATABASES LIKE 'mt_optics';
USE mt_optics;
SHOW TABLES;
SELECT COUNT(*) AS users_count FROM users;
SELECT username, full_name, email, is_active FROM users ORDER BY id;
SELECT COUNT(*) AS customer_count FROM customers;
SELECT COUNT(*) AS customer_site_count FROM customer_sites;
SELECT delivery_type, COUNT(*) AS txn_count, SUM(amount) AS amount_sum
FROM receivable_transactions
GROUP BY delivery_type;
