-- Execute manually after SQL23 and before deploying HR-interview support.
-- Preserve every existing environment and historical snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE interview_environments DROP CONSTRAINT interview_type_valid;
ALTER TABLE interview_environments ADD CONSTRAINT interview_type_valid CHECK (
    is_deleted OR (content->>'interviewType' IS NOT NULL
        AND content->>'interviewType' IN ('technical', 'general', 'hr'))
);
COMMIT;
