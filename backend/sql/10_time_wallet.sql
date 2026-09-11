BEGIN;
CREATE TABLE time_wallets (
    app_users_id BIGINT PRIMARY KEY REFERENCES app_users(id),
    available_seconds BIGINT NOT NULL DEFAULT 0 CHECK (available_seconds >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
INSERT INTO time_wallets(app_users_id) SELECT id FROM app_users;
CREATE TABLE interview_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL UNIQUE,
    app_users_id BIGINT NOT NULL REFERENCES app_users(id),
    request_id VARCHAR(36) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
    started_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    expires_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    ended_at TIMESTAMP(6) WITHOUT TIME ZONE,
    used_seconds BIGINT NOT NULL DEFAULT 0 CHECK(used_seconds >= 0),
    end_reason VARCHAR(32),
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    UNIQUE(app_users_id, request_id)
);
CREATE UNIQUE INDEX interview_sessions_active ON interview_sessions(app_users_id) WHERE status='active';
CREATE INDEX interview_sessions_expiry ON interview_sessions(expires_at) WHERE status='active';
CREATE INDEX interview_sessions_user ON interview_sessions(app_users_id,id DESC);
CREATE TABLE time_wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    app_users_id BIGINT NOT NULL REFERENCES app_users(id),
    request_id VARCHAR(36),
    operation VARCHAR(16) NOT NULL,
    requested_seconds BIGINT,
    expected_version BIGINT,
    delta_seconds BIGINT NOT NULL,
    before_seconds BIGINT NOT NULL,
    after_seconds BIGINT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    actor_id BIGINT REFERENCES app_users(id),
    session_id VARCHAR(36),
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    UNIQUE(app_users_id,request_id)
);
CREATE INDEX time_wallet_transactions_user ON time_wallet_transactions(app_users_id,id DESC);
ALTER TABLE app_users DROP COLUMN daily_answers, DROP COLUMN daily_knowledge_queries;
DROP TABLE usage_daily;
COMMIT;
