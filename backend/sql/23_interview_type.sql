-- Execute manually before deploying interview-type support.
-- Existing preparations use the initial default; historical answers are not relabelled.
BEGIN;
UPDATE interview_environments
SET content = jsonb_set(content, '{interviewType}', '"technical"'::jsonb),
    version = version + 1, updated_at = LOCALTIMESTAMP(6)
WHERE NOT is_deleted AND NOT content ? 'interviewType';

-- Existing active sessions retain their pre-feature technical preparation.
UPDATE interview_sessions
SET background_snapshot = jsonb_set(background_snapshot,
    '{interviewEnvironment,interviewType}', '"technical"'::jsonb)
WHERE status = 'active' AND background_snapshot->'interviewEnvironment' IS NOT NULL
  AND NOT (background_snapshot->'interviewEnvironment') ? 'interviewType';

ALTER TABLE interview_environments ADD CONSTRAINT interview_type_valid CHECK (
    is_deleted OR (content->>'interviewType' IS NOT NULL
        AND content->>'interviewType' IN ('technical', 'general'))
);
COMMIT;
