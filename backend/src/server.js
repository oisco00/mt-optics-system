const path = require('path');
const express = require('express');
const { app, initialize } = require('./app');

const PORT = Number(process.env.PORT || 3000);
const frontendPath = path.join(__dirname, '../../frontend');

app.use(express.static(frontendPath));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`MT옵틱스 웹앱 실행: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('서버 시작 실패:', error.message);
    console.error('MySQL 접속 정보와 .env 파일을 확인하세요.');
    process.exit(1);
  });
