-- MT옵틱스 v1.3 첨부 엑셀자료 사전 등록 SQL
-- 첨부된 거래처원장/판매명세서/수금명세서에서 추출한 거래처, 제품, 매출원장 데이터를 등록합니다.
-- 여러 번 실행해도 주문번호/SKU/거래처명 기준으로 중복을 최소화합니다.
START TRANSACTION;

-- 1) 거래처 등록/보완

INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT '0000000461', '대지안경원(청주우암)', '301-12-45596', '043-255-8797', 193000, 'active', '엑셀 거래처원장 이월잔액 반영'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '대지안경원(청주우암)' OR ('0000000461' IS NOT NULL AND code = '0000000461')
);
UPDATE customers
   SET code = COALESCE(code, '0000000461'),
       business_no = COALESCE(business_no, '301-12-45596'),
       phone = COALESCE(phone, '043-255-8797'),
       opening_receivable = CASE WHEN 193000 <> 0 THEN 193000 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 거래처원장 이월잔액 반영', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 거래처원장 이월잔액 반영') END
 WHERE name = '대지안경원(청주우암)' OR ('0000000461' IS NOT NULL AND code = '0000000461');


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경나라(김제)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경나라(김제)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경나라(김제)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경매니져(구미도량점)개인거래', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경매니져(구미도량점)개인거래' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경매니져(구미도량점)개인거래' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '아쿠아이즈(계룡점)유성점', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '아쿠아이즈(계룡점)유성점' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '아쿠아이즈(계룡점)유성점' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '보이네안경원(광양)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '보이네안경원(광양)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '보이네안경원(광양)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '아쿠아이즈안경(지족동)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '아쿠아이즈안경(지족동)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '아쿠아이즈안경(지족동)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경매니져(청주금천점)개인', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경매니져(청주금천점)개인' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경매니져(청주금천점)개인' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경아울렛(대전중촌점)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경아울렛(대전중촌점)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경아울렛(대전중촌점)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '우리안경(화정동)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '우리안경(화정동)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '우리안경(화정동)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경매니져(구미봉곡점)개인', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경매니져(구미봉곡점)개인' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경매니져(구미봉곡점)개인' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '보건안경(나주)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '보건안경(나주)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '보건안경(나주)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '광주안경(두암)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '광주안경(두암)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '광주안경(두암)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '바른안경(수완동)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '바른안경(수완동)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '바른안경(수완동)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경나라(순천연향점)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경나라(순천연향점)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경나라(순천연향점)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '크리스탈안경(진주)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '크리스탈안경(진주)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '크리스탈안경(진주)' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '안경매니져(대전도안)청구', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '안경매니져(대전도안)청구' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '안경매니져(대전도안)청구' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '시선안경(익산송학)0', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '시선안경(익산송학)0' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '시선안경(익산송학)0' OR (NULL IS NOT NULL AND code = NULL);


INSERT INTO customers(code, name, business_no, phone, opening_receivable, status, memo)
SELECT NULL, '아이뱅크(청주성안점)', NULL, NULL, 0, 'active', '엑셀 기간별 판매명세서에서 등록'
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE name = '아이뱅크(청주성안점)' OR (NULL IS NOT NULL AND code = NULL)
);
UPDATE customers
   SET code = COALESCE(code, NULL),
       business_no = COALESCE(business_no, NULL),
       phone = COALESCE(phone, NULL),
       opening_receivable = CASE WHEN 0 <> 0 THEN 0 ELSE opening_receivable END,
       memo = CASE WHEN COALESCE(memo, '') LIKE CONCAT('%', '엑셀 기간별 판매명세서에서 등록', '%') THEN memo ELSE CONCAT(COALESCE(memo, ''), CASE WHEN COALESCE(memo, '') = '' THEN '' ELSE '\n' END, '엑셀 기간별 판매명세서에서 등록') END
 WHERE name = '아이뱅크(청주성안점)' OR (NULL IS NOT NULL AND code = NULL);


-- 2) 제품 등록/보완

INSERT INTO products(sku, name, spec, category, product_type, unit, default_price, safety_stock, production_lot_size, popularity_grade, status, memo)
SELECT 'IMP-DED82CCA5B', '니트(우송)', NULL, '안경제품', 'FINISHED', '개', 6000, 300, 300, 'C', 'active', '엑셀 판매명세서에서 등록'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'IMP-DED82CCA5B');
UPDATE products
   SET default_price = CASE WHEN default_price = 0 THEN 6000 ELSE default_price END,
       category = COALESCE(category, '안경제품')
 WHERE sku = 'IMP-DED82CCA5B';


INSERT INTO products(sku, name, spec, category, product_type, unit, default_price, safety_stock, production_lot_size, popularity_grade, status, memo)
SELECT 'IMP-A35FBF62EC', '니트', NULL, '안경제품', 'FINISHED', '개', 6000, 300, 300, 'C', 'active', '엑셀 판매명세서에서 등록'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'IMP-A35FBF62EC');
UPDATE products
   SET default_price = CASE WHEN default_price = 0 THEN 6000 ELSE default_price END,
       category = COALESCE(category, '안경제품')
 WHERE sku = 'IMP-A35FBF62EC';


INSERT INTO products(sku, name, spec, category, product_type, unit, default_price, safety_stock, production_lot_size, popularity_grade, status, memo)
SELECT 'IMP-8245399D94', '파비안느(우송)', NULL, '안경제품', 'FINISHED', '개', 9000, 300, 300, 'C', 'active', '엑셀 거래처원장에서 등록'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'IMP-8245399D94');
UPDATE products
   SET default_price = CASE WHEN default_price = 0 THEN 9000 ELSE default_price END,
       category = COALESCE(category, '안경제품')
 WHERE sku = 'IMP-8245399D94';


INSERT INTO products(sku, name, spec, category, product_type, unit, default_price, safety_stock, production_lot_size, popularity_grade, status, memo)
SELECT 'IMP-718BFADA4A', '베타블루엔젤(우송)', NULL, '안경제품', 'FINISHED', '개', 12000, 300, 300, 'C', 'active', '엑셀 거래처원장에서 등록'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE sku = 'IMP-718BFADA4A');
UPDATE products
   SET default_price = CASE WHEN default_price = 0 THEN 12000 ELSE default_price END,
       category = COALESCE(category, '안경제품')
 WHERE sku = 'IMP-718BFADA4A';


-- 3) 매출주문/원장 등록

INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260610-C198B922', '2026-06-10',
       (SELECT id FROM customers WHERE name = '대지안경원(청주우암)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 54000, 0, 54000, 1, '거래처원장 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260610-C198B922');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '파비안느(우송)', NULL, 6, 9000, 54000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-8245399D94'
 WHERE so.order_no = 'IMP-20260610-C198B922'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '파비안느(우송)' AND oi.quantity = 6 AND oi.amount = 54000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260610-C198B922'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260610-FCE99422', '2026-06-10',
       (SELECT id FROM customers WHERE name = '대지안경원(청주우암)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 12000, 0, 12000, 1, '거래처원장 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260610-FCE99422');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '베타블루엔젤(우송)', NULL, 1, 12000, 12000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-718BFADA4A'
 WHERE so.order_no = 'IMP-20260610-FCE99422'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '베타블루엔젤(우송)' AND oi.quantity = 1 AND oi.amount = 12000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260610-FCE99422'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260601-23734EA1', '2026-06-01',
       (SELECT id FROM customers WHERE name = '안경나라(김제)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 90000, 0, 90000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260601-23734EA1');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 15, 6000, 90000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260601-23734EA1'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 15 AND oi.amount = 90000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260601-23734EA1'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260601-ADAF1135', '2026-06-01',
       (SELECT id FROM customers WHERE name = '안경매니져(구미도량점)개인거래' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 48000, 0, 48000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260601-ADAF1135');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 8, 6000, 48000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260601-ADAF1135'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 8 AND oi.amount = 48000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260601-ADAF1135'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260601-E97924B2', '2026-06-01',
       (SELECT id FROM customers WHERE name = '아쿠아이즈(계룡점)유성점' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 300000, 0, 300000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260601-E97924B2');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 50, 6000, 300000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260601-E97924B2'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 50 AND oi.amount = 300000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260601-E97924B2'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260601-4BCB7BA9', '2026-06-01',
       (SELECT id FROM customers WHERE name = '보이네안경원(광양)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 60000, 0, 60000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260601-4BCB7BA9');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 10, 6000, 60000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260601-4BCB7BA9'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 10 AND oi.amount = 60000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260601-4BCB7BA9'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260601-6D3623FF', '2026-06-01',
       (SELECT id FROM customers WHERE name = '아쿠아이즈안경(지족동)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 300000, 0, 300000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260601-6D3623FF');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 50, 6000, 300000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260601-6D3623FF'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 50 AND oi.amount = 300000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260601-6D3623FF'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260602-87327C25', '2026-06-02',
       (SELECT id FROM customers WHERE name = '안경매니져(청주금천점)개인' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 60000, 0, 60000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260602-87327C25');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 10, 6000, 60000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260602-87327C25'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 10 AND oi.amount = 60000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260602-87327C25'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260602-BD9D3066', '2026-06-02',
       (SELECT id FROM customers WHERE name = '안경아울렛(대전중촌점)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 78000, 0, 78000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260602-BD9D3066');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 13, 6000, 78000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260602-BD9D3066'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 13 AND oi.amount = 78000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260602-BD9D3066'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260602-651B7638', '2026-06-02',
       (SELECT id FROM customers WHERE name = '우리안경(화정동)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 60000, 0, 60000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260602-651B7638');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 10, 6000, 60000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260602-651B7638'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 10 AND oi.amount = 60000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260602-651B7638'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260604-3A0BCC1F', '2026-06-04',
       (SELECT id FROM customers WHERE name = '안경매니져(구미봉곡점)개인' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 72000, 0, 72000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260604-3A0BCC1F');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, 12, 6000, 72000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260604-3A0BCC1F'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = 12 AND oi.amount = 72000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260604-3A0BCC1F'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260609-090EAC9B', '2026-06-09',
       (SELECT id FROM customers WHERE name = '보건안경(나주)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 180000, 0, 180000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260609-090EAC9B');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, 30, 6000, 180000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260609-090EAC9B'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = 30 AND oi.amount = 180000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260609-090EAC9B'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260609-3CCC2683', '2026-06-09',
       (SELECT id FROM customers WHERE name = '광주안경(두암)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', -150000, 0, -150000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260609-3CCC2683');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, -25, 6000, -150000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260609-3CCC2683'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = -25 AND oi.amount = -150000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260609-3CCC2683'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260609-887DA84A', '2026-06-09',
       (SELECT id FROM customers WHERE name = '바른안경(수완동)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', -84000, 0, -84000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260609-887DA84A');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, -14, 6000, -84000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260609-887DA84A'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = -14 AND oi.amount = -84000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260609-887DA84A'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260610-D288C0BE', '2026-06-10',
       (SELECT id FROM customers WHERE name = '안경나라(순천연향점)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', -102000, 0, -102000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260610-D288C0BE');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, -17, 6000, -102000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260610-D288C0BE'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = -17 AND oi.amount = -102000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260610-D288C0BE'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260610-AB8EFCC2', '2026-06-10',
       (SELECT id FROM customers WHERE name = '보이네안경원(광양)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 60000, 0, 60000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260610-AB8EFCC2');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, 10, 6000, 60000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260610-AB8EFCC2'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = 10 AND oi.amount = 60000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260610-AB8EFCC2'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260611-76941369', '2026-06-11',
       (SELECT id FROM customers WHERE name = '크리스탈안경(진주)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 30000, 0, 30000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260611-76941369');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 5, 6000, 30000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260611-76941369'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 5 AND oi.amount = 30000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260611-76941369'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260615-E49C10A0', '2026-06-15',
       (SELECT id FROM customers WHERE name = '안경매니져(구미도량점)개인거래' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 60000, 0, 60000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260615-E49C10A0');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 10, 6000, 60000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260615-E49C10A0'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 10 AND oi.amount = 60000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260615-E49C10A0'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260615-E9DBDA14', '2026-06-15',
       (SELECT id FROM customers WHERE name = '안경매니져(대전도안)청구' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 480000, 0, 480000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260615-E9DBDA14');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 80, 6000, 480000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260615-E9DBDA14'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 80 AND oi.amount = 480000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260615-E9DBDA14'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260617-E0728232', '2026-06-17',
       (SELECT id FROM customers WHERE name = '시선안경(익산송학)0' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 144000, 0, 144000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260617-E0728232');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, 24, 6000, 144000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260617-E0728232'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = 24 AND oi.amount = 144000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260617-E0728232'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260618-66E6A9B0', '2026-06-18',
       (SELECT id FROM customers WHERE name = '안경아울렛(대전중촌점)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', -24000, 0, -24000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260618-66E6A9B0');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, -4, 6000, -24000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260618-66E6A9B0'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = -4 AND oi.amount = -24000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260618-66E6A9B0'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260619-08D5F5C6', '2026-06-19',
       (SELECT id FROM customers WHERE name = '아이뱅크(청주성안점)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 48000, 0, 48000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260619-08D5F5C6');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트', NULL, 8, 6000, 48000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-A35FBF62EC'
 WHERE so.order_no = 'IMP-20260619-08D5F5C6'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트' AND oi.quantity = 8 AND oi.amount = 48000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260619-08D5F5C6'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');


INSERT INTO sales_orders(order_no, order_date, customer_id, source, delivery_group, delivery_method, status, subtotal, vat_amount, total_amount, receivable_posted, memo)
SELECT 'IMP-20260622-A7327D33', '2026-06-22',
       (SELECT id FROM customers WHERE name = '안경나라(순천연향점)' LIMIT 1),
       'excel', '기타', '택배', 'delivered', 180000, 0, 180000, 1, '기간별 판매명세서 상세 엑셀 가져오기'
WHERE NOT EXISTS (SELECT 1 FROM sales_orders WHERE order_no = 'IMP-20260622-A7327D33');

INSERT INTO order_items(order_id, product_id, item_name, spec, quantity, unit_price, amount, memo)
SELECT so.id, p.id, '니트(우송)', NULL, 30, 6000, 180000, '첨부 엑셀자료 등록'
  FROM sales_orders so
  LEFT JOIN products p ON p.sku = 'IMP-DED82CCA5B'
 WHERE so.order_no = 'IMP-20260622-A7327D33'
   AND NOT EXISTS (
     SELECT 1 FROM order_items oi WHERE oi.order_id = so.id AND oi.item_name = '니트(우송)' AND oi.quantity = 30 AND oi.amount = 180000
   );

INSERT INTO receivable_transactions(customer_id, txn_date, txn_type, order_id, amount, memo)
SELECT so.customer_id, so.order_date, 'sales', so.id, so.total_amount, CONCAT('첨부 엑셀자료 매출 ', so.order_no)
  FROM sales_orders so
 WHERE so.order_no = 'IMP-20260622-A7327D33'
   AND NOT EXISTS (SELECT 1 FROM receivable_transactions rt WHERE rt.order_id = so.id AND rt.txn_type = 'sales');

COMMIT;