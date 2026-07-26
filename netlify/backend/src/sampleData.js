const { getPool, initDb } = require('./db');

async function upsert(pool, sql, params) {
  await pool.execute(sql, params);
}

async function seed() {
  await initDb();
  const pool = await getPool();

  await upsert(pool,
    `INSERT INTO customers(code, name, business_no, phone, address, opening_receivable, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE name = VALUES(name), business_no = VALUES(business_no), phone = VALUES(phone), address = VALUES(address)`,
    ['0000000461', '1,대지안경원(청주우암)', '301-12-45596', '043-255-8797', '청주 우암동', 193000]
  );
  await upsert(pool,
    `INSERT INTO customers(code, name, phone, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone)`,
    ['SAMPLE-1001', '1,1001안경(울산꽃바위)', '']
  );

  const products = [
    ['PABIANNE-USONG', '파비안느(우송)', null, '안경테', 9000, 180, 300, 300, 'C'],
    ['BETA-BLUE-ANGEL', '베타블루엔젤(우송)', null, '안경테', 12000, 80, 300, 300, 'C'],
    ['KNIT-USONG', '니트(우송)', null, '안경테', 6000, 420, 500, 500, 'B'],
    ['KNIT', '니트', null, '안경테', 6000, 900, 1000, 1000, 'A']
  ];
  for (const p of products) {
    await upsert(pool,
      `INSERT INTO products(sku, name, spec, category, default_price, current_stock, safety_stock, production_lot_size, popularity_grade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), default_price = VALUES(default_price), safety_stock = VALUES(safety_stock), production_lot_size = VALUES(production_lot_size), popularity_grade = VALUES(popularity_grade)`,
      p
    );
  }

  console.log('예시자료 입력 완료');
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
