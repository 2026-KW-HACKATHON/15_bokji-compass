-- Additive server collection state. Apply only through the explicit storage init command.
CREATE TABLE collection_state (
    state_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    payload JSON NOT NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DOUBLE NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE collection_records (
    policy_key VARCHAR(255) COLLATE utf8mb4_bin PRIMARY KEY,
    provider VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    external_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    url_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    listing_json JSON NULL,
    listing_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    snapshot_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    source_json JSON NULL,
    conditions_json JSON NULL,
    last_seen_at DOUBLE NOT NULL,
    last_checked_at DOUBLE NULL,
    next_check_at DOUBLE NOT NULL DEFAULT 0,
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    UNIQUE KEY uq_collection_record_identity (provider, external_id),
    INDEX idx_collection_url (provider, url_hash),
    INDEX idx_collection_recheck (provider, next_check_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE collection_snapshots (
    snapshot_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    policy_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    raw_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_json JSON NOT NULL,
    raw_json JSON NOT NULL,
    raw_path VARCHAR(255) NULL,
    previous_snapshot_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    changed_fields JSON NOT NULL,
    observed_at DOUBLE NOT NULL,
    INDEX idx_collection_snapshot_policy (policy_key, observed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE collection_jobs (
    job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    work_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    kind VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    policy_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    priority INT NOT NULL DEFAULT 20,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DOUBLE NOT NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DOUBLE NOT NULL DEFAULT 0,
    checkpoint JSON NULL,
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DOUBLE NOT NULL,
    updated_at DOUBLE NOT NULL,
    INDEX idx_collection_claim (status, next_attempt_at, priority),
    INDEX idx_collection_job_policy (policy_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE collection_usage (
    provider VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    day CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    calls INT NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE collection_candidates (
    candidate_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    url VARCHAR(2048) NOT NULL,
    candidate_json JSON NOT NULL,
    status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    possible_matches JSON NOT NULL,
    first_seen_at DOUBLE NOT NULL,
    last_seen_at DOUBLE NOT NULL,
    INDEX idx_collection_candidate_status (status, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
