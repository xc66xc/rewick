# 数据库 SQL

PostgreSQL 15.19 / pgvector 0.5.1。脚本手动按编号执行；后端不使用 Flyway，也不自动初始化数据库。

| 文件 | 用途 |
| --- | --- |
| `01_schema.sql` | 账号、令牌、额度与调用记录 |
| `02_pgvector.sql` | 启用并检查 pgvector 0.5.1 |
| `03_admin_users.sql` | 管理员角色、用户额度与操作记录 |
| `04_platform_config.sql` | 加密平台服务配置 |
| `05_email_auth.sql` | 邮箱身份、验证码与加密 SMTP 配置 |
| `06_display_name.sql` | 删除 username，添加 display_name 与 account 登录身份 |
| `07_email_code_purpose.sql` | 隔离注册与重置密码验证码用途 |
| `08_server_local_time.sql` | 全部时间列改为北京时间无时区微秒值，设置当前业务库时区 |

## 初始化空数据库

从 backend 目录执行，密码通过交互提示或本机凭据提供：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/01_schema.sql -f sql/02_pgvector.sql -f sql/03_admin_users.sql -f sql/04_platform_config.sql -f sql/05_email_auth.sql -f sql/06_display_name.sql -f sql/07_email_code_purpose.sql -f sql/08_server_local_time.sql
```

使用 Compose 时，从仓库根目录执行：

```sh
docker compose up -d --build --wait database
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/01_schema.sql -f /opt/copilot/sql/02_pgvector.sql -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql -f /opt/copilot/sql/05_email_auth.sql -f /opt/copilot/sql/06_display_name.sql -f /opt/copilot/sql/07_email_code_purpose.sql -f /opt/copilot/sql/08_server_local_time.sql
docker compose up -d --build backend admin
```

Compose 仅只读挂载 SQL。安装扩展需要相应权限；管理员可先安装扩展，再由维护账号执行业务结构脚本。

## 已有数据库

开发阶段本次不备份。停止后端，再按顺序执行尚未执行的编号，不能重复执行 06、07 或 08。已完成 01–07 的实例本次只需：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/08_server_local_time.sql
```

08 使用 `AT TIME ZONE 'Asia/Shanghai'` 把已有时刻转换成北京时间，所有 25 个时间列为 `TIMESTAMP(6) WITHOUT TIME ZONE`，默认值为 `LOCALTIMESTAMP(6)`。仅修改当前业务库默认时区；新连接生效。原有 `usage_day` 日期计数保留，未来配额按北京零点划分。接口对外时间仍带明确偏移，旧应用不能与新结构混用。

07 保留用户和登录会话，把验证码唯一约束改为 `(email, purpose)`。由于摘要现在绑定用途，所有已有验证码均失效，用户升级后必须重新获取验证码。应用密码重置会原子撤销该用户的全部旧令牌。SQL 成功后发布新版后端和客户端。

06 删除 `app_users.username` 并建立非唯一显示名称；登录身份独立存储。用户 ID、密码、角色不变。SMTP username 不受影响。若从 05 升级，先执行 06 再执行 07。

结构变更后不能仅替换旧 JAR。本次未创建数据库备份，不能依赖备份回滚。平台主密钥必须妥善保管，否则密文无法恢复。供应商和 SMTP 地址从管理页面配置，无环境变量回退。后续结构变更新增编号文件并记录执行结果。
