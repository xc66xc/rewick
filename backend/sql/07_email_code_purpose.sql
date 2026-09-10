-- Stop the backend before applying; existing pending registration codes are intentionally invalidated.
ALTER TABLE email_verifications ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'register'
    CHECK (purpose IN ('register', 'password_reset'));
ALTER TABLE email_verifications DROP CONSTRAINT email_verifications_email_key;
ALTER TABLE email_verifications ADD CONSTRAINT email_verifications_purpose_key UNIQUE(email, purpose);
UPDATE email_verifications SET status = 'failed', code_digest = '', nonce = '', updated_at = CURRENT_TIMESTAMP;
COMMENT ON COLUMN email_verifications.purpose IS 'Verification purpose: register or password_reset; codes cannot cross purposes';
