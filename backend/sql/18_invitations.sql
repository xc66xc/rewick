BEGIN;
CREATE TABLE invitation_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reward_seconds BIGINT NOT NULL DEFAULT 0 CHECK (reward_seconds BETWEEN 0 AND 315360000),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
INSERT INTO invitation_settings(id) VALUES (1);
CREATE TABLE user_invitation_codes (
    id BIGSERIAL PRIMARY KEY,
    app_users_id BIGINT NOT NULL UNIQUE REFERENCES app_users(id),
    code VARCHAR(6) NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{6}$'),
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
CREATE TABLE user_invitations (
    id BIGSERIAL PRIMARY KEY,
    inviter_id BIGINT NOT NULL REFERENCES app_users(id),
    invitee_id BIGINT NOT NULL UNIQUE REFERENCES app_users(id),
    code VARCHAR(6) NOT NULL REFERENCES user_invitation_codes(code),
    reward_seconds BIGINT NOT NULL CHECK (reward_seconds BETWEEN 0 AND 315360000),
    settings_version BIGINT NOT NULL,
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
    CHECK (inviter_id <> invitee_id)
);
CREATE INDEX user_invitations_inviter ON user_invitations(inviter_id, id DESC);
ALTER TABLE time_wallet_transactions ALTER COLUMN operation TYPE VARCHAR(32);
ALTER TABLE time_wallet_transactions ADD COLUMN invitation_id BIGINT REFERENCES user_invitations(id);
CREATE UNIQUE INDEX wallet_invitation_once ON time_wallet_transactions(invitation_id) WHERE invitation_id IS NOT NULL;
COMMIT;
