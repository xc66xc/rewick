-- Run manually after 24. No historical chunks are migrated or deleted.
BEGIN;
ALTER TABLE reference_policy ADD COLUMN version BIGINT NOT NULL DEFAULT 0, ADD COLUMN child_target INTEGER NOT NULL DEFAULT 600 CHECK(child_target BETWEEN 100 AND 640),
 ADD COLUMN child_overlap INTEGER NOT NULL DEFAULT 100 CHECK(child_overlap BETWEEN 0 AND 100),
 ADD COLUMN parent_target INTEGER NOT NULL DEFAULT 1400 CHECK(parent_target BETWEEN 400 AND 1600),
 ADD COLUMN bm25_k1 DOUBLE PRECISION NOT NULL DEFAULT 1.2 CHECK(bm25_k1 BETWEEN 0.1 AND 3),
 ADD COLUMN bm25_b DOUBLE PRECISION NOT NULL DEFAULT 0.75 CHECK(bm25_b BETWEEN 0 AND 1),
 ADD COLUMN vector_min_score DOUBLE PRECISION NOT NULL DEFAULT 0.55 CHECK(vector_min_score BETWEEN 0 AND 1),
 ADD COLUMN rrf_constant INTEGER NOT NULL DEFAULT 60 CHECK(rrf_constant BETWEEN 1 AND 1000),
 ADD COLUMN bm25_timeout_ms INTEGER NOT NULL DEFAULT 300 CHECK(bm25_timeout_ms BETWEEN 30 AND 1000),
 ADD COLUMN max_term_rows INTEGER NOT NULL DEFAULT 2000000 CHECK(max_term_rows BETWEEN 1000 AND 2000000),
 ADD COLUMN cache_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN cache_weight_bytes BIGINT NOT NULL DEFAULT 8388608 CHECK(cache_weight_bytes BETWEEN 1048576 AND 16777216),
 ADD COLUMN hybrid_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD CONSTRAINT reference_lengths CHECK(child_overlap < child_target AND parent_target >= child_target);
ALTER TABLE reference_documents ADD COLUMN splitter_version INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN context_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN section_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN format VARCHAR(8) NOT NULL DEFAULT '', ADD COLUMN heading_mode VARCHAR(16) NOT NULL DEFAULT '',
 ADD COLUMN index_status VARCHAR(16) NOT NULL DEFAULT 'pending', ADD COLUMN index_error VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE reference_index_jobs ADD COLUMN policy_json JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN cleaned_at TIMESTAMP(6);
CREATE INDEX reference_jobs_cleanup ON reference_index_jobs(updated_at,app_users_id,document_id)
 WHERE cleaned_at IS NULL AND status IN ('complete','failed','cancelled');
CREATE TABLE reference_sections (
 id BIGSERIAL PRIMARY KEY, document_id UUID NOT NULL, app_users_id BIGINT NOT NULL, revision INTEGER NOT NULL,
 ordinal INTEGER NOT NULL, parent_section_id BIGINT, heading_level INTEGER NOT NULL,
 title VARCHAR(512) NOT NULL, section_path VARCHAR(512) NOT NULL, introduction TEXT NOT NULL,
 paragraph_start INTEGER NOT NULL, paragraph_end INTEGER NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE,
 UNIQUE(document_id,revision,ordinal), UNIQUE(id,app_users_id,document_id,revision),
 FOREIGN KEY(parent_section_id,app_users_id,document_id,revision) REFERENCES reference_sections(id,app_users_id,document_id,revision)
);
CREATE TABLE reference_contexts (
 id BIGSERIAL PRIMARY KEY, section_id BIGINT NOT NULL, document_id UUID NOT NULL, app_users_id BIGINT NOT NULL,
 revision INTEGER NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL CHECK(length(text)<=1600),
 paragraph_start INTEGER NOT NULL, paragraph_end INTEGER NOT NULL, is_split BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(section_id,app_users_id,document_id,revision) REFERENCES reference_sections(id,app_users_id,document_id,revision) ON DELETE CASCADE,
 UNIQUE(document_id,revision,ordinal), UNIQUE(id,app_users_id,document_id,revision)
);
ALTER TABLE reference_chunks ADD COLUMN context_id BIGINT,
 ADD COLUMN paragraph_start INTEGER NOT NULL DEFAULT 0, ADD COLUMN paragraph_end INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN token_length INTEGER NOT NULL DEFAULT 0, ADD COLUMN analyzer_version INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT reference_chunk_scope UNIQUE(id,app_users_id,document_id,revision),
 ADD CONSTRAINT reference_chunk_context FOREIGN KEY(context_id,app_users_id,document_id,revision)
 REFERENCES reference_contexts(id,app_users_id,document_id,revision) ON DELETE CASCADE;
CREATE TABLE reference_chunk_terms (
 chunk_id BIGINT NOT NULL, app_users_id BIGINT NOT NULL, document_id UUID NOT NULL, revision INTEGER NOT NULL,
 term VARCHAR(128) NOT NULL, term_frequency INTEGER NOT NULL CHECK(term_frequency>0),
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), PRIMARY KEY(chunk_id,term),
 FOREIGN KEY(chunk_id,app_users_id,document_id,revision) REFERENCES reference_chunks(id,app_users_id,document_id,revision) ON DELETE CASCADE,
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE
);
CREATE TABLE reference_lexical_stats (
 document_id UUID NOT NULL, app_users_id BIGINT NOT NULL, revision INTEGER NOT NULL,
 chunk_count INTEGER NOT NULL, token_count BIGINT NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), PRIMARY KEY(document_id,revision),
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE
);
CREATE INDEX reference_sections_scope ON reference_sections(app_users_id,document_id,revision);
CREATE INDEX reference_contexts_scope ON reference_contexts(app_users_id,document_id,revision);
CREATE INDEX reference_terms_lookup ON reference_chunk_terms(app_users_id,term,document_id,revision,chunk_id);
CREATE INDEX reference_sections_parent ON reference_sections(parent_section_id);
CREATE INDEX reference_chunks_context ON reference_chunks(context_id);
COMMIT;
