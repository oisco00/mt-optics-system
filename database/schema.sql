-- MT옵틱스 주문·수금·생산·재고 통합 웹앱 스키마
-- 주의: 이 파일은 선택된 데이터베이스에서 여러 번 실행해도 안전하도록 CREATE TABLE IF NOT EXISTS 중심으로 구성했습니다.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(80) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  module VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NULL UNIQUE,
  phone VARCHAR(40) NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 공통 기준정보: 주문경로, 박싱구분, 배송방법, 제품분류, 색상, 소재 등 확장 가능한 코드 관리
CREATE TABLE IF NOT EXISTS code_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_code VARCHAR(80) NOT NULL UNIQUE,
  group_name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS code_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id BIGINT UNSIGNED NOT NULL,
  item_code VARCHAR(80) NOT NULL,
  item_name VARCHAR(120) NOT NULL,
  item_value VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  memo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_code_items_group_code (group_id, item_code),
  INDEX idx_code_items_group (group_id, sort_order),
  CONSTRAINT fk_code_items_group FOREIGN KEY (group_id) REFERENCES code_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 안경제품/자재 기준정보
CREATE TABLE IF NOT EXISTS materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  material_code VARCHAR(80) NOT NULL UNIQUE,
  material_name VARCHAR(150) NOT NULL,
  material_type VARCHAR(80) NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '개',
  default_purchase_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_stock INT NOT NULL DEFAULT 0,
  safety_stock INT NOT NULL DEFAULT 0,
  supplier_name VARCHAR(150) NULL,
  location VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  memo TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_materials_name (material_name),
  INDEX idx_materials_type (material_type),
  CONSTRAINT fk_materials_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_materials_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  business_no VARCHAR(40) NULL,
  owner_name VARCHAR(80) NULL,
  phone VARCHAR(50) NULL,
  mobile VARCHAR(50) NULL,
  address VARCHAR(255) NULL,
  postal_code VARCHAR(20) NULL,
  road_address VARCHAR(255) NULL,
  jibun_address VARCHAR(255) NULL,
  detail_address VARCHAR(255) NULL,
  address_type VARCHAR(20) NULL,
  region VARCHAR(80) NULL,
  sales_rep_id BIGINT UNSIGNED NULL,
  payment_terms VARCHAR(80) NULL,
  opening_receivable DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  memo TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name),
  INDEX idx_customers_status (status),
  INDEX idx_customers_sales_rep (sales_rep_id),
  CONSTRAINT fk_customers_sales_rep FOREIGN KEY (sales_rep_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_customers_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 거래처 지역/지점/납품처. 같은 거래처명이 여러 지역에 있는 경우 고객 1건 + 납품처 여러 건으로 관리합니다.
CREATE TABLE IF NOT EXISTS customer_sites (
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
  postal_code VARCHAR(20) NULL,
  road_address VARCHAR(255) NULL,
  jibun_address VARCHAR(255) NULL,
  detail_address VARCHAR(255) NULL,
  address_type VARCHAR(20) NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  spec VARCHAR(150) NULL,
  category VARCHAR(80) NULL,
  product_type VARCHAR(80) NULL,
  brand VARCHAR(120) NULL,
  model_no VARCHAR(120) NULL,
  color_code VARCHAR(80) NULL,
  color_name VARCHAR(120) NULL,
  size_eye INT NULL,
  bridge_size INT NULL,
  temple_length INT NULL,
  lens_width DECIMAL(8,2) NULL,
  frame_width DECIMAL(8,2) NULL,
  frame_material VARCHAR(120) NULL,
  lens_material VARCHAR(120) NULL,
  gender VARCHAR(40) NULL,
  origin VARCHAR(80) NULL,
  barcode VARCHAR(120) NULL,
  material_id BIGINT UNSIGNED NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '개',
  default_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_stock INT NOT NULL DEFAULT 0,
  safety_stock INT NOT NULL DEFAULT 300,
  production_lot_size INT NOT NULL DEFAULT 300,
  popularity_grade VARCHAR(10) NOT NULL DEFAULT 'C',
  location VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  memo TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_name (name),
  INDEX idx_products_category (category),
  INDEX idx_products_brand_model (brand, model_no),
  INDEX idx_products_status (status),
  INDEX idx_products_stock (current_stock, safety_stock),
  CONSTRAINT fk_products_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS product_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  qty_per DECIMAL(12,4) NOT NULL DEFAULT 1,
  loss_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  memo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_component (product_id, material_id),
  INDEX idx_product_components_product (product_id),
  INDEX idx_product_components_material (material_id),
  CONSTRAINT fk_product_components_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_components_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  order_date DATE NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_site_id BIGINT UNSIGNED NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'phone',
  delivery_type VARCHAR(40) NOT NULL DEFAULT '택배',
  delivery_group VARCHAR(40) NOT NULL DEFAULT '기타',
  delivery_method VARCHAR(40) NOT NULL DEFAULT '택배',
  status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  receivable_posted TINYINT(1) NOT NULL DEFAULT 0,
  memo TEXT NULL,
  ordered_by BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  delete_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sales_orders_customer (customer_id),
  INDEX idx_sales_orders_site (customer_site_id),
  INDEX idx_sales_orders_delivery_type (delivery_type),
  INDEX idx_sales_orders_status (status),
  INDEX idx_sales_orders_date (order_date),
  CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_sales_orders_customer_site FOREIGN KEY (customer_site_id) REFERENCES customer_sites(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_ordered_by FOREIGN KEY (ordered_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(150) NOT NULL,
  spec VARCHAR(150) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipped_qty INT NOT NULL DEFAULT 0,
  memo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_site_id BIGINT UNSIGNED NULL,
  delivery_type VARCHAR(40) NOT NULL DEFAULT '택배',
  delivery_group VARCHAR(40) NOT NULL DEFAULT '기타',
  delivery_method VARCHAR(40) NOT NULL DEFAULT '택배',
  carrier VARCHAR(80) NULL,
  invoice_no VARCHAR(100) NULL,
  box_no VARCHAR(80) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'shipped',
  shipped_at DATETIME NULL,
  delivered_at DATETIME NULL,
  receiver_name VARCHAR(80) NULL,
  confirmation_note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shipments_order (order_id),
  INDEX idx_shipments_site (customer_site_id),
  INDEX idx_shipments_delivery_type (delivery_type),
  INDEX idx_shipments_status (status),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  CONSTRAINT fk_shipments_customer_site FOREIGN KEY (customer_site_id) REFERENCES customer_sites(id) ON DELETE SET NULL,
  CONSTRAINT fk_shipments_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_no VARCHAR(40) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_site_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  delivery_type VARCHAR(40) NOT NULL DEFAULT '택배',
  payment_date DATE NOT NULL,
  method VARCHAR(40) NOT NULL DEFAULT 'card',
  amount DECIMAL(14,2) NOT NULL,
  card_company VARCHAR(80) NULL,
  approval_no VARCHAR(100) NULL,
  bank_name VARCHAR(80) NULL,
  collector_user_id BIGINT UNSIGNED NULL,
  memo TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  deleted_at DATETIME NULL,
  deleted_by BIGINT UNSIGNED NULL,
  delete_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_customer (customer_id),
  INDEX idx_payments_site (customer_site_id),
  INDEX idx_payments_delivery_type (delivery_type),
  INDEX idx_payments_date (payment_date),
  INDEX idx_payments_method (method),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_payments_customer_site FOREIGN KEY (customer_site_id) REFERENCES customer_sites(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_collector FOREIGN KEY (collector_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receivable_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_site_id BIGINT UNSIGNED NULL,
  delivery_type VARCHAR(40) NOT NULL DEFAULT '택배',
  txn_date DATE NOT NULL,
  txn_type VARCHAR(40) NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL,
  balance_after DECIMAL(14,2) NULL,
  memo VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_receivable_customer_date (customer_id, txn_date),
  INDEX idx_receivable_site_date (customer_site_id, txn_date),
  INDEX idx_receivable_delivery_type (delivery_type),
  INDEX idx_receivable_type (txn_type),
  CONSTRAINT fk_receivable_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_receivable_customer_site FOREIGN KEY (customer_site_id) REFERENCES customer_sites(id) ON DELETE SET NULL,
  CONSTRAINT fk_receivable_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_receivable_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_receivable_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_no VARCHAR(40) NOT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL,
  planned_qty INT NOT NULL,
  received_qty INT NOT NULL DEFAULT 0,
  safety_stock_at_plan INT NOT NULL DEFAULT 0,
  current_stock_at_plan INT NOT NULL DEFAULT 0,
  popularity_grade VARCHAR(10) NOT NULL DEFAULT 'C',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(40) NOT NULL DEFAULT 'planned',
  due_date DATE NULL,
  decision_reason VARCHAR(255) NULL,
  memo TEXT NULL,
  ordered_by BIGINT UNSIGNED NULL,
  approved_by BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_production_product (product_id),
  INDEX idx_production_status (status),
  INDEX idx_production_due (due_date),
  CONSTRAINT fk_production_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_production_ordered_by FOREIGN KEY (ordered_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_production_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty_received INT NOT NULL,
  received_at DATETIME NOT NULL,
  received_by BIGINT UNSIGNED NULL,
  memo VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_receipts_order (production_order_id),
  CONSTRAINT fk_receipts_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
  CONSTRAINT fk_receipts_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_receipts_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  txn_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  txn_type VARCHAR(40) NOT NULL,
  qty_change INT NOT NULL,
  stock_after INT NOT NULL,
  ref_table VARCHAR(60) NULL,
  ref_id BIGINT UNSIGNED NULL,
  memo VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_product_date (product_id, txn_date),
  INDEX idx_inventory_type (txn_type),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_inventory_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS import_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(80) NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'excel',
  status VARCHAR(40) NOT NULL DEFAULT 'completed',
  total_rows INT NOT NULL DEFAULT 0,
  inserted_rows INT NOT NULL DEFAULT 0,
  updated_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  summary JSON NULL,
  imported_by BIGINT UNSIGNED NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_batches_user FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_errors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  import_batch_id BIGINT UNSIGNED NOT NULL,
  row_no INT NULL,
  sheet_name VARCHAR(120) NULL,
  message VARCHAR(500) NOT NULL,
  row_data JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_import_errors_batch (import_batch_id),
  CONSTRAINT fk_import_errors_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_row_hashes (
  row_hash CHAR(64) NOT NULL PRIMARY KEY,
  import_batch_id BIGINT UNSIGNED NOT NULL,
  target_table VARCHAR(80) NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_import_row_hashes_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(80) NOT NULL,
  record_id VARCHAR(80) NOT NULL,
  action VARCHAR(30) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  changed_by BIGINT UNSIGNED NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  change_reason VARCHAR(500) NULL,
  INDEX idx_audit_table_record (table_name, record_id),
  INDEX idx_audit_changed_at (changed_at),
  CONSTRAINT fk_audit_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value JSON NULL,
  memo VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW v_customer_receivable_balance AS
SELECT
  c.id AS customer_id,
  c.code,
  c.name,
  c.opening_receivable + COALESCE(SUM(rt.amount), 0) AS receivable_balance
FROM customers c
LEFT JOIN receivable_transactions rt ON rt.customer_id = c.id
GROUP BY c.id, c.code, c.name, c.opening_receivable;

INSERT IGNORE INTO schema_migrations(version) VALUES ('2026-07-08-initial-mt-optics');

INSERT IGNORE INTO schema_migrations(version) VALUES ('2026-07-08-v1.3-master-import');
INSERT IGNORE INTO schema_migrations(version) VALUES ('2026-07-22-v1.4-aws-delivery-type-sites');
INSERT IGNORE INTO schema_migrations(version) VALUES ('2026-07-24-v1.5-security-mobile-address-audit');
