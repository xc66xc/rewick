-- Run explicitly after 01_schema.sql and 03_admin_users.sql.
CREATE TABLE IF NOT EXISTS platform_config (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_config(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
