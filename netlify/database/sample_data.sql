-- 선택 실행용 예시자료입니다. 실제 운영 DB에는 필요한 경우에만 실행하세요.
INSERT INTO customers(code, name, business_no, phone, address, opening_receivable, status)
VALUES ('0000000461', '1,대지안경원(청주우암)', '301-12-45596', '043-255-8797', '청주 우암동', 193000, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), business_no = VALUES(business_no), phone = VALUES(phone), opening_receivable = VALUES(opening_receivable);

INSERT INTO products(sku, name, category, default_price, current_stock, safety_stock, production_lot_size, popularity_grade, status)
VALUES
('PABIANNE-USONG', '파비안느(우송)', '안경테', 9000, 180, 300, 300, 'C', 'active'),
('BETA-BLUE-ANGEL', '베타블루엔젤(우송)', '안경테', 12000, 80, 300, 300, 'C', 'active'),
('KNIT-USONG', '니트(우송)', '안경테', 6000, 420, 500, 500, 'B', 'active'),
('KNIT', '니트', '안경테', 6000, 900, 1000, 1000, 'A', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), default_price = VALUES(default_price), current_stock = VALUES(current_stock), safety_stock = VALUES(safety_stock);
