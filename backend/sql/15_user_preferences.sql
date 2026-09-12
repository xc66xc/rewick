-- Run manually after 14_server_background.sql. No import of desktop preferences.
CREATE TABLE user_preferences (
 id BIGSERIAL PRIMARY KEY,
 app_users_id BIGINT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version >= 0),
 payload JSONB NOT NULL DEFAULT '{"answerStyle":"concise","temperature":0.5,"silenceMs":800,"autoAnswer":{"enabled":true,"pauseMs":1500},"retrievalEnabled":false,"remoteKnowledgeEnabled":false,"platformSelections":{"llm":null,"asr":null,"knowledge":null}} '::jsonb,
 mutation_id UUID,
 created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
