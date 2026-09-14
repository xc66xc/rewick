BEGIN;
CREATE TABLE client_downloads (
 id VARCHAR(24) PRIMARY KEY,
 platform VARCHAR(16) NOT NULL,
 architecture VARCHAR(16) NOT NULL,
 version VARCHAR(64) NOT NULL DEFAULT '',
 original_filename VARCHAR(255) NOT NULL DEFAULT '',
 storage_path VARCHAR(200),
 file_size BIGINT NOT NULL DEFAULT 0 CHECK(file_size BETWEEN 0 AND 524288000),
 sha256 VARCHAR(64) NOT NULL DEFAULT '',
 minimum_os_version VARCHAR(100) NOT NULL DEFAULT '',
 release_notes VARCHAR(4000) NOT NULL DEFAULT '',
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
 UNIQUE(platform,architecture),
 CHECK ((id='macos-arm64' AND platform='macos' AND architecture='arm64') OR (id='macos-x64' AND platform='macos' AND architecture='x64') OR (id='windows-x64' AND platform='windows' AND architecture='x64')),
 CHECK (NOT enabled OR (storage_path IS NOT NULL AND version<>'' AND minimum_os_version<>''))
);
INSERT INTO client_downloads(id,platform,architecture) VALUES ('macos-arm64','macos','arm64'),('macos-x64','macos','x64'),('windows-x64','windows','x64');
CREATE TABLE client_download_uploads (
 id VARCHAR(36) PRIMARY KEY,
 download_id VARCHAR(24) NOT NULL REFERENCES client_downloads(id),
 actor_id BIGINT NOT NULL REFERENCES app_users(id),
 original_filename VARCHAR(255) NOT NULL,
 storage_path VARCHAR(200) NOT NULL UNIQUE,
 file_size BIGINT NOT NULL CHECK(file_size BETWEEN 1 AND 524288000),
 sha256 VARCHAR(64) NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
CREATE INDEX client_download_uploads_expiry ON client_download_uploads(created_at);
COMMIT;
