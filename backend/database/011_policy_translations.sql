-- Public display translations; initialized explicitly, never from an HTTP request.
CREATE TABLE policy_translations (
    cache_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    policy_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    language CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    prompt_version VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    translation_json JSON NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_policy_translation_revision (policy_id, revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atomic UTC-day cache-miss budget; failed generation attempts remain charged.
CREATE TABLE policy_translation_usage (
    day CHAR(10) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    calls INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
