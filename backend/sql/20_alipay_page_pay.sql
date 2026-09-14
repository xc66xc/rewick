BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM payment_orders WHERE payment_method='alipay' AND status IN ('creating','pending')) THEN
  RAISE EXCEPTION '请先通过旧版服务结清或关闭活动支付宝订单，再执行电脑网站支付升级';
 END IF;
END $$;
CREATE UNIQUE INDEX payment_orders_one_active_user ON payment_orders(app_users_id)
 WHERE status IN ('creating','pending','cancelling');
ALTER TABLE payment_config_versions ADD COLUMN return_url VARCHAR(1000) NOT NULL DEFAULT '';
CREATE TABLE payment_checkout_tickets (
 id BIGSERIAL PRIMARY KEY,
 payment_orders_id BIGINT NOT NULL REFERENCES payment_orders(id),
 ticket_hash VARCHAR(64) NOT NULL UNIQUE,
 is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP
);
CREATE INDEX payment_checkout_order_idx ON payment_checkout_tickets(payment_orders_id);
CREATE INDEX payment_checkout_expiry_idx ON payment_checkout_tickets(expires_at);
-- Stop new Alipay orders until the administrator saves a complete page-pay configuration.
UPDATE payment_config_versions SET is_enabled=FALSE WHERE payment_method='alipay';
COMMIT;
