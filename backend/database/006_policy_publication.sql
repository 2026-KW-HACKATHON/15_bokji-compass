-- Explicit publication audit; source/draft JSON stays immutable.
CREATE TABLE policy_publication_events (
    event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    revision_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    previous_status VARCHAR(20) NOT NULL,
    review_status VARCHAR(20) NOT NULL,
    note VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_publication_revision (revision_id, created_at),
    FOREIGN KEY (revision_id) REFERENCES condition_documents(revision_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
