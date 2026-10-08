-- Widen the compatibility projection to preserve inputs accepted by revision storage.
-- Keep prior migration bytes and existing rows intact.
ALTER TABLE policies
    MODIFY COLUMN title VARCHAR(1000) NOT NULL,
    MODIFY COLUMN organization VARCHAR(1000) NOT NULL,
    MODIFY COLUMN source_url LONGTEXT NOT NULL,
    MODIFY COLUMN source_text LONGTEXT NOT NULL;

ALTER TABLE policy_requirements
    MODIFY COLUMN evidence_text LONGTEXT NOT NULL;
