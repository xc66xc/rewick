# 支付宝电脑网站支付发布

1. 使用旧服务关闭或完成所有活动支付宝订单。SQL 20 会检查并阻止带活动旧订单升级，不删除订单历史。
2. 手动执行 `backend/sql/20_alipay_page_pay.sql`。为应用角色授予：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_checkout_tickets TO copilot_backend;
GRANT USAGE, SELECT ON SEQUENCE payment_checkout_tickets_id_seq TO copilot_backend;
```

3. 更新后端、管理端、Nginx；发布 landing/payment/ 与其他落地页资源。返回页 `https://junshi.icu/payment/result`。Nginx checkout location 禁止访问日志记录短期票据。
4. 管理后台重新保存并启用支付宝配置：填写已开通电脑网站支付的 AppID、对应 RSA2 密钥、商户 PID、官方网关、notifyUrl 和 returnUrl。升级 SQL 会关闭原支付宝配置的新订单入口，原版本仍可验签历史付款通知。
5. 异步通知：`https://api.junshi.icu/api/v1/payments/alipay/notify`。返回页只展示提示，不发放时长。正式/沙箱由已保存网关决定，不能混用密钥。
6. 发布新桌面端。旧版桌面只能展示二维码，不支持新收银台入口；必须更新后使用支付宝。

## 验收

- 桌面购买支付宝套餐，打开浏览器，点击继续到支付宝，在收银台核对金额。
- 重复打开同一订单不生成新业务订单；短期票据每次有效两分钟且仅一次 POST，GET 确认页不消耗。
- 取消确认中不开放新订单。签名付款表单已发出、支付宝尚查不到交易时，等待原订单期限或查得明确结果。
- 沙箱付款后通知或查单到账一次；关闭浏览器/返回页参数不改变钱包。
- 回归微信扫码、人工退款、配置版本与并发购买。

安全头要求：checkout 接口响应的 CSP 仅允许固定 SDK 提交脚本哈希以及两个官方网关的 form-action；代理不得追加与之冲突的全站 script-src。浏览器不携带平台 Bearer，私钥不出后端。签名 HTML 不落盘、不写数据库；票据只存哈希并在已结算订单过期一天后清理。

本轮不包含真实收款测试、不代填商户私钥、不自动部署。沙箱/正式支付验收需管理员完成相应配置。
