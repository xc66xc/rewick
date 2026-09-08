# Interview Copilot

实时面试辅助桌面应用与独立 Java 平台服务。客户端源代码位于 `frontend/`，服务端位于 `backend/`，分别维护依赖、构建与测试。

```text
interview-copilot/
├── frontend/             Electron + React + TypeScript 客户端
│   ├── src/              窗口、音频采集、交互、本地资料与平台客户端
│   ├── tests/            客户端测试
│   ├── scripts/          构建验收与本机模拟供应商
│   └── package.json
├── backend/              JDK 21 + Spring Boot 3.5 + MyBatis-Plus
│   ├── src/main/java/    auth / usage / ai / asr / knowledge
│   ├── src/main/resources/db/migration/
│   ├── src/test/
│   ├── pom.xml
│   └── mvnw / mvnw.cmd
├── compose.yaml          本机后端与 PostgreSQL 开发部署
├── .env.example          仅服务端使用的配置示例
├── dist/                 桌面安装产物，源代码迁移不移动原安装包
└── workspace/            产品与实现记录
```

## 本轮实现边界

用户已指定 JDK 21、Spring Boot 3.x、MyBatis-Plus。后端基线为 Boot 3.5.16、MyBatis-Plus 3.5.17、Maven Wrapper 3.9.16；数据库采用 PostgreSQL 17.11 和 Flyway。桌面仍保留现有音频采集、编辑转写、合并问题、自动回答、口语回答、简历/JD、多环境和本地记录。

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

安装 JDK 21，准备 PostgreSQL；项目自带 Maven Wrapper，无需全局安装 Maven。在环境变量中提供数据库连接与可选的平台服务配置，再执行：

```sh
npm run backend:dev
```

数据库变量为 `COPILOT_DATABASE_URL`（JDBC URL）、`COPILOT_DATABASE_USERNAME`、`COPILOT_DATABASE_PASSWORD`。平台供应商变量参考 [.env.example](.env.example)，完整说明见 [backend/README.md](backend/README.md)。直接执行 Java/Maven 时不会自动加载根 `.env`，应由运行环境注入。

也可使用 Docker Compose 在本机同时启动服务与数据库：

```sh
cp .env.example .env
# 编辑 .env，设置数据库密码、首次账号及需要开通的供应商服务
docker compose up -d --build
```

后端默认仅监听本机映射 `http://127.0.0.1:8080`；数据库没有向宿主机开放端口。未配置某项供应商能力时该能力不可用，不会出现内置平台 Key。首次账号密码至少 12 字符且最多 72 个 UTF-8 字节；账号创建后从部署配置移除 bootstrap 凭据。正式跨设备使用时为后端配置 HTTPS 入口及 SSE/WebSocket 转发。

Dockerfile 使用 JDK 21 构建、JRE 21 运行，并以非 root 用户启动。正式发布时通过构建参数固定经过验收的镜像摘要；本机开发配置未宣称具备生产高可用。

## 客户端使用平台服务

1. 打开「模型与设置」，启用平台服务，填写后端地址并登录平台账号。
2. 每项能力有自带 Key 时继续直连自己的服务；无自带 Key 时使用已开通的平台能力。本机无 Key 模型仍在本机访问。
3. 需要从自带 Key 切换时点击对应清除按钮，再保存设置。Key 失效时不会自动切换到平台。
4. 开启远程知识库后只进行远程检索。平台知识库不要求客户端填写供应商地址或 Agent ID；检索失败会标记降级并继续回答，不回退本地检索。

平台地址改变后需重新登录。平台供应商 Key 不出现在设置、模型输入快照、错误或桌面包中。

## 验证

0.4.0 已通过 352 项客户端测试、49 项后端测试（含 PostgreSQL 集成）、42 项原有 Electron 回归和 11 项本地平台链路检查；macOS arm64 安装包、PDF/SQLite、签名及更新后界面验收通过。Docker 镜像构建与 Compose 配置校验通过，未启动正式服务或调用真实供应商。详细结果见 [实现记录](workspace/interview-copilot/notes/impl-backend-separation.md)。

```sh
npm test
npm run build
npm run test:e2e
npm run backend:test
# 包含需要 Docker 的真实 PostgreSQL 集成测试
node scripts/backend.mjs verify -Pintegration
# 完整 Electron → Java → 本机模拟供应商，需要先构建前后端和启动 Docker
npm run backend:build
npm --prefix frontend run test:platform
```

平台 smoke 使用隔离临时数据库、临时桌面数据目录和本机假供应商，结束后清理测试容器和临时数据，不使用真实供应商或个人资料。测试结果与截图写入 `frontend/test-results/`。

客户端详细功能及历史验收见 [frontend/README.md](frontend/README.md)；本轮方案见 [独立后端设计](workspace/interview-copilot/notes/design-backend-separation.md)。Boot 3.5.x 的官方 OSS 支持已结束，商用上线需确定持续安全维护来源，见 [技术栈与版本依据](workspace/interview-copilot/notes/planned-commercial-tech-stack.md)。
