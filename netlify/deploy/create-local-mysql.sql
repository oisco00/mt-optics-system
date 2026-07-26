CREATE DATABASE IF NOT EXISTS mt_optics
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 아래 비밀번호는 실행 전에 반드시 새 값으로 변경하세요.
CREATE USER IF NOT EXISTS 'mtopt'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
ALTER USER 'mtopt'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON mt_optics.* TO 'mtopt'@'localhost';
FLUSH PRIVILEGES;
