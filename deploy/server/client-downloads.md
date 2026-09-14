# 客户端下载部署

## 发布步骤

1. 先执行 `backend/sql/19_client_downloads.sql`，为应用数据库角色授权；脚本不自动执行。
2. 使用新版 Dockerfile 构建 backend，更新 admin 静态产物和 landing 静态资源（包括 `vendor/downloads.js`）。
3. 更新 compose.yaml 和 nginx.conf。后端可写挂载 `client-download-files:/app/data/client-downloads`，Nginx 只读挂载同一卷到 `/usr/share/nginx/client-downloads`。
4. 确保卷属于 backend 的 copilot 用户。新 Dockerfile 已准备目录；已有或由 Nginx 先创建的卷可以执行：

```sh
docker compose run --rm --no-deps --user root --entrypoint sh backend -c 'chown -R copilot:copilot /app/data/client-downloads'
```

5. 重新创建后端和 Nginx 容器应用卷挂载，执行 `docker compose exec -T admin nginx -t` 验证配置。
6. 在管理后台“客户端下载”上传各平台实际验证过的安装包，填写版本和最低系统要求，勾选启用并保存。

## 路由与文件

- 落地页同源 `GET /api/v1/client-downloads` 查询三项状态，不需要登录。
- `/downloads/{platform}/{architecture}` 经后端检查启用状态后，使用 `X-Accel-Redirect` 交给 Nginx。
- `/_client_files/` 为 Nginx internal location，禁止直接外部访问；未保存文件不可下载。
- Nginx 支持附件下载及 Range 断点续传；下载入口不缓存，以免关闭后继续提供旧文件。
- 安装包上限 500 MiB，multipart 请求上限 501 MiB。仅上传接口在 Nginx 放宽限制，普通接口保持原限制。
- 替换成功后删除旧文件；临时上传超过 24 小时失效。清理任务每小时删除过期临时文件和崩溃遗留文件，保留当前发布文件。
- 页面脚本 CSP 使用 SHA-256 白名单，修改 index.html 的内联脚本后同步更新 nginx.conf 的哈希。

本地 IDE 启动时文件目录默认为 `./data/client-downloads`，可以用 `copilot.downloads.directory` 指定路径。下载文件必须经过配置好的 Nginx；直接请求 Java 端口只会返回内部转发响应头。管理端 Vite 适合编辑和上传测试，完整下载验收使用 Docker Nginx。

未来多实例部署时，所有后端和 Nginx 必须共享同一文件存储；当前 Compose 命名卷适用于同一 Docker 主机。安装包不包含进镜像，不随容器重建丢失。

## 验证

```sh
node scripts/backend.mjs clean verify -Pintegration
npm --prefix admin test
npm --prefix admin run build
node admin/scripts/download-smoke.mjs
```

最后一项使用隔离的临时 Nginx 容器验证附件、Range、内部路径保护和关闭下载。
