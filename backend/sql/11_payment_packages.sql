BEGIN;
CREATE TABLE IF NOT EXISTS time_packages (
 id BIGSERIAL PRIMARY KEY, version BIGINT NOT NULL DEFAULT 1,
 name VARCHAR(100) NOT NULL, description VARCHAR(1000) NOT NULL DEFAULT '',
 duration_seconds BIGINT NOT NULL CHECK(duration_seconds>0),
 original_price_cents INTEGER NOT NULL CHECK(original_price_cents>0),
 discount_bps INTEGER NOT NULL DEFAULT 10000 CHECK(discount_bps BETWEEN 1 AND 10000),
 price_cents INTEGER NOT NULL CHECK(price_cents>0), sort_order INTEGER NOT NULL DEFAULT 0,
 is_enabled BOOLEAN NOT NULL DEFAULT FALSE, is_archived BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_config_versions (
 id BIGSERIAL PRIMARY KEY, is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 mch_id VARCHAR(64) NOT NULL DEFAULT '', app_id VARCHAR(64) NOT NULL DEFAULT '',
 merchant_serial VARCHAR(128) NOT NULL DEFAULT '', wechat_public_key_id VARCHAR(128) NOT NULL DEFAULT '',
 notify_url VARCHAR(1000) NOT NULL DEFAULT '',
 merchant_private_key VARCHAR(16000) NOT NULL DEFAULT '', api_v3_key VARCHAR(1000) NOT NULL DEFAULT '',
 wechat_public_key VARCHAR(16000) NOT NULL DEFAULT '',
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_orders (
 id BIGSERIAL PRIMARY KEY, order_id VARCHAR(32) NOT NULL UNIQUE,
 app_users_id BIGINT NOT NULL REFERENCES app_users(id), request_id VARCHAR(36) NOT NULL,
 time_packages_id BIGINT NOT NULL REFERENCES time_packages(id), package_version BIGINT NOT NULL,
 package_name VARCHAR(100) NOT NULL, duration_seconds BIGINT NOT NULL CHECK(duration_seconds>0),
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 payment_config_versions_id BIGINT NOT NULL REFERENCES payment_config_versions(id),
 status VARCHAR(16) NOT NULL DEFAULT 'creating', is_credited BOOLEAN NOT NULL DEFAULT FALSE,
 code_url VARCHAR(2000), transaction_id VARCHAR(64) UNIQUE,
 refunded_cents INTEGER NOT NULL DEFAULT 0, deducted_seconds BIGINT NOT NULL DEFAULT 0,
 expires_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL, paid_at TIMESTAMP(6) WITHOUT TIME ZONE,
 last_query_at TIMESTAMP(6) WITHOUT TIME ZONE,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 UNIQUE(app_users_id,request_id)
);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON payment_orders(app_users_id,id DESC);
CREATE INDEX IF NOT EXISTS payment_orders_pending_idx ON payment_orders(status,last_query_at);
CREATE TABLE IF NOT EXISTS payment_manual_refunds (
 id BIGSERIAL PRIMARY KEY, payment_orders_id BIGINT NOT NULL REFERENCES payment_orders(id),
 request_id VARCHAR(36) NOT NULL UNIQUE, refund_cents INTEGER NOT NULL CHECK(refund_cents>0),
 deduct_seconds BIGINT NOT NULL CHECK(deduct_seconds>=0), reference VARCHAR(200) NOT NULL UNIQUE,
 reason VARCHAR(500) NOT NULL, actor_id BIGINT NOT NULL REFERENCES app_users(id),
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_notifications (
 id BIGSERIAL PRIMARY KEY, payment_orders_id BIGINT NOT NULL REFERENCES payment_orders(id),
 body_hash CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP
);
ALTER TABLE time_wallet_transactions ADD COLUMN IF NOT EXISTS payment_orders_id BIGINT REFERENCES payment_orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_purchase_order_idx ON time_wallet_transactions(payment_orders_id) WHERE operation='purchase';
COMMIT;
