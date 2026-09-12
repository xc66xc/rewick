-- Execute manually after 13_session_records.sql. No local data import.
CREATE TABLE user_resumes (
 id UUID PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 content JSONB NOT NULL, is_deleted BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0), mutation_id UUID NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 UNIQUE(id,app_users_id)
);
CREATE INDEX user_resumes_user ON user_resumes(app_users_id,created_at);
CREATE TABLE job_targets (
 id UUID PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 content JSONB NOT NULL, is_deleted BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0), mutation_id UUID NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 UNIQUE(id,app_users_id)
);
CREATE INDEX job_targets_user ON job_targets(app_users_id,created_at);
CREATE TABLE interview_environments (
 id UUID PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 content JSONB NOT NULL, is_deleted BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0), mutation_id UUID NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 UNIQUE(id,app_users_id)
);
CREATE INDEX interview_environments_user ON interview_environments(app_users_id,created_at);
CREATE TABLE interview_preferences (
 app_users_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 environment_id UUID NOT NULL,
 FOREIGN KEY(environment_id,app_users_id) REFERENCES interview_environments(id,app_users_id)
);
CREATE TABLE environment_references (
 environment_id UUID NOT NULL, document_id UUID NOT NULL, app_users_id BIGINT NOT NULL,
 PRIMARY KEY(environment_id,document_id),
 FOREIGN KEY(environment_id,app_users_id) REFERENCES interview_environments(id,app_users_id) ON DELETE CASCADE,
 FOREIGN KEY(document_id,app_users_id) REFERENCES reference_documents(id,app_users_id) ON DELETE CASCADE
);
ALTER TABLE interview_sessions ADD COLUMN background_snapshot JSONB;
ALTER TABLE interview_environments
 ADD COLUMN resume_id UUID GENERATED ALWAYS AS ((content->>'resumeId')::uuid) STORED,
 ADD COLUMN target_id UUID GENERATED ALWAYS AS ((content->>'targetId')::uuid) STORED,
 ADD FOREIGN KEY(resume_id,app_users_id) REFERENCES user_resumes(id,app_users_id),
 ADD FOREIGN KEY(target_id,app_users_id) REFERENCES job_targets(id,app_users_id);
