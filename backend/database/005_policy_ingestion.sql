-- Additive ingestion/revision bookkeeping. Apply using python -m app.modules.storage init.
CREATE TABLE policy_ingestion_runs (
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    status ENUM('running', 'prepared', 'needs_review', 'failed') NOT NULL,
    source_count INT UNSIGNED NOT NULL,
    processing_json JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE policy_revision_details (
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    title VARCHAR(1000) NOT NULL,
    organization VARCHAR(1000) NOT NULL,
    category VARCHAR(32) NULL,
    draft_json JSON NOT NULL,
    processing_json JSON NOT NULL,
    FOREIGN KEY (revision_id) REFERENCES condition_documents(revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE policy_ingestion_items (
    item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    policy_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    status ENUM('pending', 'needs_review', 'failed') NOT NULL,
    source_json JSON NOT NULL,
    result_json JSON NULL,
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_ingestion_run_policy (run_id, policy_key),
    FOREIGN KEY (run_id) REFERENCES policy_ingestion_runs(run_id),
    FOREIGN KEY (revision_id) REFERENCES condition_documents(revision_id),
    CONSTRAINT chk_ingestion_revision CHECK (
        (status = 'needs_review' AND revision_id IS NOT NULL AND result_json IS NOT NULL)
        OR (status IN ('pending', 'failed') AND revision_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
