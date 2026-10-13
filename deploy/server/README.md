# 单机部署（复用现有 PostgreSQL）

## 2026-10-13 Tavily 摘要选项发布

管理端新增「包含摘要答案」none/basic/advanced，搜索深度与摘要分别配置，默认none。none映射上游false，其他映射同名字符串；配置仍数据库加密管理，无YML。摘要追加到网页后，标记generatedSummary=true、无URL且明确非网页原文；不占网页topK，与网页共享8000字符预算。新桌面源码已适配类型/校验/资料展示/Prompt及历史、Excel，使用摘要时需运行最新桌面代码，旧安装包需另行更新。

后端387项单元/架构及572项数据库集成全套、管理端78项和Chromium交互验证通过；桌面59项相关测试及生产构建通过，全量638通过/1项已知购买页文案断言失败。部署后端JAR SHA256 `094a4689bd2dc2e22cfc23e468afa2ba6d05c69cf5c936d1dd282e9a35946454`、管理JS `index-CAyyN4cj.js`，后端healthy、服务器HTTPS健康UP/管理资源200。真实管理草稿连接测试none1270ms、basic904ms、advanced3208ms均成功；已发布配置不变，仍none，临时维护凭证已撤销，无SQL迁移。

回滚材料 `releases/tavily-summary-20261013/` 保存旧JAR/管理构建与运行静态/数据库dump/原platform_config单行SQL；旧镜像 `interview-copilot-backend:before-tavily-summary-20261013`、`interview-copilot-admin:before-tavily-summary-20261013`。旧后端不支持新增includeAnswer，回滚前停止后端并核对当前配置，只恢复原platform_config行而非整个业务库，再还原镜像/JAR/管理静态。生产未自动开启摘要，没有替换本机安装包。

## 2026-10-13 Tavily 管理后台配置发布（当前方式）

Tavily 已改用管理后台「模型与服务 → 联网搜索」，可编辑地址、Key、topK、搜索深度与超时，保存后新请求立即生效。现有 Key 和5/advanced/8000ms 已迁入平台数据库加密配置，版本21，保持启用；此前服务器 `config/web-search.yml`、`compose.override.yaml` 与挂载/`SPRING_CONFIG_ADDITIONAL_LOCATION` 已删除，源码 YML 也删除对应字段，不再提供回退。下面旧章节的 YML 方式仅为历史记录。

本次后端单元/架构378项、数据库集成全套561项、管理端78项测试通过；管理端真实 Chromium 模拟 API 验证通过，桌面检索回归29项通过。后端 JAR SHA256 `e4a7c118ac36d91e14688b29b6a6e45f521fcd91c65989339e916e302770ebe4`，管理端新 JS `index-Dw2DqIj2.js`，上传和运行容器哈希均一致。只更新后端容器、热更新管理静态和构建下一次启动所用镜像；未重启管理容器或数据库，也未更新桌面包。

服务器通过既有管理员配置接口迁移并验证其他提供商/模型/ASR/知识库/向量配置一致、Key脱敏和数据库密文；临时10分钟管理员范围维护凭证均在操作后撤销。移除 YML并重新创建后端后，真实后台 Tavily 测试成功（约1706ms）；后端healthy，服务器API HTTPS健康UP，管理新JS200。无DDL，本机访问公网域名仍连接重置，未验证本机桌面完整回答流程。

回滚材料位于 `releases/tavily-admin-20261013/`（目录700）：旧 JAR、旧Compose/搜索YML、管理构建目录和运行站点、数据库dump及单独 `platform-config-before.sql`，配置/数据库文件600。旧镜像标签为 `interview-copilot-backend:before-tavily-admin-20261013`、`interview-copilot-admin:before-tavily-admin-20261013`。回滚旧后端前应停止后端，在事务中仅恢复原 `platform_config` 行（删除该单行后执行受限备份SQL），恢复旧JAR/Compose override/搜索YML与旧镜像，再启动；旧程序无法读取新增搜索字段，不能只回滚JAR。管理端恢复 `admin-live-before` 的静态文件和 `admin-source-before.tar.gz` 的构建目录。不需要恢复整个业务数据库；回滚配置会回到发布前版本，注意核对随后新增的管理员配置变更。

## 2026-10-13 11:49 Tavily 启用与重新发布

用户提供真实 Key 后发布 `77ad3a0` 后端，生产构建 368 项测试通过。真实 Key 仅保存在服务器 `config/web-search.yml`，`enabled: true`，topK5/advanced/8000ms；不写入源码或镜像。新 JAR SHA256 `bb1610202bdfe1a768a2acb95edb5b62caf9447b7694cdec574bfec5873922a3`，上传及容器内校验一致。服务器调用真实 Tavily Search 返回 HTTP200 和5条结果；backend healthy，服务器 API HTTPS 健康 UP、未登录搜索401、管理首页200。此后联网功能已启用，用户仍需高级设置授权并保存账号开关。

回滚材料 `releases/tavily-enable-20261013-1148/` 保存旧 JAR和旧搜索YML，旧镜像 `interview-copilot-backend:before-tavily-enable-20261013-1148`；回滚时恢复这两份文件、将旧镜像标为 `interview-copilot-backend:server`，然后执行 `docker compose up -d --no-deps --no-build --wait backend`。本次无 SQL 变更，不重启管理端或数据库。未测试已登录桌面的完整回答流程，本机公网 API 连接重置仍存在。

## 2026-10-13 Tavily 后端发布

部署提交 `9fba09c` 的后端到 `101.33.245.166:/home/ubuntu/interview-copilot`，Java 21 生产构建 `package -P!macos-arm64` 的 368 项测试通过。当前 JAR SHA256 为 `4121104b00f7cdcca32a4dff05aa312dd78b52e808e4af80600d84182e8310ff`，已核对容器内文件；后端 healthy，服务器回环及 API HTTPS 健康检查均 UP。联网接口未登录 401，管理首页 200。管理端和数据库容器未重启，现有 SQL 22/23 已执行，无新增迁移。

服务器 `config/web-search.yml` 保存 Tavily 配置，`compose.override.yaml` 自动合并只读挂载 `/app/config/web-search.yml` 并设置 Spring 外部配置路径。当前 `enabled: false`、Key 空白、topK 5、advanced、8 秒。要启用，在服务器文件中填写 Key 和 `enabled: true`，然后在发布目录执行 `docker compose restart backend`，确认 healthy；账号仍需管理员高级设置授权和桌面保存开启。不要把真实 Key 提交到仓库或打进镜像。

回滚目录 `releases/tavily-20261013-1134/` 保存旧 JAR、Compose、受限权限的环境配置与数据库 dump，旧镜像标签 `interview-copilot-backend:before-tavily-20261013-1134`。回滚后端时恢复 `backend-before.jar`，重新标记旧镜像为 `interview-copilot-backend:server`，移开本次新增的 `compose.override.yaml`，再执行 `docker compose up -d --no-deps --no-build --wait backend`；本次没有 SQL 变更，不需要恢复数据库 dump。

本机公网 curl 仍连接重置，与旧发布记录一致；本次只完成服务器侧 HTTPS 验收，没有真实 Tavily/模型调用或桌面安装包更新。

## 2026-09-22 16:31 录音上传 413 修复

补齐 HttpBodyLimitFilter 的录音专用 3,840,000 字节上限；原来通用 1 MiB 限制会拦截超过约 32 秒的录音分段。355 项后端测试通过后发布，容器 healthy。经线上 Nginx 验证：1,824,000 和 3,840,000 字节的未认证请求返回 401（通过大小检查），3,840,001 字节返回 413。没有调用真实供应商。

当前 JAR SHA256：`f56da62b76edfb20252a3f53ad7ab838bc12ebea518a6b68a0980271fc786a68`。回滚文件在 `releases/recording-413-20260922-1630/backend-before.jar`，镜像 `interview-copilot-backend:rollback-recording-413-20260922-1630`。

客户端补充两小时合成 WAV 回归：230,400,044 字节文件分为 60 段，每段 3,840,000 字节，模型请求使用测试替身。并未宣称两小时真实供应商全链路验收通过。

## 2026-09-22 16:10 录音复盘发布

- 发布本机录音复盘后端接口和 Nginx 的 240 秒复盘请求超时；无数据库迁移，未发布桌面安装包。
- Java 21 生产构建 `clean verify -P!macos-arm64`：351 项测试通过。
- 当前 JAR SHA256：`a19044192377b976bfbd4b7ab84fbda070e60e2110e1e0b59e315e7c0b83ffc1`，已核对容器内产物。
- 备份：`/home/ubuntu/interview-copilot/releases/recording-review-20260922-1608/` 下的 `backend-before.jar`、`nginx-before.conf`；旧镜像 `interview-copilot-backend:rollback-recording-20260922-1608`。
- 后端容器 healthy；服务器访问 HTTPS 健康检查 UP，两项复盘 POST 未登录返回 401；Nginx 配置测试成功并热重载。本机 curl 访问 API 域名仍出现连接重置，未验证真实录音/供应商调用。桌面端需重新构建或打包。

此目录用于部署已编译的 Java JAR 和管理端静态文件。服务器运行 Java 21 镜像，不需要安装宿主机 JDK。`compose.yaml` 通过 Nginx 提供管理后台 HTTPS 443，HTTP 80 对管理域名跳转 HTTPS；保留 IP:8080 原入口。

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

服务器 SSH：`ubuntu@api.junshi.icu`（该域名当前直接解析到部署主机；如果以后接入 CDN/负载均衡，应改用独立运维域名）；部署目录：`/home/ubuntu/interview-copilot`。复用 `pgvector-postgres` 容器和 `interview_copilot` 库，新增受限账号 `copilot_backend`。部署前数据库备份在服务器 `backups/before-backend-deploy.dump`。

本机 SSH 隧道：

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L 127.0.0.1:18080:127.0.0.1:8080 \
  -L 127.0.0.1:15174:127.0.0.1:5174 ubuntu@api.junshi.icu
```

管理端 `http://127.0.0.1:15174`，统一入口 `http://127.0.0.1:18080`。桌面若需连接此验收地址，构建时设置 `COPILOT_PLATFORM_URL=http://127.0.0.1:18080`；现有桌面安装包未改变。

已验证后端健康、管理员登录/退出、管理配置和平台接口。未配置真实 SMTP/模型，因此未验证真实注册邮件、模型回答和语音转写。

待处理：现有 PostgreSQL 为 15.19，但容器提供的 vector 扩展文件实际为 0.8.6，业务库尚未启用扩展；另一个标记 0.5.1 的镜像为 ARM 架构。未启用错误版本，也未替换现有数据库容器。应构建 x86_64 的指定 0.5.1 镜像并另行安排数据库切换。现有数据库 5432 映射所有网卡，需另行确认安全组访问限制。

## 公网域名入口

管理页面使用 `https://admin.junshi.icu`，桌面 API 使用 `https://api.junshi.icu`，实时转写使用 `wss://api.junshi.icu/api/v1/asr`。API 路径保留 `/api/v1/`，健康检查为 `https://api.junshi.icu/actuator/health`。管理端 API 必须通过管理域名访问，API 域名会拒绝 `/api/v1/admin/`。

Nginx 映射 `0.0.0.0:8080:80`，后端容器通过内部网络访问。宿主机直连后端端口为 `127.0.0.1:18081`，管理页面原回环端口 5174 仍用于 SSH 隧道。没有向公网开放新的数据库端口。

旧 8080 映射目前仍保留，不能据此认为明文入口已经关闭。新的客户端构建和验收应使用以上 HTTPS/WSS 域名；支付回调等数据库配置需另行迁移，详见本文 API HTTPS 状态。

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

## 管理后台 HTTPS（2026-09-13）

- 地址：`https://admin.junshi.icu`，A 记录指向部署主机公网地址。
- 80/443/8080 由 admin Nginx 容器提供。`nginx.conf` 和 `certs/` 只读挂载；证书不打入镜像、不提交 Git。
- 部署目录 `certs/admin.junshi.icu_bundle.crt` 与 `certs/admin.junshi.icu.key`，目录权限 700、私钥 600。
- 当前证书北京时间 2026-12-12 19:59:59 到期；手动下载证书，尚未配置自动续期。到期前重新签发并替换证书，执行 `docker compose exec admin nginx -t` 后 `docker compose exec admin nginx -s reload`，再检查公网证书有效期。
- 先准备证书再启动新配置：`docker compose run --rm --no-deps admin nginx -t`，随后 `docker compose up -d --no-deps --no-build admin`。未重启 backend、未变更数据库和支付回调。
- 验证：HTTPS 首页 200、Chrome 登录页可见、HTTP 域名 308、HTTPS 健康检查 UP、受保护 API 未登录 401、原 IP:8080 健康检查 UP。
- 变更前线上配置留在 `backups/admin-https-20260913/`；必要时恢复其中 compose.yaml/nginx.conf 并仅重建 admin 服务。
- `api.junshi.icu` 尚未配置；主域名 HTTP 建设中页面见下节。

## 主域名与管理后台分离（2026-09-13）

`junshi.icu` / `www.junshi.icu` 的 HTTP 虚拟主机使用 `landing/`，只读挂载到 `/usr/share/nginx/landing`。主页显示“网站建设中”，API 和原管理静态资源返回 404。以后可用正式落地页替换此目录。管理子域名 HTTPS 配置保持原样，旧 IP:8080 入口未修改；backend 未重启。

目前只有 admin 子域证书，主域名 HTTPS 尚未部署。浏览器验收被腾讯云跳转到 `dnspod.qcloud.com/static/webblock.html?d=junshi.icu`，页面明确显示网站未完成备案。命令行 HTTP 可取得建设中页面，但不能据此认定公网浏览器可访问。管理域名在服务器侧 HTTPS 200/健康检查 UP/未登录 API 401，本机 HTTPS 连接重置；临时恢复变更前 Nginx 配置亦复现，恢复了新版分域配置。随后 Chrome 已成功打开 admin HTTPS 登录页，管理入口浏览器验收通过；主域名仍需先处理腾讯云提示的备案问题，再重新验收。

本次旧配置：`backups/domain-split-20260913/`。证书续期与旧入口说明仍适用。

## HTTPS 默认站点隔离（2026-09-14）

修正主域名 HTTPS 会落入管理后台的问题：443 默认虚拟主机使用 ssl_reject_handshake，只有 admin.junshi.icu 匹配管理站点；管理站点同时校验 HTTP Host，不匹配返回 404。主域名未配置证书前 HTTPS 拒绝连接，HTTP 仍为建设中页面。原 IP:8080 未改变。

服务器侧验证：admin HTTPS 200、root HTTPS 握手拒绝、admin SNI 配 root Host 返回 404、主域名 HTTP 建设中、旧 8080 健康 UP。外部本机 curl 访问 admin 仍存在之前已复现的连接重置，未据此宣称所有网络均正常。仅 nginx 热重载，未重启容器。旧配置 backups/nginx-before-tls-isolation-20260914.conf。

## API HTTPS（2026-09-14）

新增 `https://api.junshi.icu`，DNS 指向现有服务器。证书及私钥位于服务器 `certs/api.junshi.icu_bundle.crt` 和 `certs/api.junshi.icu.key`，私钥权限 600；北京时间 2026-12-12 22:59:59 到期，手动续期。只热重载 Nginx，Java 未重启。

API 域名只开放 `/api/` 与健康检查，`/api/v1/admin/` 和页面根路径 404；HTTP API 域名返回 426。保留流式请求禁止缓存/缓冲、WS Upgrade 与上传限制。管理域名及主域名隔离配置不变。

验证：浏览器健康检查 UP；服务器侧 HTTPS UP、管理 API 404、未登录平台接口和 WebSocket Upgrade 401。当前本机 Node.js fetch 和 ws 均 ECONNRESET，curl 直连亦失败；尚未确认根因，不降低 TLS 校验、不回退 HTTP。公网全链路验收仍未完成。

支付宝配置当前仍指向旧 IP:8080 通知地址；本次保留旧入口，未修改支付配置/订单/用户令牌。S1 收尾必须解决直连失败、升级客户端、迁移支付通知，随后关闭旧公网明文业务接口并撤销旧令牌。仅新增 TLS 不能保证旧客户端安全。旧配置在 `backups/nginx-before-api-tls-20260914.conf`。

## 2026-09-23 管理后台十页 UI 改版

发布当前工作区 admin 构建（71 项测试通过），覆盖用户、套餐、订单、邀请、模型、支付、邮件、客户端下载、调用记录和操作日志。仅上传管理端静态产物，构建 `interview-copilot-admin:server` 供后续重建使用，并先更新运行容器的哈希资源、原子替换 index.html；未重启容器，未更新后端或数据库。

回滚材料：`/home/ubuntu/interview-copilot/releases/admin-ui-20260923-0133/previous-live`（运行站点备份）、`previous-source`（构建目录备份），旧镜像标签 `interview-copilot-admin:before-ui-20260923-0133`。旧哈希资源保留供已打开页面使用。入口 JS `index-BmSunuPZ.js`、CSS `index-BVmnf07G.css`。

验收：上传包 SHA-256 一致；Nginx 配置检查通过；服务器本机使用管理域名 SNI 校验 HTTPS 首页、JS、CSS 均 200；后端健康 UP，容器运行时间未变化。本机公网 curl 连接重置，浏览器访问超时，公网浏览器验收未完成。
