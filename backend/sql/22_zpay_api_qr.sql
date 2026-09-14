BEGIN;
ALTER TABLE payment_orders ADD COLUMN client_ip VARCHAR(45) NOT NULL DEFAULT '';
ALTER TABLE payment_orders ADD COLUMN is_create_attempted BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN payment_orders.client_ip IS '创建订单时可信代理传递的付款用户 IP';
COMMENT ON COLUMN payment_orders.is_create_attempted IS 'ZPAY API 下单是否已尝试，防止并发或超时后重复下单';
-- 不自动改写管理员填写的地址。升级后在管理端填写 /mapi.php 并重新启用。
UPDATE payment_config_versions SET is_enabled=FALSE
WHERE payment_method='zpay' AND gateway_url NOT LIKE '%/mapi.php';
COMMIT;
