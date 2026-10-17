-- Apply manually before starting the new backend. Defaults disable the feature.
BEGIN;
CREATE TABLE IF NOT EXISTS mock_interview_config (
 id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1), version BIGINT NOT NULL DEFAULT 0,
 payload JSONB NOT NULL DEFAULT '{"enabled":false,"allowedUserIds":[],"llmModelId":"","reportModelId":"","asrServiceId":"","tts":{"endpoint":"","model":"","voiceId":"","sampleRate":24000},"maxConcurrent":2,"maxFollowUps":2,"pauseMs":1800,"maxTtsCharacters":20000,"maxOutputTokens":1024,"dailySessionLimit":10}'::jsonb,
 tts_key TEXT NOT NULL DEFAULT '', updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6));
INSERT INTO mock_interview_config(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS mock_wallets (
 app_users_id BIGINT PRIMARY KEY REFERENCES app_users(id), available_seconds BIGINT NOT NULL DEFAULT 0 CHECK(available_seconds>=0),
 version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6));
CREATE TABLE IF NOT EXISTS mock_interviews (
 id UUID PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID NOT NULL,
 request_hash VARCHAR(64) NOT NULL, environment_id UUID NOT NULL, snapshot JSONB NOT NULL, config JSONB NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'ready', version BIGINT NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (15,30,45)), used_seconds BIGINT NOT NULL DEFAULT 0,
 tts_characters INTEGER NOT NULL DEFAULT 0, speech_generation INTEGER NOT NULL DEFAULT -1, current_turn_id UUID, report_status VARCHAR(20) NOT NULL DEFAULT 'pending', error VARCHAR(200),
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6), updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
 deleted_at TIMESTAMP(6) WITHOUT TIME ZONE, UNIQUE(app_users_id,request_id), UNIQUE(id,app_users_id));
CREATE INDEX IF NOT EXISTS mock_interviews_user_time ON mock_interviews(app_users_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS mock_interviews_state ON mock_interviews(state,updated_at);
CREATE TABLE IF NOT EXISTS mock_turns (
 id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES mock_interviews(id), app_users_id BIGINT NOT NULL,
 turn_number INTEGER NOT NULL, topic_id VARCHAR(100) NOT NULL DEFAULT '', question TEXT NOT NULL,
 answer_text TEXT NOT NULL DEFAULT '', status VARCHAR(16) NOT NULL DEFAULT 'pending', assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6), UNIQUE(session_id,turn_number),
 FOREIGN KEY(session_id,app_users_id) REFERENCES mock_interviews(id,app_users_id));
CREATE TABLE IF NOT EXISTS mock_commands (
 app_users_id BIGINT NOT NULL, session_id UUID NOT NULL REFERENCES mock_interviews(id), request_id UUID NOT NULL,
 payload_hash VARCHAR(64) NOT NULL, result JSONB NOT NULL, created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
 PRIMARY KEY(app_users_id,session_id,request_id));
CREATE TABLE IF NOT EXISTS mock_events (
 session_id UUID NOT NULL REFERENCES mock_interviews(id), sequence BIGINT NOT NULL, payload JSONB NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6), PRIMARY KEY(session_id,sequence));
CREATE TABLE IF NOT EXISTS mock_reports (
 session_id UUID PRIMARY KEY REFERENCES mock_interviews(id), status VARCHAR(20) NOT NULL DEFAULT 'pending',
 report JSONB, attempts INTEGER NOT NULL DEFAULT 0, error VARCHAR(200), lease_until TIMESTAMP(6) WITHOUT TIME ZONE,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6));
CREATE TABLE IF NOT EXISTS mock_usage_periods (
 id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES mock_interviews(id), app_users_id BIGINT NOT NULL,
 started_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL, expires_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
 ended_at TIMESTAMP(6) WITHOUT TIME ZONE, used_seconds BIGINT NOT NULL DEFAULT 0,
 FOREIGN KEY(session_id,app_users_id) REFERENCES mock_interviews(id,app_users_id));
CREATE UNIQUE INDEX IF NOT EXISTS mock_usage_active ON mock_usage_periods(app_users_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS mock_wallet_ledger (
 id BIGSERIAL PRIMARY KEY, app_users_id BIGINT NOT NULL REFERENCES app_users(id), request_id UUID,
 delta_seconds BIGINT NOT NULL, balance_after_seconds BIGINT NOT NULL CHECK(balance_after_seconds>=0),
 reason VARCHAR(200) NOT NULL, actor_app_users_id BIGINT REFERENCES app_users(id), session_id UUID REFERENCES mock_interviews(id),
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6), UNIQUE(app_users_id,request_id));
CREATE INDEX IF NOT EXISTS mock_ledger_user ON mock_wallet_ledger(app_users_id,id DESC);
CREATE TABLE IF NOT EXISTS interview_activity_leases (
 app_users_id BIGINT PRIMARY KEY REFERENCES app_users(id), mode VARCHAR(8) NOT NULL CHECK(mode IN ('assist','mock')),
 session_id VARCHAR(36) NOT NULL, expires_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL);
INSERT INTO interview_activity_leases(app_users_id,mode,session_id,expires_at)
 SELECT app_users_id,'assist',session_id,expires_at FROM interview_sessions
 WHERE status='active' AND expires_at>(clock_timestamp() AT TIME ZONE 'Asia/Shanghai') ON CONFLICT DO NOTHING;
COMMIT;
