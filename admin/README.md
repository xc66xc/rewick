# Interview Copilot 管理端

独立 React Web 管理端，连接同源 `/api/v1` 后端。使用与桌面端一致的已锁版本：React 19.2.8、TypeScript 5.9.3、Vite 7.3.6。依赖与锁文件独立。

## 本地开发

```sh
cd admin
npm ci
COPILOT_ADMIN_PROXY_TARGET=http://127.0.0.1:8080 npm run dev
```

默认访问 `http://127.0.0.1:5174`。`COPILOT_ADMIN_PROXY_TARGET` 只供 Vite 的 Node 配置使用，不注入页面。后端需按根目录部署说明配置 bootstrap 管理员并执行管理端 SQL；没有默认管理密码。

```sh
npm test
npm run build
```

`npm run preview` 只预览静态构建（端口 4174），不提供开发 API 代理。生产使用下述 Nginx 同源代理。

## 登录和操作

- 登录后再次请求 `/admin/me`，仅 ADMIN 可进入。Bearer 仅保存在内存，刷新需重新登录；401 会清除本地会话。密码提交后清空，不存到浏览器存储。
- 用户管理支持搜索、分页、创建、启停、每日回答/检索额度、密码重置及撤销全部登录。额度 0 表示不允许新请求。禁用和重置会撤销登录；已经建立的流式会话本版允许结束。新建账号固定 USER。
- 配置包含供应商连接、开放模型目录、默认模型、ASR 和百炼知识库。模型的平台 ID 自动生成且保持稳定，显示名称供客户端选择。供应商 URL / 类型改变时必须重新录入密钥。
- 连接测试提交当前草稿，不发布配置；测试和保存失败保留草稿。Key 只保存在当前编辑页面内存，发布成功、离开配置页或退出登录后清除。GET 从不回显密钥。普通草稿在本次登录的页面导航间保留。
- 配置整体发布并校验版本。409 保留本地草稿，可在核对后选择“重新加载配置”；确认后才丢弃草稿。删除有引用的服务或默认模型前，须先清理引用。发布影响后续新请求，现有 SSE / ASR 使用开始时的配置。
- 调用记录支持用户 ID、能力、状态、模型筛选和分页；操作日志记录操作者、动作、目标及时间。不展示请求或回答正文，不提供费用账单。

## Docker

根目录 Compose 可使用 `build.context: ./admin`，容器端口 80。`nginx.conf` 将 `/api/` 代理到 `http://backend:8080`，关闭缓冲以支持 SSE。页面不需要供应商密钥环境变量。公网部署由外层网关终止 HTTPS；默认开发和 Compose 端口绑定本机。

## 真实浏览器验证

2026-09-08 已通过 11 项组件测试、生产构建，以及隔离真实后端上的 6 组浏览器操作；页面无运行错误。该浏览器检查包含在完整平台联调的 23 项检查中。管理端 Nginx 镜像构建及实际容器登录页检查也通过。

```sh
COPILOT_ADMIN_URL=http://127.0.0.1:5174 \
COPILOT_ADMIN_USERNAME=隔离管理员 \
COPILOT_ADMIN_PASSWORD=隔离管理员密码 \
COPILOT_ADMIN_SMOKE_OUTPUT=test-results/smoke \
npm run test:smoke
```

脚本只用于隔离测试后端，会创建 `admin-smoke-*` 用户、编辑平台配置并执行已启用能力的真实测试接口，需使用本机假供应商。成功或失败清理阶段会尽力将平台配置恢复为起始内容（采用最新版本号），并停用自己创建的测试用户；不会改动其他用户。截图与报告仅包含隔离测试数据。

也可导入 `scripts/smoke.mjs` 的 `runAdminSmoke({baseUrl,username,password,output})`。脚本不会启动或关闭后端、修改环境变量配置、读取生产凭据；由上层集成脚本管理隔离后端和 Vite 进程。浏览器需安装对应 Playwright Chromium。

根目录执行 `npm --prefix frontend run test:platform` 可自动启动隔离数据库、Java 后端和管理端，联测桌面自选模型与管理页面。需先安装两个前端包、构建桌面及后端，并准备数据库镜像，参见根 README。

生产静态页面另通过实际 Nginx 镜像验证登录渲染、CSP、缓存及安全响应头：

```sh
# 在项目根目录执行，不使用真实账号或供应商
docker build -t interview-copilot-admin:local admin
npm --prefix admin run test:static
```

该检查使用并清理自己的临时容器，不执行登录或调用供应商。
