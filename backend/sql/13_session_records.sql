BEGIN;
CREATE TABLE session_records (
 id BIGSERIAL PRIMARY KEY,
 record_id VARCHAR(128) NOT NULL,
 app_users_id BIGINT NOT NULL REFERENCES app_users(id),
 interview_sessions_id BIGINT REFERENCES interview_sessions(id),
 title VARCHAR(200) NOT NULL,
 started_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
 content JSONB NOT NULL,
 version BIGINT NOT NULL DEFAULT 1,
 mutation_id UUID NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 deleted_at TIMESTAMP(6) WITHOUT TIME ZONE,
 UNIQUE(app_users_id,record_id)
);
CREATE INDEX session_records_user_page ON session_records(app_users_id,id DESC) WHERE deleted_at IS NULL;
COMMIT;
