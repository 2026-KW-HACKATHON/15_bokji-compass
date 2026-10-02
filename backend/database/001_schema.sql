-- 개발 전용 초안. MySQL 8.4 / UTF-8. 기존 DB 삭제 및 변경 없음.
-- 테이블이 없는 bokji_compass_dev DB에서 최초 1회만 실행합니다.
-- setup-mysql.ps1이 미리 만든 빈 개발 DB도 사용할 수 있습니다.
CREATE DATABASE IF NOT EXISTS bokji_compass_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bokji_compass_dev;

CREATE TABLE regions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  FOREIGN KEY (parent_id) REFERENCES regions(id)
) ENGINE=InnoDB;

-- 인증 공급자 및 비밀번호 로그인은 미구현. 로그인 가능한 계정이 아닙니다.
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  display_name VARCHAR(100) NOT NULL,
  gender VARCHAR(16) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_profiles (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  birth_date DATE NULL,
  birth_region_id BIGINT UNSIGNED NULL,
  residence_region_id BIGINT UNSIGNED NULL,
  residence_basis ENUM('unknown','registered','actual') NOT NULL DEFAULT 'unknown',
  residence_since DATE NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (birth_region_id) REFERENCES regions(id),
  FOREIGN KEY (residence_region_id) REFERENCES regions(id),
  CONSTRAINT chk_residence CHECK (residence_region_id IS NOT NULL OR (residence_basis = 'unknown' AND residence_since IS NULL))
) ENGINE=InnoDB;

CREATE TABLE policies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  organization VARCHAR(255) NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  source_text TEXT NOT NULL,
  application_start DATE NULL,
  application_end DATE NULL,
  review_status ENUM('draft','reviewed','published') NOT NULL DEFAULT 'draft',
  is_synthetic BOOLEAN NOT NULL DEFAULT TRUE,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_policy_dates CHECK (application_start IS NULL OR application_end IS NULL OR application_start <= application_end),
  INDEX idx_policy_publication (review_status, application_end)
) ENGINE=InnoDB;

-- 조건 원문 저장용. 자동 판정 가능한 정규화 규칙은 후속 구현합니다.
CREATE TABLE policy_requirements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  policy_id BIGINT UNSIGNED NOT NULL,
  condition_type ENUM('age','birth_region','residence_region','gender','other') NOT NULL,
  information_state ENUM('specified','unrestricted','unknown','not_stated') NOT NULL DEFAULT 'unknown',
  evidence_text TEXT NOT NULL,
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
) ENGINE=InnoDB;
