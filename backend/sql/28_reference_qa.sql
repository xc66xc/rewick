-- Apply manually after 27 and 25, before deploying the QA-aware backend.
-- Existing documents require explicit rebuild; no historical content is migrated.
BEGIN;
ALTER TABLE reference_policy ADD COLUMN question_vector_min_score DOUBLE PRECISION NOT NULL DEFAULT 0
 CHECK(question_vector_min_score BETWEEN 0 AND 1);
ALTER TABLE reference_sections ADD COLUMN question_text VARCHAR(1024) NOT NULL DEFAULT '',
 ADD COLUMN qa_section_id BIGINT,
 ADD CONSTRAINT reference_section_qa FOREIGN KEY(qa_section_id,app_users_id,document_id,revision)
 REFERENCES reference_sections(id,app_users_id,document_id,revision);
CREATE INDEX reference_sections_qa ON reference_sections(qa_section_id);
ALTER TABLE reference_chunks ADD COLUMN qa_section_id BIGINT,
 ADD CONSTRAINT reference_chunk_qa FOREIGN KEY(qa_section_id,app_users_id,document_id,revision)
 REFERENCES reference_sections(id,app_users_id,document_id,revision) ON DELETE CASCADE;
CREATE INDEX reference_chunks_qa ON reference_chunks(qa_section_id);
CREATE TABLE reference_question_vectors (
 section_id BIGINT PRIMARY KEY, app_users_id BIGINT NOT NULL, document_id UUID NOT NULL, revision INTEGER NOT NULL,
 fingerprint CHAR(64) NOT NULL, embedding vector(1024) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(section_id,app_users_id,document_id,revision)
 REFERENCES reference_sections(id,app_users_id,document_id,revision) ON DELETE CASCADE
);
CREATE INDEX reference_questions_scope ON reference_question_vectors(app_users_id,document_id,revision);
COMMIT;
