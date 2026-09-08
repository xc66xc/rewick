# PostgreSQL 15.19 + pgvector 0.5.1

镜像固定为 `interview-copilot-postgres:15.19-pgvector0.5.1`。运行基础为官方 `postgres:15.19-bookworm`，并固定多架构索引摘要：`sha256:5d1d70e254e3c5d7d76847a9deebb18478cd518df37abf6b278d4bdb1fe5d96c`。

pgvector 使用[官方 v0.5.1 源码](https://github.com/pgvector/pgvector/releases/tag/v0.5.1)，下载包 SHA-256 为 `cc7a8e034a96e30a819911ac79d32f6bc47bdd1aa2de4d7d4904e26b83209dc8`。构建时校验摘要，并按[官方构建方式](https://github.com/pgvector/pgvector/blob/v0.5.1/Dockerfile)清空 `OPTFLAGS`，避免生成仅适用于构建机器 CPU 的指令。

构建阶段提取与基础镜像 `PG_VERSION` 一致的 `postgresql-server-dev-15` 开发包，并关闭不需要的 LLVM bitcode。最终阶段只复制扩展动态库、SQL/control 文件与许可证，不执行 apt 安装或升级，因此保留基础镜像的 PostgreSQL 15.19。

从仓库根目录构建：

```sh
docker build -t interview-copilot-postgres:15.19-pgvector0.5.1 deploy/postgres
```

Compose 的 `database` 服务使用此构建目录，并使用新的 `database-pg15-data` 卷。旧 `database-data` 卷不会由该配置读取或删除；PostgreSQL 17 的数据目录不能直接挂载给 15。迁移旧数据需要另行导出、兼容性检查和导入。

镜像仅安装扩展文件，不运行项目建表 SQL。Compose 将 `backend/sql/` 只读挂载到 `/opt/copilot/sql`，由部署人员显式执行初始化，再启动后端，见 [SQL 说明](../../backend/sql/README.md)。数据库密码通过外部环境提供，不写入镜像；现有官方镜像的用户/空库初始化和健康检查机制保持可用。

2026-09-08 已在 Linux arm64 镜像的独立临时容器中验证：`server_version_num = 150019`、`CREATE EXTENSION vector VERSION '0.5.1'` 成功，`[1,2,3]` 与 `[4,6,3]` 的欧氏距离为 `5`。验证容器使用临时内存数据目录，完成后已删除；未操作已有数据库卷。amd64 构建需要在对应平台另行验收。
