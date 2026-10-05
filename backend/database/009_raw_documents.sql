-- Persistent storage for original notice text collected by source adapters.
-- Apply through python -m app.modules.storage init; the collector still writes local JSON files.
CREATE TABLE raw_documents (
    document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    title VARCHAR(512) NOT NULL,
    text MEDIUMTEXT NOT NULL,
    source_url VARCHAR(2048) NOT NULL,
    collected_at VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    published_at VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NULL,
    INDEX idx_raw_documents_collected_at (collected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
