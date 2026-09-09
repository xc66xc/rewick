# Interview Copilot 后端

独立 Java 模块化单体，供 macOS / Windows 客户端调用平台能力。采用 JDK 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、PostgreSQL 15.19 和 pgvector 0.5.1。MyBatis-Plus 模块由其 3.5.17 BOM 统一管理，其余 Spring/数据库组件使用 Boot BOM。平台供应商与 SMTP 连接只从后台管理的数据库配置读取，Key/密码加密保存，不回退环境配置；客户端持有可撤销的业务登录凭证。

## 构建与运行

先按 [sql/README.md](sql/README.md) 初始化数据库，设置连接环境变量和指向 JDK 21 的 `JAVA_HOME`，然后执行：

```sh
./mvnw verify
./mvnw spring-boot:run
```

Maven Wrapper 固定 3.9.16；Windows 使用 `mvnw.cmd`。第一次运行会从官方 Maven 仓库下载构建工具与依赖。数据库 SQL 放在 `backend/sql/`，不随应用自动执行，也不打入运行 jar。没有数据库凭据时不会使用内置账号或密码。

数据库固定为 PostgreSQL 15.19 + pgvector 0.5.1。仓库根 `deploy/postgres/Dockerfile` 构建匹配版本的数据库镜像。空库依次执行 `sql/01_schema.sql` 至 `sql/06_display_name.sql`；已执行 `01`–`05` 的数据库，停止旧版后端后在事务内执行 `06_display_name.sql`，再启动新版。迁移保留用户 ID、令牌、密码与管理员登录，邮箱账号使用邮箱作为显示名称。具体命令见 [SQL 升级说明](sql/README.md#已有数据库)。项目不使用 Flyway，也禁用了 Spring SQL 自动初始化。

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
| `COPILOT_ADMIN_BOOTSTRAP_USERNAME` / `COPILOT_ADMIN_BOOTSTRAP_PASSWORD` | 首次管理员；不要与已有普通用户同名，创建后移除 |
| `COPILOT_PLATFORM_MASTER_KEY` | Base64 编码的 32 随机字节，加密数据库中的平台 Key 与 SMTP 密码，无默认值 |
| `COPILOT_EMAIL_CODE_SECRET` | 独立的 Base64 编码 32 字节密钥，用于验证码摘要，无默认值 |
| `COPILOT_EMAIL_REGISTRATION_ENABLED` | 验证码发送与注册应急开关，默认 `true`；设为 `false` 不影响已有账号登录 |
| `COPILOT_EMAIL_CODE_TTL_SECONDS` / `COPILOT_EMAIL_RESEND_SECONDS` | 验证码有效期 / 重发间隔，600 / 60 秒 |
| `COPILOT_EMAIL_HOURLY_SEND_LIMIT` / `COPILOT_EMAIL_MAXIMUM_ATTEMPTS` | 单邮箱每小时发送数 / 单验证码最多错误次数，5 / 5 |
| `COPILOT_EMAIL_IP_HOURLY_SEND_LIMIT` / `COPILOT_EMAIL_IP_REGISTRATION_LIMIT` | 单来源发送 / 注册尝试窗口上限，20 / 30 |

Bootstrap 只在该用户名不存在时创建，不覆盖旧密码。两项均不填就不创建账号；没有默认登录用户。首次创建后应移除 bootstrap 密码环境配置。两个部署密钥应分别用 `openssl rand -base64 32` 生成，保存在部署密钥管理中，不能写入源码、镜像或客户端。供应商地址、平台 Key、模型/Agent 绑定和 SMTP 主机/认证信息在管理后台填写；`application.yml` 与 `.env` 不提供这些连接的回退配置。未发布的能力保持不可用。

## 账号、权限与接口

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| `GET /actuator/health` | 无 | 公开健康状态，不返回数据库细节 |
| `POST /api/v1/auth/login` | `{identifier,password}` | `{accessToken,expiresAt,user:{id,displayName}}`；有频率限制 |
| `POST /api/v1/auth/email-code` | `{email}` | `{retryAfterSeconds,expiresInSeconds}`；发送注册验证码，有邮箱和来源限流 |
| `POST /api/v1/auth/register` | `{email,password,code}` | 201，创建 USER 并返回登录凭证；验证码为 6 位数字 |
| `POST /api/v1/auth/logout` | `Authorization: Bearer …` | 204，立即撤销该 token 的后续认证 |
| `GET /api/v1/platform` | `Authorization: Bearer …` | 当前用户、`capabilities`、`models`、`services`、`limits`；不返回供应商密钥与地址 |

除登录、发送注册验证码、邮箱注册和公开健康检查外，所有 `/api/v1/**` 都必须认证，其他路径默认拒绝。错误统一为 `{code,message}`，不会返回 SQL、供应商响应或堆栈。用户 ID 在 JSON 中为字符串，身份来自服务端认证主体；不信任请求体中的用户 ID。

桌面使用邮箱与密码登录，通过 `login.identifier` 传邮箱；管理员账号使用同一字段传账号标识。登录统一从 `auth_identities` 查找身份，显示名称不能用于认证。用户响应含 `displayName`、`role` 与可空的 `email`。显示名称最长 254 字符且不唯一；邮箱注册时默认等于规范化邮箱。注册只建立已验证邮箱身份，不把历史用户名自动认定为已验证邮箱，也不授予管理员角色。验证码只保存带独立密钥的摘要；有效期、重发间隔、尝试次数及单次消费由服务端校验。SMTP 发送在数据库事务之外执行，成功投递后才允许消费验证码；注册与用户/token 创建在同一事务内完成。邮件服务未配置、禁用或部署密钥缺失时返回安全的不可用错误。

业务 token 是 32 字节密码学随机数，以 Base64URL 编码。数据库只存 SHA-256 摘要和过期/撤销状态；密码使用 BCrypt。没有 JWT 自签名秘密，也不会生成 Spring 默认用户名密码。客户端应将业务 token 放系统安全存储，不当作供应商 Key 使用。

HTTP 请求正文最多 1 MiB，同时验证 Content-Length 和实际读取字节数，覆盖 chunked 请求。登录和邮箱 IP 限流使用 `getRemoteAddr()`，直接启动默认不信任转发头。`deploy/server/compose.yaml` 的私有后端启用 Tomcat 原生转发头处理，公网 Nginx 用 `$remote_addr` 覆盖客户端传入的 `X-Forwarded-For`，避免所有用户共用代理 IP 的限额或伪造 IP 绕过限流。该配置要求后端端口不直接对公网开放；增加 CDN/代理时需重新确定可信代理边界。首版 IP 限流为进程内资源保护，多实例需要共享限流实现。

## 管理接口

`/api/v1/admin/**` 额外要求服务端验证的 `ADMIN` 角色。角色来自数据库，每次 Bearer 认证重新读取；Web 后台不自行授予角色。浏览器端采用当前标签页会话存储的 Bearer，刷新后验证管理员权限，无 cookie 登录；同源代理，不开放任意来源 CORS。

| 方法 / 路径（前缀 `/api/v1/admin`） | 用途 |
| --- | --- |
| `GET /me` | 当前管理员身份 |
| `GET /users` / `POST /users` | 分页查询或创建普通用户 |
| `PUT /users/{id}` | 启用/停用、修改回答与检索日额度 |
| `POST /users/{id}/password` | 重置密码并撤销已有登录 |
| `POST /users/{id}/revoke-tokens` | 撤销该用户所有 token 的后续访问 |
| `GET /config` / `PUT /config` | 读取脱敏配置、带版本发布完整配置 |
| `POST /config/test` | 测试未发布草稿的模型、转写或知识检索连接 |
| `GET /email-config` / `PUT /email-config` | 读取脱敏 SMTP 配置、带版本保存完整邮件配置 |
| `POST /email-config/test` | `{config:邮件配置草稿}`；仅测试连接和认证，不发邮件、不发布配置 |
| `GET /usage` | 按用户/能力/供应商模型/状态分页查询调用记录 |
| `GET /audit` | 分页查询管理员操作记录 |

首次管理员配置：`COPILOT_ADMIN_BOOTSTRAP_USERNAME` / `COPILOT_ADMIN_BOOTSTRAP_PASSWORD`，与普通 bootstrap 使用同样的密码长度限制。与已有普通用户同名时不会提升权限；不要复用普通账号。

平台配置拆分供应商连接（类型、地址、Key）和模型目录（平台 ID、显示名、供应商模型 ID、输出长度、开放状态）。`GET /api/v1/platform` 的 `models.available` 只包含 `{id,name}`；`models.llm` 是默认平台模型 ID，回答请求的 `model` 同样使用该 ID，后端映射实际供应商模型并校验开放状态。

`services` 返回 `{asr:[{id,name}],knowledge:[{id,name}],embedding:[]}`。ASR 与知识库只列出当前启用、已配置 Key 且已绑定模型/Agent 的服务，不公开未绑定供应商、URL 或 Agent ID。当前各自只有一项全局绑定，平台暂不支持向量服务。桌面显式选择后，ASR 使用 `/api/v1/asr?serviceId=<providerId>`，知识库 JSON 增加可选 `serviceId` 并保留 `agent_id=platform`。后端在同一请求配置快照验证 ID；失效或与当前绑定不符时拒绝，不静默改用替代服务。旧客户端省略选择仍可调用当前绑定。

配置整份发布，提交时带 `version`；并发修改返回 409，避免覆盖他人更改。`apiKey` 为只写字段，读取返回 `hasApiKey`，同一供应商省略/空密钥表示保留。修改完整地址或类型时必须重新录入密钥。连接测试不发布配置，失败不改变当前服务。已有回答和 ASR 连接保持启动时快照，新请求采用新版本。

`COPILOT_PLATFORM_MASTER_KEY` 用于 AES-GCM 加密平台 Key 和 SMTP 密码，由部署环境提供并单独备份。主密钥不能与数据库密文放在一起；恢复数据库需要原主密钥。平台从首次启动起只使用数据库配置，未发布和禁用能力都不回退环境配置。

邮件配置为 `{version,enabled,host,port,username,from,startTls,ssl}`，读取额外返回 `hasPassword`，写入可带 `password`。同一连接省略或空密码表示保留；修改主机、端口或用户名且继续认证时必须重新填写密码。用户名留空明确选择无认证 SMTP，保存时清除旧密码；此时密码也必须为空。STARTTLS 与 SSL 互斥，远程 SMTP 必须启用其中一种，仅本机回环允许明文。邮件测试提交完整草稿并校验版本，失败不更改已发布服务，也不回显供应商异常正文。

用户额度可设为 0；未设置覆盖值的历史用户继续使用部署默认。密码重置、停用会撤销已有 token，已建立的流式会话仍允许结束。首版角色由部署 bootstrap 创建，不提供网页提升普通用户为管理员的入口，也不提供用户密码或平台 Key 明文查询。

## 用量记录

`UsageService.start(userId, requestId, capability)` 返回 `UsageLease`，上游成功、失败或取消分别调用 `complete()`、`fail()`、`cancel()`；未终态关闭 lease 记录为取消。状态更新幂等。`requestId` 为 1–128 位字母、数字或 `._:-`。

预占用 PostgreSQL 用户行锁、每日计数和唯一约束完成，跨线程/进程都不能突破单用户次数上限。相同用户、能力与请求 ID 重复提交返回 409，不再次调用供应商；不同用户隔离。按 UTC 日期计数，成功预占后的失败和取消仍计入资源请求次数，不自动退款。ASR 并发也在数据库校验；意外终止的预占到期后可回收，连接仍由平台会话时长限制结束。

这里的每日请求数是防滥用限额，`usage_events` 是执行状态记录，**不是供应商金额、充值余额或正式收费账本**。当前没有支付、套餐收费、退款、短信注册或云端简历同步。没有从未知的供应商输出推算费用。

MyBatis-Plus 用于实体映射和常规 CRUD；额度、请求去重等并发操作用绑定参数 SQL。只在预占阶段持有短事务，整个模型流式输出或语音连接不持有数据库事务。

## 测试

本次邮箱注册、数据库邮件配置与服务目录版本已通过后端全量 190 项测试，随后新增的 1 项 SMTP 大密码真实 PostgreSQL 测试也通过。覆盖管理员权限与并发保护、用户密码/令牌/额度、密钥加密、配置持久化与版本冲突、服务选择及流式快照，以及邮箱验证码生命周期、限流、注册事务和 SMTP 配置。ASR 完成通知在额度终结及会话释放之后发送，慢速写入场景也验证停止后可立即重启。完整平台链路 26/26（含管理端浏览器 7/7）与核心 Electron 回归 42/42 通过；均使用隔离数据库和本机假供应商，本次没有升级正式数据库或更新安装包。

```sh
./mvnw test
# 先构建固定版本数据库镜像；此处命令从 backend/ 执行
docker build -t interview-copilot-postgres:15.19-pgvector0.5.1 ../deploy/postgres
./mvnw clean verify -Pintegration
```

默认运行单元测试。`integration` 额外使用 Testcontainers 启动独立 `interview-copilot-postgres:15.19-pgvector0.5.1` 容器，在启动 Spring 上下文前通过 `psql` 单次事务显式执行 `sql/` 的五份脚本，验证真实初始化、精确数据库/扩展版本、向量距离与 HNSW，以及 token 摘要/过期/撤销、HTTP 鉴权、并发限额、重复请求和用户隔离。需要可用 Docker 且已构建上述镜像；测试不使用真实账号或云端供应商。Docker Desktop 若未自动发现 socket，可设置 `DOCKER_HOST` 为实际 Docker socket。数据库容器由测试管理，不连接桌面应用的真实资料或会话记录。Mac Apple Silicon 开发环境额外激活 `macos-arm64` profile，加载匹配架构的 Netty DNS 模块；生产 Linux 容器不使用这个依赖。

## 发布边界

正式对外必须通过 HTTPS/WSS 入口。平台模型、URL、知识库范围由服务端配置，不能让客户端选择任意地址后附加平台 Key。当前实现是首版商用基础链路，仍需实际供应商账号下的联调、容量测试和多平台客户端发行验收。

Spring Boot 3.5.16 已是 3.5.x 最后一个 OSS 发行；本项目按既定 Java 21 / Boot 3.x 选择构建，长期生产维护需要另行安排补丁与支持。[官方说明](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/)

ASR 连接测试会等待 `task-started`，发送半秒合成静音 PCM（16 kHz、16-bit、单声道），再发 `finish-task`，并要求收到 `task-finished`。不发送音频会被 Paraformer 返回 `NO_VALID_AUDIO_ERROR`，不能用空任务判断服务不可用。测试不使用麦克风或个人录音。

### 资料检索向量模型

管理台配置 `embedding` 提供商及 `embedding: { enabled, providerId, model, dimensions }`，配置和密钥存数据库；不增加 YAML 服务地址。维度范围 64–4096，接口填写完整 `/embeddings` 地址，兼容 OpenAI Embeddings 的 `model`、`input`、`dimensions` 和 `encoding_format: float`。仅回环地址的自部署向量服务可留空 API Key；容器内 `127.0.0.1` 指后端容器本身。

登录用户从 `/api/v1/platform` 的 `services.embedding` 获取 `{id,name,model,dimensions,fingerprint}`，未启用服务不显示。`fingerprint` 仅由接口地址、模型及维度计算，用于配置变更后重建本地向量；不包含密钥。

调用 `POST /api/v1/embeddings`，正文为 `{ "serviceId": "配置的提供商ID", "input": ["待向量化文本"] }`；可附带与目录一致的 `model`、`dimensions` 和 `encoding_format: "float"`。服务端固定使用已选模型和密钥，拒绝覆盖服务地址或选择未启用服务。每次最多 10 段，每段最多 20,000 字符，总计最多 200,000 字符；超时 30 秒，返回仅含已校验的 `data[].index` 和 `data[].embedding`。

第一版每次向量请求（包括建立资料索引的批次和问题向量）占用一次现有“知识检索”日额度，记录所用模型；并发上限为 8。额度用完返回 429，不调用上游；无需额外 SQL 变更。连接测试也验证返回向量维度，但不占用户日额度。

管理台用户列表和调用记录均支持 `query` 参数按显示名称或邮箱搜索（最长 254 字符）。创建账号使用 `{identifier,password,dailyAnswers,dailyKnowledgeQueries}`，建立 `account` 身份并把账号标识作为初始显示名称；登录标识和显示名称是不同职责。
