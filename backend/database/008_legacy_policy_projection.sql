-- Compatibility projection for the original policies/policy_requirements read model.
-- Apply through python -m app.modules.storage init; existing tables are preserved.
CREATE TABLE IF NOT EXISTS policies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  source_key VARCHAR(255) COLLATE utf8mb4_bin NULL,
  title VARCHAR(255) NOT NULL,
  organization VARCHAR(255) NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  source_text TEXT NOT NULL,
  application_start DATE NULL,
  application_end DATE NULL,
  review_status ENUM('draft','reviewed','published') NOT NULL DEFAULT 'draft',
  is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_policy_dates CHECK (application_start IS NULL OR application_end IS NULL OR application_start <= application_end),
  INDEX idx_policy_publication (review_status, application_end),
  UNIQUE KEY uq_policies_source_key (source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS policy_requirements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  policy_id BIGINT UNSIGNED NOT NULL,
  condition_type ENUM('age','birth_region','residence_region','gender','other') NOT NULL,
  information_state ENUM('specified','unrestricted','unknown','not_stated') NOT NULL DEFAULT 'unknown',
  evidence_text TEXT NOT NULL,
  FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;