-- Canonical v2 storage contract, MySQL 8.0.16+.
-- Select an isolated database explicitly before applying. No USE/CREATE DATABASE/seed.
-- This additive schema does not migrate 001_schema.sql or install a repository adapter.
-- Deliberately no IF NOT EXISTS: an existing incompatible table must fail visibly.

CREATE TABLE condition_region_snapshots (
    version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    effective_date DATE NOT NULL,
    source_url VARCHAR(2048) NOT NULL,
    archive_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    csv_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    metadata_json JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE condition_regions (
    snapshot_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    code_system ENUM('ADMIN', 'LEGAL') NOT NULL,
    code CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_code CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NULL,
    source_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (snapshot_version, code_system, code),
    INDEX idx_condition_regions_name (name),
    CONSTRAINT fk_condition_region_snapshot FOREIGN KEY (snapshot_version)
        REFERENCES condition_region_snapshots(version),
    CONSTRAINT chk_condition_region_code CHECK (code REGEXP '^[0-9]{10}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE condition_documents (
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    policy_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    schema_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    region_snapshot_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_json JSON NOT NULL,
    extraction_json JSON NOT NULL,
    canonical_json JSON NOT NULL,
    review_status ENUM('draft', 'reviewed', 'published', 'rejected') NOT NULL DEFAULT 'draft',
    matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_condition_document_source (policy_key, source_hash),
    CONSTRAINT fk_condition_document_region FOREIGN KEY (region_snapshot_version)
        REFERENCES condition_region_snapshots(version),
    CONSTRAINT chk_condition_publication CHECK (
        matching_enabled = FALSE OR review_status = 'published'
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE condition_entries (
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    condition_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    field_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_field_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    subject VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state_code TINYINT UNSIGNED NOT NULL,
    operator ENUM('EQ', 'GT', 'GTE', 'LT', 'LTE', 'RANGE') NULL,
    value_json JSON NULL,
    unit VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reference_basis TEXT NULL,
    role ENUM('eligibility', 'exclusion', 'priority', 'application', 'reference') NOT NULL,
    group_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    source_field VARCHAR(80) NOT NULL,
    evidence_quote TEXT NULL,
    unknown_reason VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    review_note TEXT NOT NULL,
    PRIMARY KEY (revision_id, condition_id),
    INDEX idx_condition_field_state (field_key, state_code, subject),
    CONSTRAINT fk_condition_entry_document FOREIGN KEY (revision_id)
        REFERENCES condition_documents(revision_id),
    CONSTRAINT chk_condition_entry_state CHECK (state_code IN (0, 1, 9)),
    CONSTRAINT chk_condition_entry_value CHECK (
        (state_code = 1 AND operator IS NOT NULL AND value_json IS NOT NULL
            AND JSON_TYPE(value_json) = 'OBJECT' AND unknown_reason IS NULL)
        OR (state_code = 0 AND operator IS NULL AND value_json IS NULL
            AND unknown_reason IS NULL)
        OR (state_code = 9 AND operator IS NULL AND value_json IS NULL
            AND unknown_reason IS NOT NULL)
    ),
    CONSTRAINT chk_condition_entry_evidence CHECK (
        (evidence_quote IS NOT NULL AND CHAR_LENGTH(evidence_quote) > 0)
        OR (state_code = 9 AND unknown_reason = 'NOT_STATED')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
