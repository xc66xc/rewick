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
