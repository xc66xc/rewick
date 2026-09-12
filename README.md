# Interview Copilot

## 面试时长

登录后先进入“准备面试”：简历必填，岗位 JD 和参考资料选填。点击“开始面试”并获得服务端确认后计时，平台模型和自带 Key 都消耗可用时长。停止转写不会暂停计时，点击“结束面试”才结束；断连超过 30 秒自动结束。

管理员在用户管理中增加、扣除或设定可用时长，并填写调整原因。初始时长为 0；用户也可购买管理员启用的时长套餐，购买时长长期有效。不提供暂停功能。已完成 01–09 的数据库需先执行 `backend/sql/10_time_wallet.sql`，购买套餐还需执行 `backend/sql/11_payment_packages.sql`，随后同步更新服务端与桌面端。

## 购买时长与扫码支付

管理端的“套餐管理”按条保存价格、折扣、时长和启用状态；“支付设置”分别配置、启用微信 Native 与支付宝当面付；“支付订单”显示支付渠道并登记已在对应商户平台完成的人工退款。支付凭据加密入库，客户端无法读取。没有可用渠道时，桌面显示“支付暂未开放”。

桌面侧边栏与准备页提供购买入口，只显示管理员已启用的支付方式。订单保存下单时的渠道、价格和时长，扫码支付后由后端验签、核对金额并幂等增加时长；关闭二维码窗口不取消订单。停用渠道不影响旧订单处理。买时长不会启动或恢复面试，也不会延长已有心跳许可。人工退款登记只扣回明确填写的时长，不自动执行资金退款。

支付宝配置包括 AppID、收款商家 PID、官方正式／沙箱网关、应用私钥（PKCS8）、支付宝公钥和通知地址 `/api/v1/payments/alipay/notify`，使用 RSA2 签名。微信继续使用 `/api/v1/payments/wechat/notify`。真实收款前需取得对应产品权限、配置公网可达回调并完成实际支付验收。支付宝沙箱使用沙箱应用资料。

升级支付宝前手动执行 `backend/sql/12_alipay_payments.sql`，然后同步更新服务端、管理端与桌面端；创建订单现在必传 `paymentMethod`（`wechat` 或 `alipay`）。详细步骤见 [SQL 说明](backend/sql/README.md)。

实时面试辅助桌面应用、Web 管理后台与独立 Java 平台服务。桌面端位于 `frontend/`，管理端位于 `admin/`，服务端位于 `backend/`，分别维护依赖、构建与测试。

```text
interview-copilot/
├── frontend/             Electron + React + TypeScript 客户端
│   ├── src/              窗口、音频采集、交互、文件解析与平台客户端
│   ├── tests/            客户端测试
│   ├── scripts/          构建验收与本机模拟供应商
│   └── package.json
├── admin/                React + TypeScript + Vite 管理后台
│   ├── src/              用户、平台配置、邮件服务、调用记录、操作日志
│   └── package.json
├── backend/              JDK 21 + Spring Boot 3.5 + MyBatis-Plus
│   ├── src/main/java/    controller / service / mapper / entity 等职责包
│   ├── sql/              手动执行的数据库初始化和变更 SQL
│   ├── src/test/
│   ├── pom.xml
│   └── mvnw / mvnw.cmd
├── compose.yaml          本机管理端、后端与 PostgreSQL 开发部署
├── deploy/postgres/      PostgreSQL 15.19 + pgvector 0.8.6 数据库镜像
├── .env.example          仅服务端使用的配置示例
├── dist/                 桌面安装产物，源代码迁移不移动原安装包
└── workspace/            产品与实现记录
```

## 本轮实现边界

用户已指定 JDK 21、Spring Boot 3.x、MyBatis-Plus、PostgreSQL 15.19 和 pgvector 0.8.6。后端基线为 Boot 3.5.16、MyBatis-Plus 3.5.17、Maven Wrapper 3.9.16；数据库 SQL 统一放在 `backend/sql/`，由部署人员手动执行，应用启动不自动修改结构。pgvector 扩展已纳入部署和初始化 SQL，现有远程知识检索继续使用百炼，参考资料由后端统一解析和向量化，存入 pgvector(1024) 并按用户与环境检索。桌面仍保留现有音频采集、编辑转写、合并问题、自动回答、口语回答、简历/JD、多环境和服务器会话记录。

桌面先登录再进入工作台，支持邮箱验证码注册、邮箱密码登录、找回密码与退出。注册发送验证码前检查邮箱是否已注册，已有邮箱提示直接登录或找回密码。找回密码填写邮箱、新密码与确认密码，接收并提交重置验证码后修改密码，成功后重新登录；注册和重置验证码分别校验，重置密码会撤销旧登录凭证。登录后按能力显式选择平台或自定义服务：回答模型、语音转写和远程知识库分别使用独立下拉框；向量服务仅由管理员配置。平台模型 HTTP/SSE、实时语音 WebSocket、向量接口和百炼正文检索经 Java 后端调用。

平台供应商地址、Key、模型和知识库绑定由管理员在后台保存到数据库；SMTP 地址、发件人和认证信息也在后台管理。平台 Key 与 SMTP 密码加密存储，不返回客户端，也没有供应商环境变量回退。用户自定义服务的 Key 与业务登录凭证只在本机加密保存。平台按用户隔离请求与资源，记录调用状态；面试消耗钱包时长，微信套餐购买增加时长，不维护可提现的货币余额。

提示词组装和实时交互在客户端；简历/JD、面试环境、参考资料和正式会话记录保存在服务器。短信/第三方登录、正式签名发布和生产部署留待后续明确产品流程。Intel Mac 与 Windows 的系统音频需要各自实机验证。

## 启动客户端

在根目录执行：

```sh
npm run install:frontend
npm run dev
```

也可以直接在 `frontend/` 下运行 `npm ci` 和 `npm run dev`。原先根目录的 `npm run build`、`npm test`、`npm run test:e2e`、`npm run pack` 仍会转发到客户端。

## 启动独立后端

安装 JDK 21，准备 PostgreSQL 15.19 并在数据库服务器安装 pgvector 0.8.6 扩展文件。先按 [SQL 说明](backend/sql/README.md) 初始化空库，再提供数据库连接、部署密钥与首次管理员配置。项目自带 Maven Wrapper，无需全局安装 Maven，执行：

```sh
npm run backend:dev
```

数据库变量为 `COPILOT_DATABASE_URL`（JDBC URL）、`COPILOT_DATABASE_USERNAME`、`COPILOT_DATABASE_PASSWORD`。部署配置示例见 [.env.example](.env.example)，完整说明见 [backend/README.md](backend/README.md)。`COPILOT_PLATFORM_MASTER_KEY` 用于加密平台 Key 与 SMTP 密码，`COPILOT_EMAIL_CODE_SECRET` 用于验证码摘要；两者分别生成并保存在部署密钥管理中。直接执行 Java/Maven 时不会自动加载根 `.env`，应由运行环境注入。

也可使用 Docker Compose 在本机同时启动服务与数据库：

```sh
cp .env.example .env
# 编辑 .env，设置数据库密码、首次管理员账号、加密主密钥及验证码密钥
docker compose up -d --build --wait database
# 仅首次初始化空库时执行
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/01_schema.sql -f /opt/copilot/sql/02_pgvector.sql -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql -f /opt/copilot/sql/05_email_auth.sql -f /opt/copilot/sql/06_display_name.sql -f /opt/copilot/sql/07_email_code_purpose.sql -f /opt/copilot/sql/08_server_local_time.sql -f /opt/copilot/sql/09_pg_references.sql -f /opt/copilot/sql/10_time_wallet.sql -f /opt/copilot/sql/11_payment_packages.sql -f /opt/copilot/sql/12_alipay_payments.sql
docker compose up -d --build backend admin
```

后端默认仅监听本机映射 `http://127.0.0.1:8080`；数据库没有向宿主机开放端口。管理员尚未发布的能力保持不可用，不会使用内置平台 Key 或旧环境配置。注册需先在管理后台启用并保存邮件服务；运行环境可设 `COPILOT_EMAIL_REGISTRATION_ENABLED=false` 应急关闭验证码发送和注册，已有账号仍可登录。首次账号密码至少 12 字符且最多 72 个 UTF-8 字节；账号创建后从部署配置移除 bootstrap 凭据。正式跨设备使用时为后端配置 HTTPS 入口及 SSE/WebSocket 转发。

Compose 从固定 PostgreSQL 15.19 镜像构建 pgvector 0.8.6，使用新的 `database-pg15-data` 卷。已有 PostgreSQL 17 数据卷保留，不能直接交给 PostgreSQL 15 使用。`backend/sql/` 仅只读挂载到数据库容器，不自动执行。已有业务表的数据库不重复初始化；托管数据库应由管理员准备扩展并执行相应 SQL，详见 [SQL 说明](backend/sql/README.md)。

Dockerfile 使用 JDK 21 构建、JRE 21 运行，并以非 root 用户启动。正式发布时通过构建参数固定经过验收的镜像摘要；本机开发配置未宣称具备生产高可用。

## 启动管理后台

已完成 `01`–`04` 的数据库，本次只手动执行 `05_email_auth.sql`；更早版本按 [升级命令](backend/sql/README.md) 补齐新增脚本，不重复执行 `01`。配置以下服务端环境变量后启动后端：

- `COPILOT_ADMIN_BOOTSTRAP_USERNAME` / `COPILOT_ADMIN_BOOTSTRAP_PASSWORD`：首次管理员，密码至少 12 字符且不超过 72 个 UTF-8 字节；使用与普通用户不同的用户名。创建后移除 bootstrap 凭据。
- `COPILOT_PLATFORM_MASTER_KEY`：执行 `openssl rand -base64 32` 生成，保存到本机忽略的配置或部署密钥管理中。用于加密数据库中的平台 Key 和 SMTP 密码，必须备份，后续重启继续使用同一值。
- `COPILOT_EMAIL_CODE_SECRET`：独立执行 `openssl rand -base64 32` 生成，用于验证码摘要；不与主密钥共用，不放入数据库或客户端。

管理端使用独立终端启动：

```sh
npm run install:admin
npm run admin:dev
```

打开 `http://127.0.0.1:5174`，使用首次管理员账号登录。开发时 `/api` 默认代理到 `http://127.0.0.1:8080`，更改后端端口可设置 `COPILOT_ADMIN_PROXY_TARGET`。Compose 启动 `admin` 时也使用 5174（可由 `COPILOT_ADMIN_PORT` 调整），通过同源代理访问后端。

管理后台支持管理员登录、普通用户创建/搜索/启停/额度调整/密码重置/撤销登录、供应商与模型目录配置、转写和百炼知识库启停与连接测试、SMTP 邮件服务、调用记录和操作日志。后台发布开放的模型和当前绑定的转写/知识库服务，桌面用户自行选择。配置按版本保存，旧版本修改返回冲突；新请求读取最新配置，正在进行的回答和转写保留启动时配置。

管理端登录凭证保存在当前标签页会话存储中，刷新时重新校验管理员权限；退出或过期后清除。平台 Key 和 SMTP 密码只显示是否配置，不返回原文；用户自定义 Key 由桌面设备管理。所有平台服务与 SMTP 连接均以数据库为准，未发布或停用不会回退环境配置。供应商地址或类型变更时必须重新录入 Key；SMTP 主机、端口或用户名改变时须重填密码。邮件连接测试只验证连接与认证，不发送邮件、不保存草稿。

更多界面说明与构建方式见 [admin/README.md](admin/README.md)。普通用户无权访问任何管理接口；禁用用户和撤销登录阻止后续请求，已经开始的回答/转写允许完成。

## 客户端使用平台服务

1. 首次打开显示登录页。后台地址在构建时由 `COPILOT_PLATFORM_URL` 指定，开发默认 `http://127.0.0.1:8080`，登录页不提供地址输入；选择「注册账号」，通过邮箱验证码设置密码，或使用已有邮箱与密码登录。
2. 登录后打开「模型与设置」。回答、转写、远程知识库分别在下拉框中按「平台提供」和「我的自定义」分组，显式选择后保存。平台未提供的类型显示不可用；资料向量化和检索统一使用平台 Key，桌面不配置向量服务。
3. 选择「+ 自定义模型/服务…」填写名称、地址、模型或 Agent ID 与自己的 Key。可以先测试草稿，再「保存并选用」；测试不会保存。自定义配置可编辑或删除，本机无需 Key 的模型也可作为自定义服务使用。
4. 服务下架、删除或连接失败不会静默切换到其他服务；平台转写和知识库只公开已绑定的可用服务。开启远程知识库后只检索所选远程服务；普通检索失败会标记降级并继续回答，不回退本地检索。所选平台服务失效需重新选择。

平台地址改变后需重新登录。平台供应商 Key 不出现在设置、模型输入快照、错误或桌面包中。

## 验证

本次邮箱注册与服务选择改动已通过 379 项客户端测试、20 项管理端组件测试、后端全量 190 项及随后新增的 1 项 SMTP 大密码真实 PostgreSQL 测试。核心 Electron 回归 42/42、完整平台链路 26/26 和其中管理端浏览器操作 7/7 通过，使用隔离 PostgreSQL 15.19 / pgvector 0.8.6 与本机假供应商、SMTP。管理端生产构建和邮件页桌面/移动浏览器检查也通过。管理端验证方式见 [测试说明](admin/README.md#真实浏览器验证)。

此前管理后台版本曾通过 42 项核心 Electron 回归和 23 项完整平台链路检查（含管理端浏览器 6 组操作）；这些历史结果不替代本轮新增功能的最终验收。

本轮没有更新安装中的桌面应用或升级正式数据库。原 0.4.0 安装包的 PDF/SQLite、签名及更新后界面验收属于此前版本，见 [历史实现记录](workspace/interview-copilot/notes/impl-backend-separation.md)。

```sh
npm test
npm run build
npm run test:e2e
npm run backend:test
npm run admin:test
npm run admin:build
# 包含需要 Docker 的真实 PostgreSQL 集成测试
docker build -t interview-copilot-postgres:15.19-pgvector0.8.6 deploy/postgres
node scripts/backend.mjs verify -Pintegration
# 完整桌面/管理端 → Java → 本机模拟供应商，先安装两个前端包并构建桌面
npm run backend:build
node admin/node_modules/playwright/cli.js install chromium --only-shell
npm --prefix frontend run test:platform
```

平台 smoke 使用隔离临时数据库、临时桌面数据目录和本机假供应商，结束后清理测试容器和临时数据，不使用真实供应商或个人资料。测试结果与截图分别写入 `frontend/test-results/` 和 `admin/test-results/`。覆盖后台权限、用户管理、三类服务测试与发布、模型上下架、正在运行的请求保留旧配置，以及 Web 管理页面的真实操作。

客户端详细功能及历史验收见 [frontend/README.md](frontend/README.md)；本轮方案见 [独立后端设计](workspace/interview-copilot/notes/design-backend-separation.md)。Boot 3.5.x 的官方 OSS 支持已结束，商用上线需确定持续安全维护来源，见 [技术栈与版本依据](workspace/interview-copilot/notes/planned-commercial-tech-stack.md)。

### 桌面账户数据隔离

简历、岗位 JD、面试环境、默认环境、参考资料及索引、正式会话历史按登录用户 ID 保存在服务器 PostgreSQL，可在不同设备读取。自定义服务凭据、桌面偏好及加密的待同步会话草稿留在本机账户目录。退出登录或切换账户会清空界面状态并停止旧任务；旧账户发出的延迟操作不会写入新账户。

开发阶段不兼容旧公共数据：不再读取或迁移原根目录中的设置、环境、资料库和历史记录，首次使用新版需重新登录并录入资料。旧文件不会自动删除。

验证：先运行 `npm --prefix frontend run build`，再运行 `npm --prefix frontend run test:accounts`；使用临时用户目录、两个测试账户和本机假后端，覆盖账户切换、重新登录、同一用户更换平台地址后资料保持不变及过期请求隔离。

### 用户展示名称与登录身份

`app_users.display_name` 用于展示，不唯一、不参与登录；邮箱注册时复制规范化邮箱。登录标识独立保存在 `auth_identities`，当前支持邮箱身份和管理员/后台创建账号的 `account` 身份，尚未实现手机号注册登录。接口使用 `displayName`，登录请求使用 `identifier`。

已有数据库按 `backend/sql/06_display_name.sql` 升级：停止旧后端，在事务中执行脚本，然后启动新后端和管理端。脚本保留用户 ID，把已有邮箱复制到显示名称，将原账号登录标识移入身份表，最后删除 `username`。桌面端更新后需要重新登录，按用户 ID 保存的资料和面试环境不变。

邮箱找回密码版本还需执行 `backend/sql/07_email_code_purpose.sql`，将注册和密码重置验证码按用途分别保存。已执行至 06 的数据库只追加 07；先备份并停止旧后端，再使用 `psql -v ON_ERROR_STOP=1 --single-transaction` 执行脚本并发布新版后端。桌面开发进程需重新启动，已安装桌面应用需重新打包更新。

数据库时间统一使用北京时间的 `TIMESTAMP(6) WITHOUT TIME ZONE`，Java 持久层使用 `LocalDateTime`，每日额度按北京时间零点划分。已有 01–07 数据库停服务后手动执行 `backend/sql/08_server_local_time.sql`，再启动新版后端；当前开发阶段按约定直接执行，不做数据库备份。脚本把原时间转换到 `Asia/Shanghai`，设置当前业务库时区，并保留微秒精度。接口里的登录过期时间仍带明确时区，避免不同时区客户端误判；历史 `usage_day` 日期不重算。

### 服务器会话记录

新版本会话记录通过登录账号保存到 PostgreSQL，历史列表按每页 20 条读取，正文在打开详情时获取。旧本地 `history.json` 不迁移、不再读取。Markdown 导出不修改历史记录。

更新后端前手动执行 `backend/sql/13_session_records.sql`，并确保运行角色可访问新表和序列。无需 Redis。数据库会话时间沿用北京时间；记录关联计时面试，删除记录不改变钱包余额或计时账本。

桌面每 15 秒及回答/编辑完成时保存，先用系统加密能力将待上传正文写入账号工作区的 `history-outbox.enc.json`，上传成功后清除该正文。断网保留草稿，恢复原账号登录后重试；工作台底部显示同步状态。尚未成功写入草稿的内容在强制终止进程时仍可能丢失。

## 个人背景服务器存储

简历、岗位 JD 与面试环境通过 `/api/v1/background` 保存。列表返回摘要及默认环境所需正文，其他简历/JD 在选中编辑时加载；保存失败保留内存草稿，不自动离线同步。PDF/TXT/MD 仍由桌面提取文字，确认保存后上传正文；不存原始 PDF、不调用向量模型。创建使用幂等标识，修改检查版本，被环境引用的简历/岗位不可删除。

开始面试明确提交所选环境 ID，后端验证非空简历及资料归属/就绪状态，通过后创建计时会话并固定背景快照。其他设备的后续编辑仅影响下次面试。旧 `interviews.json` 不读取、不迁移，需重新录入；旧文件不自动删除。

部署前手动执行 `backend/sql/14_server_background.sql`（依赖 01–13），授权应用账号新增表 CRUD，再同步更新后端与桌面。详细接口与验证见 [实现记录](workspace/interview-copilot/notes/impl-server-background.md)。

## 云端用户设置

回答风格、温度、转写断句时长、自动回答开关与停顿时间、两类检索开关，以及平台回答/转写/知识库服务选择保存在 PostgreSQL `user_preferences`，随登录账号跨设备读取。设置窗口保存携带版本，冲突保留草稿；“重新读取云端设置”经确认后替换未保存草稿，“刷新平台服务”仅刷新目录并保留草稿。已下架选择标记失效，禁止静默替换。

自定义服务及加密 Key 仍在本机；选择自定义服务仅覆盖该电脑，不改变账号为其他设备保存的平台选择。本机账号设置文件不再保存云端偏好和平台选择。登录 Token、记住的账号密码、待同步会话及运行时缓存继续保留在本地。云端设置不做离线自动保存；断网保留窗口草稿，重试使用相同幂等标识。

升级脚本为 `backend/sql/15_user_preferences.sql`（依赖 01–14），执行后更新后端与桌面。首次使用云端默认设置，不自动迁移旧本机偏好。本轮仅完成本地实施，没有部署公网。
