-- AWS RDS MySQL 최초 1회 실행용
-- MySQL Workbench에서 admin 계정으로 접속한 뒤 실행하세요.
-- <MTOPT_PASSWORD> 부분을 실제 mtopt 계정 비밀번호로 바꾼 후 실행해야 합니다.

CREATE DATABASE IF NOT EXISTS mt_optics
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'mtopt'@'%'
  IDENTIFIED BY '';

ALTER USER 'mtopt'@'%'
  IDENTIFIED BY '4321qwer!';

GRANT ALL PRIVILEGES ON mt_optics.* TO 'mtopt'@'%';
FLUSH PRIVILEGES;

SELECT 'AWS RDS mt_optics database and mtopt user are ready.' AS result;
