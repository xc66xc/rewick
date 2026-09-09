# 数据库 SQL

PostgreSQL 15.19 / pgvector 0.5.1。SQL 由开发或部署人员显式执行，后端启动不会自动建表或修改结构。

| 文件 | 用途 |
| --- | --- |
| `01_schema.sql` | 初始化账号、登录凭证、每日额度、调用记录及索引 |
| `02_pgvector.sql` | 启用 pgvector 0.5.1，并验证扩展版本 |
| `03_admin_users.sql` | 新增管理员角色、用户额度覆盖、调用模型字段及操作记录 |
| `04_platform_config.sql` | 平台配置版本及加密供应商配置 |
| `05_email_auth.sql` | 已验证邮箱身份、注册验证码生命周期、带版本的加密 SMTP 配置 |

## 初始化空数据库

先安装 PostgreSQL 及 pgvector 扩展文件，创建业务数据库。将连接参数传给 `psql`，从 `backend/` 目录按顺序执行：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/01_schema.sql -f sql/02_pgvector.sql -f sql/03_admin_users.sql -f sql/04_platform_config.sql -f sql/05_email_auth.sql
```

数据库密码由交互提示、环境变量或本机凭据配置提供。执行扩展脚本需要相应权限；管理员也可先安装并启用扩展，再由业务结构的维护账号执行上述脚本。

使用项目 Compose 时，从仓库根目录执行：

```sh
docker compose up -d --build --wait database
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/01_schema.sql -f /opt/copilot/sql/02_pgvector.sql -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql -f /opt/copilot/sql/05_email_auth.sql
docker compose up -d --build backend admin
```

Compose 仅以只读方式挂载 SQL，不自动运行它们。`ON_ERROR_STOP` 配合单次事务，让初始化出错时整体回滚。

## 已有数据库

`01_schema.sql` 用于空库，只执行一次；已有相同业务表的数据库直接沿用，不重复初始化。`02_pgvector.sql` 可在已有同版本扩展时重复执行；版本不匹配会报错，不自动切换版本。

已完成 `01`–`04` 的数据库，本次升级前先备份，再只执行新增 `05`：

```sh
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/05_email_auth.sql
```

使用外部 PostgreSQL 时，从 `backend/` 目录执行：

```sh
psql -X -h 127.0.0.1 -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f sql/05_email_auth.sql
```

`05` 不修改旧账号、密码、角色或用户名，不自动把历史用户名认定为已验证邮箱。它建立邮箱身份、验证码状态和 SMTP 配置表；初始邮件服务为禁用。升级后由管理员在「邮件服务」保存连接配置，并在部署环境保留 `COPILOT_PLATFORM_MASTER_KEY`、提供独立 `COPILOT_EMAIL_CODE_SECRET` 后，才能发送注册验证码。已有账号仍可按原方式登录。

仅完成 `01` / `02` 的更早数据库，则只补齐 `03` / `04` / `05`：

```sh
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql -f /opt/copilot/sql/05_email_auth.sql
```

新增脚本不删除既有用户或会话数据，既有普通用户不会自动获得管理员权限。升级前的应用可以读取原业务字段；回滚应用时保留新增表/字段，不执行删表回滚。平台和邮件服务地址、模型/Agent 绑定均存数据库，Key 与 SMTP 密码保存为密文；恢复数据库时也需要原部署加密主密钥。后端不读取供应商或 SMTP 环境配置作为回退。

移除迁移工具不删除已有业务数据或历史表。已存在的 `flyway_schema_history` 可以保留，应用不再使用它。后续结构变更在此目录新增独立 SQL 文件，并记录适用版本、执行顺序及操作结果，由部署人员执行。
