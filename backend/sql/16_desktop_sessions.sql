-- Development upgrade: invalidate existing credentials; users sign in again.
ALTER TABLE auth_tokens ADD COLUMN client_type VARCHAR(16) NOT NULL DEFAULT 'desktop'
 CHECK (client_type IN ('desktop','admin'));
ALTER TABLE auth_tokens ADD COLUMN revoked_reason VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE auth_tokens ADD COLUMN revoked_at TIMESTAMP(6);
UPDATE auth_tokens SET is_revoked=TRUE, revoked_reason='session_expired',
 revoked_at=LOCALTIMESTAMP(6), updated_at=LOCALTIMESTAMP(6) WHERE NOT is_revoked;
CREATE UNIQUE INDEX auth_tokens_one_desktop ON auth_tokens(app_users_id)
 WHERE client_type='desktop' AND NOT is_revoked;
ALTER TABLE interview_sessions ADD COLUMN auth_tokens_id BIGINT REFERENCES auth_tokens(id);
CREATE INDEX interview_sessions_auth ON interview_sessions(auth_tokens_id);
