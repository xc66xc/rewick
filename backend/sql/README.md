# 数据库 SQL

PostgreSQL 15.19 / pgvector 0.8.6。脚本手动按编号执行；后端不使用 Flyway，也不自动初始化数据库。

| 文件 | 用途 |
| --- | --- |
| `22_zpay_api_qr.sql` | ZPAY API 下单客户端 IP、一次性请求标记；停用旧表单地址配置，需管理端明确改为 mapi.php 后启用 |
| `01_schema.sql` | 账号、令牌、额度与调用记录 |
| `02_pgvector.sql` | 启用并检查 pgvector 0.8.6 |
| `03_admin_users.sql` | 管理员角色、用户额度与操作记录 |
| `04_platform_config.sql` | 加密平台服务配置 |
| `05_email_auth.sql` | 邮箱身份、验证码与加密 SMTP 配置 |
| `06_display_name.sql` | 删除 username，添加 display_name 与 account 登录身份 |
| `07_email_code_purpose.sql` | 隔离注册与重置密码验证码用途 |
| `08_server_local_time.sql` | 全部时间列改为北京时间无时区微秒值，设置当前业务库时区 |
| `09_pg_references.sql` | 用户资料、1024维向量、持久索引任务与上传配额 |
| `10_time_wallet.sql` | 可用秒数、面试计时会话、时长流水；删除每日配额 |
| `11_payment_packages.sql` | 时长套餐、版本化支付配置、订单、人工退款记录与购买流水关联 |
| `12_alipay_payments.sql` | 支付宝配置、订单渠道绑定、按支付渠道隔离交易号与退款凭据 |
| `13_session_records.sql` | 服务器会话历史、版本与删除标记 |
| `14_server_background.sql` | 简历、JD、环境、默认选择及计时会话背景快照 |
| `15_user_preferences.sql` | 用户偏好、平台服务选择、版本和幂等标识 |
| `16_desktop_sessions.sql` | 单桌面登录、会话撤销原因与面试登录归属 |
| `17_desktop_settings.sql` | 桌面高级设置授权与普通用户默认模型、温度和检索方式 |
| `18_invitations.sql` | 用户邀请码、邀请奖励规则、注册关系与钱包奖励流水 |
| `19_client_downloads.sql` | 三个平台的最新安装包配置及临时上传元数据 |

## 初始化空数据库

从 backend 目录执行，密码通过交互提示或本机凭据提供：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/01_schema.sql -f sql/02_pgvector.sql -f sql/03_admin_users.sql -f sql/04_platform_config.sql -f sql/05_email_auth.sql -f sql/06_display_name.sql -f sql/07_email_code_purpose.sql -f sql/08_server_local_time.sql -f sql/09_pg_references.sql -f sql/10_time_wallet.sql -f sql/11_payment_packages.sql -f sql/12_alipay_payments.sql -f sql/13_session_records.sql -f sql/14_server_background.sql -f sql/15_user_preferences.sql -f sql/16_desktop_sessions.sql -f sql/17_desktop_settings.sql -f sql/18_invitations.sql -f sql/19_client_downloads.sql
```

使用 Compose 时，从仓库根目录执行：

```sh
docker compose up -d --build --wait database
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/01_schema.sql -f /opt/copilot/sql/02_pgvector.sql -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql -f /opt/copilot/sql/05_email_auth.sql -f /opt/copilot/sql/06_display_name.sql -f /opt/copilot/sql/07_email_code_purpose.sql -f /opt/copilot/sql/08_server_local_time.sql -f /opt/copilot/sql/09_pg_references.sql -f /opt/copilot/sql/10_time_wallet.sql -f /opt/copilot/sql/11_payment_packages.sql -f /opt/copilot/sql/12_alipay_payments.sql -f /opt/copilot/sql/13_session_records.sql -f /opt/copilot/sql/14_server_background.sql -f /opt/copilot/sql/15_user_preferences.sql -f /opt/copilot/sql/16_desktop_sessions.sql -f /opt/copilot/sql/17_desktop_settings.sql -f /opt/copilot/sql/18_invitations.sql -f /opt/copilot/sql/19_client_downloads.sql
docker compose up -d --build backend admin
```

Compose 仅只读挂载 SQL。安装扩展需要相应权限；管理员可先安装扩展，再由维护账号执行业务结构脚本。

## 已有数据库

开发阶段本次不备份。停止后端，再按顺序执行尚未执行的编号，不能重复执行 06、07 或 08。已完成 01–07 的实例本次只需：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/08_server_local_time.sql -f sql/09_pg_references.sql
```

08 使用 `AT TIME ZONE 'Asia/Shanghai'` 把已有时刻转换成北京时间，所有 25 个时间列为 `TIMESTAMP(6) WITHOUT TIME ZONE`，默认值为 `LOCALTIMESTAMP(6)`。仅修改当前业务库默认时区；新连接生效。原有 `usage_day` 日期计数保留，未来配额按北京零点划分。接口对外时间仍带明确偏移，旧应用不能与新结构混用。

07 保留用户和登录会话，把验证码唯一约束改为 `(email, purpose)`。由于摘要现在绑定用途，所有已有验证码均失效，用户升级后必须重新获取验证码。应用密码重置会原子撤销该用户的全部旧令牌。SQL 成功后发布新版后端和客户端。

06 删除 `app_users.username` 并建立非唯一显示名称；登录身份独立存储。用户 ID、密码、角色不变。SMTP username 不受影响。若从 05 升级，先执行 06 再执行 07。

结构变更后不能仅替换旧 JAR。本次未创建数据库备份，不能依赖备份回滚。平台主密钥必须妥善保管，否则密文无法恢复。供应商和 SMTP 地址从管理页面配置，无环境变量回退。后续结构变更新增编号文件并记录执行结果。

## PG 资料检索升级

已完成 01–08 的业务库只执行 09；使用公网现有的 PostgreSQL 15.19 / pgvector 0.8.6，不替换数据库。若尚未启用扩展，使用管理员身份执行。应用账号需要新表 CRUD 与序列权限。开发阶段按约定不备份，不重复执行建表脚本。

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/09_pg_references.sql
```

原文件必须挂载持久卷 `/app/data/references`，容器用户 copilot 需要写权限。Nginx 上传上限11MB，后端单文件10MB。管理员在平台配置启用支持1024维的向量服务；旧本地资料不迁移，需用户重新上传。

## 面试时长升级

已执行 01–09 的开发库停止后端后只执行 `10_time_wallet.sql`，不重复执行。脚本自身包含事务，不做数据库备份。为应用账号授予三个新表的 SELECT/INSERT/UPDATE/DELETE 和两个新序列的 USAGE/SELECT。原有用户可用时长初始化为 0；更新后在用户管理中分配。表中钱包版本用于管理员并发调整，心跳结算不递增该版本。

## 微信支付套餐升级

已执行 01–10 的库停止后端后只执行 `11_payment_packages.sql`。脚本自身包含事务；仍使用现有数据库版本、平台主密钥与资料持久卷，不重建已有钱包。以结构维护账号执行：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 -f sql/11_payment_packages.sql
```

应用账号若为 `copilot_backend`，按实际账号执行以下授权（在目标数据库内）：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON time_packages, payment_config_versions,
    payment_orders, payment_manual_refunds, payment_notifications TO copilot_backend;
GRANT USAGE, SELECT ON SEQUENCE time_packages_id_seq, payment_config_versions_id_seq,
    payment_orders_id_seq, payment_manual_refunds_id_seq, payment_notifications_id_seq TO copilot_backend;
```

更新服务端、管理端和桌面端。未配置商户资料时不开放支付；凭据通过管理端保存，不添加到 YML。正式使用前建议 HTTPS，并确保 `/api/v1/payments/wechat/notify` 能从公网 POST 到达后端；回调的真实性由微信签名和解密校验。禁用支付不删除历史配置，已有订单仍需查询和入账。人工退款先在微信商户平台完成，再在后台登记，不会自动向微信退款。

## 支付宝扫码支付升级

已执行 01–11 的库停止后端后执行以下脚本，再更新后端、管理端与桌面端：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 -f sql/12_alipay_payments.sql
```

12 只扩展已有支付表，不新增数据库或重建钱包。已有订单和配置标记为 `wechat`；支付宝订单绑定自己的配置版本。现有整表授权继续有效，无需新增序列授权。交易号和人工退款凭据按渠道去重。不要只换 JAR 而漏执行脚本。

管理员在“支付设置 → 支付宝支付”填写应用资料并启用。公网必须允许表单 POST 到 `/api/v1/payments/alipay/notify`；服务端在 RSA2 验签、身份及金额校验和持久化完成后返回纯文本 `success`。测试环境使用官方沙箱网关和沙箱资料，正式收款需切换正式资料。退款先在支付宝商家平台人工处理，再登记金额、凭据和扣回时长。

## 个人背景升级

已执行 01–13 的库只执行 14，不重复运行，不导入旧桌面数据：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/14_server_background.sql
```

按实际应用角色授予新表权限（以下以 `copilot_backend` 为例）：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON user_resumes, job_targets,
    interview_environments, environment_references, interview_preferences TO copilot_backend;
```

新表使用客户端生成的 UUID，无新增序列；已有 `interview_sessions` 表授权继续有效。部署时同步更新后端与桌面，开始面试接口现在要求 `environmentId`。不迁移本地 `interviews.json`，用户重新录入资料。原 PDF 不上传，简历不向量化。

## 用户设置升级

已有 01–14 的库只执行 15，不导入旧本机设置：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/15_user_preferences.sql
```

按实际运行角色授权：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO copilot_backend;
GRANT USAGE, SELECT ON SEQUENCE user_preferences_id_seq TO copilot_backend;
```

同步更新后端与桌面。首次读取创建服务器默认偏好，平台选择为空，需明确选择后保存；不将某台电脑的旧设置或自定义服务上传作为默认值。

## 桌面单点登录升级

已有 01–15 的数据库执行 16。先停止旧后端，执行后同步更新后端、桌面及管理端：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/16_desktop_sessions.sql
```

此开发阶段升级会使已有登录凭证失效，用户和管理员重新登录；不迁移旧会话。没有新增表或序列，无需新增应用角色授权。登录接口现在必须传 `clientType: desktop` 或 `admin`，普通用户不能申请管理端会话。不要单独将新版桌面连接到尚未升级的旧后端。

## 桌面高级设置权限升级

已执行 01–16 的库执行 17，并授予应用账号新表权限：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/17_desktop_settings.sql
```

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON desktop_settings TO copilot_backend;
```

无新增序列。新注册及已有用户默认不具备高级设置权限。同步更新后端、管理端和桌面端，在管理端“平台配置 → 桌面高级设置权限”保存普通用户默认回答模型、温度、转写服务及检索方式，再按需搜索已有用户授权。初始默认模型为空，不自动选择供应商；未配置的能力会提示管理员配置。

普通用户修改回答风格不覆盖原有高级偏好，自定义凭据仍在本机；撤销授权后停止使用这些配置，重新授权后可继续选择。正在进行的回答或转写不强制中断，后续请求使用新权限。此轮仅本地实施，未部署公网。

## 邀请奖励升级

已执行 01–17 的数据库仅执行以下脚本，使用拥有 DDL 权限的账号：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 -f sql/18_invitations.sql
```

若应用使用独立角色，补充权限：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON invitation_settings, user_invitation_codes, user_invitations TO copilot_backend;
GRANT USAGE, SELECT ON SEQUENCE user_invitation_codes_id_seq, user_invitations_id_seq TO copilot_backend;
```

同步更新后端、管理端和桌面端。邀请奖励初始关闭，在管理端“邀请奖励”配置奖励时长并启用。注册邀请码选填；旧用户第一次打开“邀请好友”时生成固定的 6 位邀请码。奖励仅发给邀请人，注册、邀请关系和钱包流水在同一事务提交。更改规则不重算历史奖励，关闭后不再接受邀请码。此脚本不会补发历史注册奖励。

## 客户端下载升级

已执行 01–18 的库执行 19：

```sh
psql -X -h 127.0.0.1 -U postgres -d interview_copilot -v ON_ERROR_STOP=1 -f sql/19_client_downloads.sql
```

独立应用角色需授权（无新增序列）：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON client_downloads, client_download_uploads TO copilot_backend;
```

三条固定平台记录初始关闭。安装包不进数据库，部署前挂载持久卷并更新 Nginx，详见 deploy/server/client-downloads.md。临时上传 24 小时后过期，每小时清理；不保留历史版本。

### 20_alipay_page_pay.sql
电脑网站支付：新增配置 return_url、一次性收银台票据、唯一活动订单索引。先关闭旧活动支付宝订单；脚本会关闭支付宝新订单入口，后台补齐返回地址后重新启用。授权和发布步骤见 `deploy/server/alipay-page-pay.md`。

### 21_zpay_payments.sql
独立 ZPAY 渠道：新增商户配置列，订单渠道约束增加 zpay。在 SQL20 之后执行。不会自动启用渠道；后台填写商户资料后保存启用。配置和验收说明见 `deploy/server/zpay.md`。
