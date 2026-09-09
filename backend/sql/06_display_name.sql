-- Stop the old backend before applying this migration; preserve IDs, sessions and login identities.
ALTER TABLE app_users ADD COLUMN display_name VARCHAR(254);
UPDATE app_users u SET display_name = COALESCE(
    (SELECT i.identifier FROM auth_identities i WHERE i.app_users_id = u.id AND i.identity_type = 'email'),
    u.username
);
INSERT INTO auth_identities(app_users_id, identity_type, identifier, verified_at)
SELECT u.id, 'account', u.username, CURRENT_TIMESTAMP FROM app_users u
WHERE NOT EXISTS(SELECT 1 FROM auth_identities i WHERE i.app_users_id=u.id AND i.identity_type='email');
ALTER TABLE app_users ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE app_users DROP COLUMN username;
COMMENT ON COLUMN app_users.display_name IS 'Non-unique display label; login identifiers live in auth_identities';
