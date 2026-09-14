BEGIN;

ALTER TABLE payment_config_versions ADD COLUMN zpay_pid VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE payment_config_versions ADD COLUMN zpay_payment_type VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE payment_config_versions ADD COLUMN zpay_query_url VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE payment_config_versions ADD COLUMN zpay_cid VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE payment_config_versions ADD COLUMN zpay_merchant_key VARCHAR(4000) NOT NULL DEFAULT '';
COMMENT ON COLUMN payment_config_versions.zpay_merchant_key IS '使用平台主密钥加密的 ZPAY 商户密钥';
ALTER TABLE payment_config_versions ADD CONSTRAINT payment_config_zpay_type_check
    CHECK (zpay_payment_type IN ('', 'alipay', 'wxpay'));

ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_channel_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_channel_check
    CHECK (payment_method IN ('wechat', 'alipay', 'zpay'));

-- 现有复合外键 payment_orders_config_channel_fk 已按配置 ID 与渠道匹配，无须重建。
-- 本变更不启用 ZPAY，也不更改微信及支付宝的配置或订单。
COMMIT;
