const path = require('path');
const express = require('express');
const { app, initialize } = require('./app');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
const frontendPath = path.join(__dirname, '../../frontend');

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function securityWarnings() {
  const warnings = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('change-this')) {
    warnings.push('JWT_SECRET를 32자 이상의 새로운 무작위 문자열로 변경하세요.');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin1234!' || process.env.ADMIN_PASSWORD.length < 10) {
    warnings.push('ADMIN_PASSWORD를 10자 이상의 새로운 비밀번호로 변경하세요.');
  }
  if (!process.env.DB_PASSWORD) warnings.push('DB_PASSWORD가 비어 있습니다.');
  if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*')) {
    warnings.push('도메인 연결 후 CORS_ORIGIN을 https://order.mtoptics.net처럼 제한하세요.');
  }
  return warnings;
}

app.use(express.static(frontendPath, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const warnings = securityWarnings();
if (warnings.length) {
  warnings.forEach((warning) => console.warn(`[보안 확인] ${warning}`));
  if (envBool('SECURITY_STRICT_MODE', false)) {
    console.error('SECURITY_STRICT_MODE=true 상태에서 보안 설정이 충족되지 않아 서버를 시작하지 않습니다.');
    process.exit(1);
  }
}

initialize()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`MT옵틱스 웹앱 실행: http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('서버 시작 실패:', error.message);
    console.error('MySQL 접속 정보와 .env 파일을 확인하세요.');
    process.exit(1);
  });
