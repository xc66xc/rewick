# Interview Copilot 后端

独立 Java 模块化单体，供 macOS / Windows 客户端调用平台能力。采用 JDK 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、PostgreSQL 15.19 和 pgvector 0.5.1。MyBatis-Plus 模块由其 3.5.17 BOM 统一管理，其余 Spring/数据库组件使用 Boot BOM。平台供应商 Key 从服务端环境或加密数据库配置读取，客户端持有可撤销的业务登录凭证。

## 构建与运行

先按 [sql/README.md](sql/README.md) 初始化数据库，设置连接环境变量和指向 JDK 21 的 `JAVA_HOME`，然后执行：

```sh
./mvnw verify
./mvnw spring-boot:run
```

Maven Wrapper 固定 3.9.16；Windows 使用 `mvnw.cmd`。第一次运行会从官方 Maven 仓库下载构建工具与依赖。数据库 SQL 放在 `backend/sql/`，不随应用自动执行，也不打入运行 jar。没有数据库凭据时不会使用内置账号或密码。

数据库固定为 PostgreSQL 15.19 + pgvector 0.5.1。仓库根 `deploy/postgres/Dockerfile` 构建匹配版本的数据库镜像。`sql/01_schema.sql` 初始化业务表，`sql/02_pgvector.sql` 创建 `public.vector` 扩展并检查版本。初始化脚本用于空库，已有库按实际结构选择需要执行的 SQL。项目不再使用 Flyway，也禁用了 Spring SQL 自动初始化。

自行部署或使用托管数据库时，先在数据库服务器安装 pgvector 0.5.1 扩展文件，由具备扩展创建权限的管理员在目标业务数据库执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public VERSION '0.5.1';
SELECT current_setting('server_version'), extversion
FROM pg_extension WHERE extname = 'vector';
```

扩展和表结构准备好后，运行应用的账号不需要为此获得超级用户权限。pgvector 当前只准备数据库能力；百炼远程检索、客户端本地资料检索逻辑不因此切换，也未新增资料切块、Embedding 或向量检索接口。版本对应安装说明见 [pgvector 0.5.1 官方文档](https://github.com/pgvector/pgvector/tree/v0.5.1#installation)。

| 环境变量 | 用途 / 默认值 |
| --- | --- |
| `PORT` | HTTP 端口，8080 |
| `COPILOT_DATABASE_URL` | JDBC 地址，默认 `jdbc:postgresql://localhost:5432/interview_copilot` |
| `COPILOT_DATABASE_USERNAME` / `COPILOT_DATABASE_PASSWORD` | 数据库账号 / 密码，无默认值 |
| `COPILOT_BOOTSTRAP_USERNAME` / `COPILOT_BOOTSTRAP_PASSWORD` | 可选首次创建用户，必须一起设置；用户名 3–64 个字母、数字或 `_.@-`，密码至少 12 字符且最多 72 个 UTF-8 字节 |
| `COPILOT_TOKEN_HOURS` | 业务 token 有效小时数，24 |
| `COPILOT_LOGIN_BURST` / `COPILOT_LOGIN_WINDOW_SECONDS` | 每用户名窗口内登录尝试数 / 窗口秒数，10 / 60；同来源地址最多十倍次数 |
| `COPILOT_DAILY_ANSWERS` | 每用户每天平台回答请求上限，100 |
| `COPILOT_DAILY_KNOWLEDGE_QUERIES` | 每用户每天平台检索请求上限，300 |
| `COPILOT_MAX_ASR_SESSION_SECONDS` | 单场平台转写最长秒数，3600；同用户最多一场 |
| `COPILOT_PROVIDERS_LLM_URL` / `COPILOT_PROVIDERS_LLM_APIKEY` / `COPILOT_PROVIDERS_LLM_MODEL` | 服务端固定模型完整请求地址、Key 和默认模型 |
| `COPILOT_PROVIDERS_LLM_ALLOWEDMODELS` | 可选逗号分隔的平台模型白名单 |
| `COPILOT_PROVIDERS_KNOWLEDGE_URL` / `COPILOT_PROVIDERS_KNOWLEDGE_APIKEY` / `COPILOT_PROVIDERS_KNOWLEDGE_AGENTID` | 服务端百炼检索完整地址、Key、Agent ID |
| `COPILOT_PROVIDERS_ASR_URL` / `COPILOT_PROVIDERS_ASR_APIKEY` / `COPILOT_PROVIDERS_ASR_MODEL` | 服务端 ASR 地址、Key、模型；模型默认 `fun-asr-realtime` |

Bootstrap 只在该用户名不存在时创建，不覆盖旧密码。两项均不填就不创建账号；没有默认登录用户。首次创建后应移除 bootstrap 密码环境配置。供应商配置为空的能力保持禁用，其他能力独立可用。密钥通过部署环境或凭据管家注入，不写入源码、镜像或客户端。

## 账号、权限与接口

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| `GET /actuator/health` | 无 | 公开健康状态，不返回数据库细节 |
| `POST /api/v1/auth/login` | `{username,password}` | `{accessToken,expiresAt,user:{id,username}}`；有频率限制 |
| `POST /api/v1/auth/logout` | `Authorization: Bearer …` | 204，立即撤销该 token 的后续认证 |
| `GET /api/v1/platform` | `Authorization: Bearer …` | 当前用户、`capabilities`、`models`、`limits`；不返回供应商密钥与地址 |

除登录和公开健康检查外，所有 `/api/v1/**` 都必须认证，其他路径默认拒绝。错误统一为 `{code,message}`，不会返回 SQL、供应商响应或堆栈。用户 ID 在 JSON 中为字符串，身份来自服务端认证主体；不信任请求体中的用户 ID。

业务 token 是 32 字节密码学随机数，以 Base64URL 编码。数据库只存 SHA-256 摘要和过期/撤销状态；密码使用 BCrypt。没有 JWT 自签名秘密，也不会生成 Spring 默认用户名密码。客户端应将业务 token 放系统安全存储，不当作供应商 Key 使用。

HTTP 请求正文最多 1 MiB，同时验证 Content-Length 和实际读取字节数，覆盖 chunked 请求。登录限流使用连接来源地址，默认不信任任意 `X-Forwarded-For`；如增加反向代理，应统一配置可信代理边界。首版登录限流为进程内资源保护，多实例需要共享限流实现。

## 管理接口

`/api/v1/admin/**` 额外要求服务端验证的 `ADMIN` 角色。角色来自数据库，每次 Bearer 认证重新读取；Web 后台不自行授予角色。浏览器端采用内存 Bearer，无 cookie 登录；同源代理，不开放任意来源 CORS。

| 方法 / 路径（前缀 `/api/v1/admin`） | 用途 |
| --- | --- |
| `GET /me` | 当前管理员身份 |
| `GET /users` / `POST /users` | 分页查询或创建普通用户 |
| `PUT /users/{id}` | 启用/停用、修改回答与检索日额度 |
| `POST /users/{id}/password` | 重置密码并撤销已有登录 |
| `POST /users/{id}/revoke-tokens` | 撤销该用户所有 token 的后续访问 |
| `GET /config` / `PUT /config` | 读取脱敏配置、带版本发布完整配置 |
| `POST /config/test` | 测试未发布草稿的模型、转写或知识检索连接 |
| `GET /usage` | 按用户/能力/供应商模型/状态分页查询调用记录 |
| `GET /audit` | 分页查询管理员操作记录 |

首次管理员配置：`COPILOT_ADMIN_BOOTSTRAP_USERNAME` / `COPILOT_ADMIN_BOOTSTRAP_PASSWORD`，与普通 bootstrap 使用同样的密码长度限制。与已有普通用户同名时不会提升权限；不要复用普通账号。

平台配置拆分供应商连接（类型、地址、Key）和模型目录（平台 ID、显示名、供应商模型 ID、输出长度、开放状态）。`GET /api/v1/platform` 的 `models.available` 只包含 `{id,name}`；`models.llm` 是默认平台模型 ID，回答请求的 `model` 同样使用该 ID，后端映射实际供应商模型并校验开放状态。

配置整份发布，提交时带 `version`；并发修改返回 409，避免覆盖他人更改。`apiKey` 为只写字段，读取返回 `hasApiKey`，同一供应商省略/空密钥表示保留。修改完整地址或类型时必须重新录入密钥。连接测试不发布配置，失败不改变当前服务。已有回答和 ASR 连接保持启动时快照，新请求采用新版本。

`COPILOT_PLATFORM_MASTER_KEY` 是 Base64 编码的 32 随机字节，可通过 `openssl rand -base64 32` 生成，由部署环境提供并单独备份，用于 AES-GCM 加密供应商配置。主密钥不能与数据库密文放在一起；恢复数据库需要原主密钥。管理配置首次发布前兼容部署环境供应商；发布后禁用能力不回退环境配置。

用户额度可设为 0；未设置覆盖值的历史用户继续使用部署默认。密码重置、停用会撤销已有 token，已建立的流式会话仍允许结束。首版角色由部署 bootstrap 创建，不提供网页提升普通用户为管理员的入口，也不提供用户密码或平台 Key 明文查询。

## 用量记录

`UsageService.start(userId, requestId, capability)` 返回 `UsageLease`，上游成功、失败或取消分别调用 `complete()`、`fail()`、`cancel()`；未终态关闭 lease 记录为取消。状态更新幂等。`requestId` 为 1–128 位字母、数字或 `._:-`。

预占用 PostgreSQL 用户行锁、每日计数和唯一约束完成，跨线程/进程都不能突破单用户次数上限。相同用户、能力与请求 ID 重复提交返回 409，不再次调用供应商；不同用户隔离。按 UTC 日期计数，成功预占后的失败和取消仍计入资源请求次数，不自动退款。ASR 并发也在数据库校验；意外终止的预占到期后可回收，连接仍由平台会话时长限制结束。

这里的每日请求数是防滥用限额，`usage_events` 是执行状态记录，**不是供应商金额、充值余额或正式收费账本**。当前没有支付、套餐收费、退款、短信注册或云端简历同步。没有从未知的供应商输出推算费用。

MyBatis-Plus 用于实体映射和常规 CRUD；额度、请求去重等并发操作用绑定参数 SQL。只在预占阶段持有短事务，整个模型流式输出或语音连接不持有数据库事务。

## 测试

管理后台版本已通过 `clean verify -Pintegration` 的 112 项测试，零失败、零跳过。新增覆盖管理员权限与并发保护、用户密码/令牌/额度、密钥加密与错误主密钥、配置持久化及并发发布回滚、三类连接探测和流式请求的配置快照。ASR 完成通知在额度终结及会话释放之后发送，慢速写入场景也验证停止后可立即重启。

```sh
./mvnw test
# 先构建固定版本数据库镜像；此处命令从 backend/ 执行
docker build -t interview-copilot-postgres:15.19-pgvector0.5.1 ../deploy/postgres
./mvnw -Pintegration test
```

默认运行单元测试。`integration` 额外使用 Testcontainers 启动独立 `interview-copilot-postgres:15.19-pgvector0.5.1` 容器，在启动 Spring 上下文前通过 `psql` 单次事务显式执行 `sql/` 的四份脚本，验证真实初始化、精确数据库/扩展版本、向量距离与 HNSW，以及 token 摘要/过期/撤销、HTTP 鉴权、并发限额、重复请求和用户隔离。需要可用 Docker 且已构建上述镜像；测试不使用真实账号或云端供应商。Docker Desktop 若未自动发现 socket，可设置 `DOCKER_HOST` 为实际 Docker socket。数据库容器由测试管理，不连接桌面应用的真实资料或会话记录。Mac Apple Silicon 开发环境额外激活 `macos-arm64` profile，加载匹配架构的 Netty DNS 模块；生产 Linux 容器不使用这个依赖。

## 发布边界

正式对外必须通过 HTTPS/WSS 入口。平台模型、URL、知识库范围由服务端配置，不能让客户端选择任意地址后附加平台 Key。当前实现是首版商用基础链路，仍需实际供应商账号下的联调、容量测试和多平台客户端发行验收。

Spring Boot 3.5.16 已是 3.5.x 最后一个 OSS 发行；本项目按既定 Java 21 / Boot 3.x 选择构建，长期生产维护需要另行安排补丁与支持。[官方说明](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/)
