-- Run explicitly after installing the extension files on the database server.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public VERSION '0.5.1';

-- IF NOT EXISTS does not check an already installed extension's version.
DO $$
DECLARE
    installed_version TEXT;
BEGIN
    SELECT extversion INTO installed_version
    FROM pg_extension
    WHERE extname = 'vector';

    IF installed_version IS DISTINCT FROM '0.5.1' THEN
        RAISE EXCEPTION 'Expected pgvector 0.5.1, found %. Prepare the configured extension version before initializing the database.', installed_version;
    END IF;
END;
$$;
