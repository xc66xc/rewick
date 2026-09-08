# Interview Copilot

实时面试辅助桌面应用、Web 管理后台与独立 Java 平台服务。桌面端位于 `frontend/`，管理端位于 `admin/`，服务端位于 `backend/`，分别维护依赖、构建与测试。

```text
interview-copilot/
├── frontend/             Electron + React + TypeScript 客户端
│   ├── src/              窗口、音频采集、交互、本地资料与平台客户端
│   ├── tests/            客户端测试
│   ├── scripts/          构建验收与本机模拟供应商
│   └── package.json
├── admin/                React + TypeScript + Vite 管理后台
│   ├── src/              用户、平台配置、调用记录、操作日志
│   └── package.json
├── backend/              JDK 21 + Spring Boot 3.5 + MyBatis-Plus
│   ├── src/main/java/    auth / admin / platform / usage / ai / asr / knowledge
│   ├── sql/              手动执行的数据库初始化和变更 SQL
│   ├── src/test/
│   ├── pom.xml
│   └── mvnw / mvnw.cmd
├── compose.yaml          本机管理端、后端与 PostgreSQL 开发部署
├── deploy/postgres/      PostgreSQL 15.19 + pgvector 0.5.1 数据库镜像
├── .env.example          仅服务端使用的配置示例
├── dist/                 桌面安装产物，源代码迁移不移动原安装包
└── workspace/            产品与实现记录
```

## 本轮实现边界

用户已指定 JDK 21、Spring Boot 3.x、MyBatis-Plus、PostgreSQL 15.19 和 pgvector 0.5.1。后端基线为 Boot 3.5.16、MyBatis-Plus 3.5.17、Maven Wrapper 3.9.16；数据库 SQL 统一放在 `backend/sql/`，由部署人员手动执行，应用启动不自动修改结构。pgvector 扩展已纳入部署和初始化 SQL，现有远程知识检索继续使用百炼，尚未加入服务端资料向量化或向量检索业务。桌面仍保留现有音频采集、编辑转写、合并问题、自动回答、口语回答、简历/JD、多环境和本地记录。

平台能力通过独立后端调用：账号登录与退出、公开能力查询、模型 HTTP/SSE 转发、实时语音 WebSocket 中转、百炼正文检索。供应商 Key 仅配置在服务端；客户端只保存加密业务登录凭证。按用户隔离请求与资源额度，记录调用状态；目前的次数限制用于资源保护，未实现支付和货币扣费。

提示词、简历/JD 选择、本地资料与会话仍在客户端。资料云同步、公开注册、短信/第三方登录、支付套餐、正式签名发布和生产部署留待后续明确产品流程。Intel Mac 与 Windows 的系统音频需要各自实机验证。

## 启动客户端

在根目录执行：

```sh
npm run install:frontend
npm run dev
```

也可以直接在 `frontend/` 下运行 `npm ci` 和 `npm run dev`。原先根目录的 `npm run build`、`npm test`、`npm run test:e2e`、`npm run pack` 仍会转发到客户端。

## 启动独立后端

安装 JDK 21，准备 PostgreSQL 15.19 并在数据库服务器安装 pgvector 0.5.1 扩展文件。先按 [SQL 说明](backend/sql/README.md) 初始化空库，再提供数据库连接与可选的平台服务环境变量。项目自带 Maven Wrapper，无需全局安装 Maven，执行：

```sh
npm run backend:dev
```

数据库变量为 `COPILOT_DATABASE_URL`（JDBC URL）、`COPILOT_DATABASE_USERNAME`、`COPILOT_DATABASE_PASSWORD`。平台供应商变量参考 [.env.example](.env.example)，完整说明见 [backend/README.md](backend/README.md)。直接执行 Java/Maven 时不会自动加载根 `.env`，应由运行环境注入。

也可使用 Docker Compose 在本机同时启动服务与数据库：

```sh
cp .env.example .env
# 编辑 .env，设置数据库密码、首次管理员账号和加密主密钥
docker compose up -d --build --wait database
# 仅首次初始化空库时执行
docker compose exec -T database psql -X -U copilot -d interview_copilot -v ON_ERROR_STOP=1 --single-transaction -f /opt/copilot/sql/01_schema.sql -f /opt/copilot/sql/02_pgvector.sql -f /opt/copilot/sql/03_admin_users.sql -f /opt/copilot/sql/04_platform_config.sql
docker compose up -d --build backend admin
```

后端默认仅监听本机映射 `http://127.0.0.1:8080`；数据库没有向宿主机开放端口。未配置某项供应商能力时该能力不可用，不会出现内置平台 Key。首次账号密码至少 12 字符且最多 72 个 UTF-8 字节；账号创建后从部署配置移除 bootstrap 凭据。正式跨设备使用时为后端配置 HTTPS 入口及 SSE/WebSocket 转发。

Compose 从固定 PostgreSQL 15.19 镜像构建 pgvector 0.5.1，使用新的 `database-pg15-data` 卷。已有 PostgreSQL 17 数据卷保留，不能直接交给 PostgreSQL 15 使用。`backend/sql/` 仅只读挂载到数据库容器，不自动执行。已有业务表的数据库不重复初始化；托管数据库应由管理员准备扩展并执行相应 SQL，详见 [SQL 说明](backend/sql/README.md)。

Dockerfile 使用 JDK 21 构建、JRE 21 运行，并以非 root 用户启动。正式发布时通过构建参数固定经过验收的镜像摘要；本机开发配置未宣称具备生产高可用。

## 启动管理后台

已有数据库先执行新增的 `03_admin_users.sql`、`04_platform_config.sql`，不重复执行 `01`，详见 [升级命令](backend/sql/README.md)。配置以下服务端环境变量后启动后端：

- `COPILOT_ADMIN_BOOTSTRAP_USERNAME` / `COPILOT_ADMIN_BOOTSTRAP_PASSWORD`：首次管理员，密码至少 12 字符且不超过 72 个 UTF-8 字节；使用与普通用户不同的用户名。创建后移除 bootstrap 凭据。
- `COPILOT_PLATFORM_MASTER_KEY`：执行 `openssl rand -base64 32` 生成，保存到本机忽略的配置或部署密钥管理中。用于加密数据库中的平台 Key，必须备份，后续重启继续使用同一值。

管理端使用独立终端启动：

```sh
npm run install:admin
npm run admin:dev
```

打开 `http://127.0.0.1:5174`，使用首次管理员账号登录。开发时 `/api` 默认代理到 `http://127.0.0.1:8080`，更改后端端口可设置 `COPILOT_ADMIN_PROXY_TARGET`。Compose 启动 `admin` 时也使用 5174（可由 `COPILOT_ADMIN_PORT` 调整），通过同源代理访问后端。

管理后台支持管理员登录、普通用户创建/搜索/启停/额度调整/密码重置/撤销登录、供应商与模型目录配置、转写和百炼知识库启停与连接测试、调用记录和操作日志。后台发布开放的模型列表，桌面用户自行选择平台回答模型。配置按版本保存，旧版本修改返回冲突；新请求读取最新配置，正在进行的回答和转写保留启动时配置。

管理端登录凭证只存浏览器内存，刷新需重新登录。平台 Key 录入后只显示是否配置，不返回原文；用户自带 Key 仍由桌面设备管理。首次发布配置前兼容原环境变量中的供应商配置，发布后以数据库配置为准，禁用能力不会退回旧环境变量。供应商地址或类型变更时必须重新录入 Key，避免把原密钥带到新地址。

更多界面说明与构建方式见 [admin/README.md](admin/README.md)。普通用户无权访问任何管理接口；禁用用户和撤销登录阻止后续请求，已经开始的回答/转写允许完成。

## 客户端使用平台服务

1. 打开「模型与设置」，启用平台服务，填写后端地址并登录平台账号。从「平台回答模型」选择后台开放的模型，或使用平台默认模型，再保存设置。模型下架后提示重新选择，不会静默更换模型。
2. 每项能力有自带 Key 时继续直连自己的服务；无自带 Key 时使用已开通的平台能力。本机无 Key 模型仍在本机访问。
3. 需要从自带 Key 切换时点击对应清除按钮，再保存设置。Key 失效时不会自动切换到平台。
4. 开启远程知识库后只进行远程检索。平台知识库不要求客户端填写供应商地址或 Agent ID；检索失败会标记降级并继续回答，不回退本地检索。

平台地址改变后需重新登录。平台供应商 Key 不出现在设置、模型输入快照、错误或桌面包中。

## 验证

本轮管理后台已通过 357 项客户端测试、11 项管理端组件测试、112 项后端测试（含 PostgreSQL 15.19 / pgvector 0.5.1 集成）、42 项原有 Electron 回归，以及 23 项完整平台链路检查（包含管理端浏览器 6 组操作）。两个前端生产构建、管理端和后端 Docker 镜像构建、Compose 配置校验及 Nginx 实际页面检查通过。管理端验证方式见 [测试说明](admin/README.md#真实浏览器验证)。

本轮未覆盖安装中的桌面应用或升级正式数据库。原 0.4.0 安装包的 PDF/SQLite、签名及更新后界面验收属于此前版本，见 [历史实现记录](workspace/interview-copilot/notes/impl-backend-separation.md)。

```sh
npm test
npm run build
npm run test:e2e
npm run backend:test
npm run admin:test
npm run admin:build
# 包含需要 Docker 的真实 PostgreSQL 集成测试
docker build -t interview-copilot-postgres:15.19-pgvector0.5.1 deploy/postgres
node scripts/backend.mjs verify -Pintegration
# 完整桌面/管理端 → Java → 本机模拟供应商，先安装两个前端包并构建桌面
npm run backend:build
node admin/node_modules/playwright/cli.js install chromium --only-shell
npm --prefix frontend run test:platform
```

平台 smoke 使用隔离临时数据库、临时桌面数据目录和本机假供应商，结束后清理测试容器和临时数据，不使用真实供应商或个人资料。测试结果与截图分别写入 `frontend/test-results/` 和 `admin/test-results/`。覆盖后台权限、用户管理、三类服务测试与发布、模型上下架、正在运行的请求保留旧配置，以及 Web 管理页面的真实操作。

客户端详细功能及历史验收见 [frontend/README.md](frontend/README.md)；本轮方案见 [独立后端设计](workspace/interview-copilot/notes/design-backend-separation.md)。Boot 3.5.x 的官方 OSS 支持已结束，商用上线需确定持续安全维护来源，见 [技术栈与版本依据](workspace/interview-copilot/notes/planned-commercial-tech-stack.md)。
