# 单机部署（复用现有 PostgreSQL）

此目录用于部署已编译的 Java JAR 和管理端静态文件。服务器运行 Java 21 镜像，不需要安装宿主机 JDK。`compose.yaml` 当前按验收需求通过 Nginx 统一开放 HTTP 8080 端口，公网 HTTPS 入口需另外配置。

## 准备发布文件

从仓库根目录执行 Java 21 的 `./backend/mvnw -f backend/pom.xml -P\!macos-arm64 clean verify` 和 `npm --prefix admin run build`。

发布目录包含：本目录中的 Dockerfile、Compose、`.dockerignore`，以及 `backend.jar`（来自 `backend/target/`）、`admin/`（来自 `admin/dist/`）、`nginx.conf`（来自本目录）。不要上传本机 `application-local.yml`、源码凭据或个人资料。

服务器发布目录下的 `.env` 权限设为 600，填写数据库 URL/用户名/密码、平台加密主密钥、邮箱验证码密钥。首次部署可配置管理员 bootstrap 账号密码，创建后移除并重建后端容器。供应商及 SMTP 配置在管理页面保存。

## 数据库与网络

Compose 使用外部网络 `interview-copilot-network`。现有数据库容器应接入该网络，并设置别名 `database`。应用账号只授予业务库所需的表、序列权限，不授予超级用户权限。

空库按照 `backend/sql/README.md` 初始化；已有库先备份并核对结构，不能重复执行初始化脚本。实际查询 PostgreSQL/扩展版本，不以镜像标签代替版本核验。

## 运行

在服务器发布目录执行：

```sh
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail 100 backend
curl -fsS http://127.0.0.1:8080/actuator/health
```

后端设有健康检查、内存限制、自动重启与日志轮转。更新前备份数据库及 `.env`，保留上一个发布产物；不要删除数据库数据卷。加密主密钥必须与备份一起妥善保管。

## 本次服务器验收

服务器：`ubuntu@101.33.245.166`；部署目录：`/home/ubuntu/interview-copilot`。复用 `pgvector-postgres` 容器和 `interview_copilot` 库，新增受限账号 `copilot_backend`。部署前数据库备份在服务器 `backups/before-backend-deploy.dump`。

本机 SSH 隧道：

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 127.0.0.1:18080:127.0.0.1:8080 \
  -L 127.0.0.1:15174:127.0.0.1:5174 ubuntu@101.33.245.166
```

管理端 `http://127.0.0.1:15174`，统一入口 `http://127.0.0.1:18080`。桌面若需连接此验收地址，构建时设置 `COPILOT_PLATFORM_URL=http://127.0.0.1:18080`；现有桌面安装包未改变。

已验证后端健康、管理员登录/退出、管理配置和平台接口。未配置真实 SMTP/模型，因此未验证真实注册邮件、模型回答和语音转写。

待处理：现有 PostgreSQL 为 15.19，但容器提供的 vector 扩展文件实际为 0.8.6，业务库尚未启用扩展；另一个标记 0.5.1 的镜像为 ARM 架构。未启用错误版本，也未替换现有数据库容器。应构建 x86_64 的指定 0.5.1 镜像并另行安排数据库切换。现有数据库 5432 映射所有网卡，需另行确认安全组访问限制。

## IP 地址验收

管理页面和后端统一使用 `http://101.33.245.166:8080`，API 路径保留 `/api/v1/`，健康检查为 `/actuator/health`。公网 5174 请求无法到达服务器，因此使用已验证可达的 8080 作为 Nginx 入口。

Nginx 映射 `0.0.0.0:8080:80`，后端容器通过内部网络访问。宿主机直连后端端口为 `127.0.0.1:18081`，管理页面原回环端口 5174 仍用于 SSH 隧道。没有向公网开放新的数据库端口。

此入口仅供临时 HTTP 验收，正式部署应配置 HTTPS。桌面应用地址未改变。云安全组需允许 TCP 8080。

## 北京时间存储

后端容器设置 `TZ=Asia/Shanghai` 和 JVM 时区；连接池为每条数据库连接设置同一时区。数据库业务时间字段通过 `backend/sql/08_server_local_time.sql` 转为 `TIMESTAMP(6) WITHOUT TIME ZONE`，原数据使用 `AT TIME ZONE 'Asia/Shanghai'` 转换。脚本只设置当前业务库的默认时区，不修改同一个 PostgreSQL 实例的其他数据库。

本次开发阶段按用户要求不做数据库备份：先停止后端，事务执行 08，再发布并启动新版后端。不要重复执行已完成的脚本。确认新连接 `SHOW timezone` 为 `Asia/Shanghai`，业务表不再含带时区时间字段，并验证登录与验证码有效期。历史每日额度日期不回算，新请求按北京时间日期计数。

## 2026-09-13 发布状态

已部署提交 `1057fdd` 的后端和最新管理端。远程 PostgreSQL 15.19 / pgvector 0.8.6 保持原版本；SQL 13、14、15 已按序执行，新表 CRUD 和新增序列使用权限已授予 `copilot_backend`。不要重复执行这些脚本。

公网首页、健康检查、管理员登录及登录后的 `/api/v1/user-preferences`、`/api/v1/background`、`/api/v1/session-records` 均验证成功。部署目录保留 `releases/before-1057fdd` 旧产物与 `*:before-1057fdd` 镜像；供应商、邮件、支付配置和参考资料卷未变更。桌面端须使用最新代码或重新打包；旧桌面开始面试协议不再适用。

## 2026-09-13 单点登录发布

已部署 `13e5fd8` 的后端和管理端，事务执行 SQL 16，旧登录凭证已撤销；不要重复执行。数据库仍为 PostgreSQL 15.19 / pgvector 0.8.6，保留原环境变量、供应商配置与资料卷，按开发阶段约定未备份数据库。

发布产物在 `releases/13e5fd8`，旧产物在 `releases/before-13e5fd8`，旧镜像标签为 `before-13e5fd8`。上传 JAR 与管理端压缩包经过 SHA-256 校验。

公网首页及健康检查成功；通过 SSH 加密转发验证现有部署管理员登录、`/api/v1/auth/session`、`/api/v1/admin/me`、退出后凭证失效，并确认管理端凭证访问桌面偏好接口返回 403。未调用真实模型、发送邮件或创建支付订单。

管理页面刷新后重新登录；桌面必须使用支持 `clientType` 的新版代码或安装包。此次仅部署公网后端和管理端，不替换本地已安装桌面应用。

## 2026-09-13 高级设置授权发布

已部署当前工作区高级设置功能（基于 `5672363` 加暂存改动），发布目录 `releases/advanced-settings-20260913`。已执行 SQL 17，并授予 `copilot_backend` 新表 `desktop_settings` 的 CRUD 权限。数据库版本、现有环境变量、密钥及资料卷不变。

后端健康，公网管理端已更新；管理员登录、新默认配置接口、授权列表、用户查询均验收成功，未登录访问配置返回 401。初始默认服务和授权名单为空，需要管理员在“平台配置 → 桌面高级设置权限”中保存默认回答模型、温度、转写及检索方式，再按需授权用户。

旧产物在 `releases/before-advanced-settings-20260913`，旧镜像标签为 `before-advanced-settings-20260913`。桌面端需运行本地最新代码或重新打包，本次未替换安装包。
