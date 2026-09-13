ALTER TABLE app_users ADD COLUMN advanced_settings_enabled BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN app_users.advanced_settings_enabled IS '桌面高级模型设置权限';
CREATE TABLE desktop_settings (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    version BIGINT NOT NULL DEFAULT 0,
    llm_model_id VARCHAR(64) NOT NULL DEFAULT '',
    temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    asr_service_id VARCHAR(64) NOT NULL DEFAULT '',
    retrieval_mode VARCHAR(16) NOT NULL DEFAULT 'local' CHECK (retrieval_mode IN ('local','remote')),
    knowledge_service_id VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
INSERT INTO desktop_settings(id) VALUES(1);
COMMENT ON TABLE desktop_settings IS '普通桌面用户的平台默认模型和检索配置';
