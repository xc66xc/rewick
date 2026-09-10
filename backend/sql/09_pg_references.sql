-- Execute manually after 08. Existing public pgvector installation is authoritative.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE reference_documents (
 id UUID PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 name VARCHAR(255) NOT NULL, kind VARCHAR(16) NOT NULL DEFAULT 'technical' CHECK(kind IN ('technical','personal')),
 is_enabled BOOLEAN NOT NULL DEFAULT TRUE, status VARCHAR(16) NOT NULL DEFAULT 'pending',
 content_hash CHAR(64) NOT NULL, file_size BIGINT NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0, desired_revision INTEGER NOT NULL DEFAULT 1,
 chunk_count INTEGER NOT NULL DEFAULT 0, error VARCHAR(300) NOT NULL DEFAULT '',
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 UNIQUE(id,app_users_id), UNIQUE(app_users_id,content_hash)
);
CREATE TABLE reference_chunks (
 id BIGSERIAL PRIMARY KEY, document_id UUID NOT NULL, app_users_id BIGINT NOT NULL,
 revision INTEGER NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL, page_start INTEGER NOT NULL, page_end INTEGER NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE,
 UNIQUE(document_id,revision,ordinal), UNIQUE(id,app_users_id)
);
CREATE TABLE reference_embeddings (
 chunk_id BIGINT PRIMARY KEY, app_users_id BIGINT NOT NULL, fingerprint CHAR(64) NOT NULL, embedding VECTOR(1024) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(chunk_id,app_users_id) REFERENCES reference_chunks(id,app_users_id) ON DELETE CASCADE
);
CREATE TABLE reference_index_jobs (
 id BIGSERIAL PRIMARY KEY, document_id UUID NOT NULL, app_users_id BIGINT NOT NULL, revision INTEGER NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending', lease_token UUID, lease_until TIMESTAMP(6), attempts INTEGER NOT NULL DEFAULT 0,
 error VARCHAR(300) NOT NULL DEFAULT '', embedded_chunks INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE,
 UNIQUE(document_id,revision)
);
CREATE INDEX reference_chunks_scope ON reference_chunks(app_users_id,document_id,revision);
CREATE INDEX reference_embeddings_model ON reference_embeddings(app_users_id,fingerprint);
CREATE INDEX reference_jobs_pending ON reference_index_jobs(status,lease_until);
CREATE TABLE reference_policy (
 id INTEGER PRIMARY KEY CHECK(id=1), max_files INTEGER NOT NULL DEFAULT 20 CHECK(max_files BETWEEN 1 AND 100),
 max_total_bytes BIGINT NOT NULL DEFAULT 104857600 CHECK(max_total_bytes BETWEEN 1048576 AND 1073741824),
 max_chunks INTEGER NOT NULL DEFAULT 10000 CHECK(max_chunks BETWEEN 1 AND 50000),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
INSERT INTO reference_policy(id) VALUES(1);
