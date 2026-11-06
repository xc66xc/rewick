BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE desktop_settings
    ADD COLUMN IF NOT EXISTS session_record_max_mib INTEGER NOT NULL DEFAULT 20;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'desktop_settings'::regclass
          AND conname = 'desktop_session_record_limit'
    ) THEN
        ALTER TABLE desktop_settings
            ADD CONSTRAINT desktop_session_record_limit
            CHECK (session_record_max_mib BETWEEN 1 AND 50);
    END IF;
END $$;

COMMENT ON COLUMN desktop_settings.session_record_max_mib
    IS '单次会话记录JSON容量上限（MiB），默认20，允许1至50';
COMMIT;
