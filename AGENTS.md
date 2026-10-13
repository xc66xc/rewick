# Repository Guidelines

## Project Structure & Module Organization

- `frontend/`: Electron client. `src/main/`: services/storage; `src/preload/`: IPC; `src/renderer/src/`: React UI; `src/shared/`: contracts. Tests: `tests/`; icons: `build/`.
- `admin/`: React/Vite console, tests, and browser checks in `scripts/`.
- `backend/`: Java 21, Spring Boot 3.5, MyBatis-Plus. Sources: `src/main/java/com/interview/copilot/`; tests: `src/test/java/`.
- `backend/sql/` contains ordered, manually executed SQL. `deploy/postgres/` and `compose.yaml` define local deployment.

## Build, Test, and Development Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run install:frontend` / `npm run install:admin` | Install each package from its lockfile. |
| `npm run dev` / `npm run admin:dev` | Start desktop / management UI development. |
| `npm run backend:dev` | Start Java through Maven Wrapper; requires database configuration. |
| `npm run build` / `npm run admin:build` | Type-check and build each frontend. |
| `npm run backend:build` | Package Java; skips tests. |
| `npm test` / `npm run admin:test` / `npm run backend:test` | Run package tests; database integration is excluded by default. |
| `npm run test:e2e` | Run desktop Playwright smoke checks. |

Database tests: `node scripts/backend.mjs verify -Pintegration`; prepare Docker/image per README.

## Versioning & Release Records

- 使用 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)，格式为 `MAJOR.MINOR.PATCH`（主版本.次版本.补丁版本）。每次完成并交付功能、Bug 修复或性能改进，都必须将受影响模块的对应版本位 **+1** 并同步版本记录，不能一直复用旧版本号。
- **不兼容变更**：主版本 `MAJOR +1`，次版本和补丁归零，例如 `1.4.3 → 2.0.0`；说明 API、IPC、配置或持久化数据的兼容性影响和迁移步骤。特性规模大本身不意味着升主版本。
- **向后兼容的新功能/大特性**：次版本 `MINOR +1`，补丁归零，例如 `0.4.2 → 0.5.0`；新增运营页面等完整能力属于此类。
- **向后兼容的 Bug 修复、性能或安全修正**：补丁 `PATCH +1`，例如 `0.4.2 → 0.4.3`。同一次交付包含多类变更时，只按最高级别递增一次；同一任务的中间修改、测试和重复构建不重复递增。单纯文档/测试调整且没有交付行为变化时，不产生产品发布版本。
- 桌面、管理端和后端按独立交付模块维护版本，只递增受影响模块。桌面同步 `frontend/package.json` 与 `frontend/package-lock.json` 的顶层及根 package 版本；管理端同步 `admin/` 的对应两份文件；后端更新 `backend/pom.xml` 的项目版本，不能误改 parent 或依赖版本。开发后缀如 `-SNAPSHOT` 不替代核心版本递增。
- 每次版本递增同步维护仓库根目录 `CHANGELOG.md`（首次需要时创建）：记录日期、模块、旧/新版本、变更类型与内容、验证结果、兼容性/迁移说明和实际发布状态；未部署、未打包或验收未通过必须明确标注。交付说明应列出本次版本变化。
- 发布前核对 manifest、lockfile、实际构建产物/安装包及发布记录版本一致。已经发布的版本不可覆盖成不同内容；后续修正必须使用新版本。`0.x.y` 仍处开发阶段，但不得因此省略功能/修复的版本递增；稳定兼容契约形成时再明确发布 `1.0.0`。

## Coding Style & Naming Conventions


Use two-space indentation, single quotes, and no semicolons in TypeScript. Keep TypeScript strict. Components/classes use `PascalCase`, hooks `useSomething`, services kebab-case. Reuse CSS Modules/tokens. No formatter or lint command; match surrounding code.

### backend

Use four-space Java indentation and constructor injection.

- **Packages:** Under `com.interview.copilot`, use `<responsibility>/<module>` with the same lowercase module name across layers; never a flat domain package. Interfaces: `service/<module>/*Service`; implementations: `service/impl/<module>/*ServiceImpl`. Create only needed packages. Shared `common`, `config`, and `util` need no module subpackage; use `util`, never `utils`.
- **Layers:** Controllers validate HTTP input, call service interfaces, and return `*Response`/`*VO`; no business logic or persistence access. Services own business rules, orchestration, and transactions. Production consumers must not import `service.impl`. Jobs only trigger service interfaces.
- **Persistence:** Use MyBatis-Plus through `mapper/<module>/*Mapper`; no JPA or JDBC/JdbcTemplate in production. Keep SQL in Mappers, with no nested records/classes or business default methods. Mappers must not depend on controllers, services, requests, responses, VOs, security, business exceptions, or HTTP types.
- **Data:** Put database mappings/projections in `entity`, domain models/policies in `model`, transfer/query objects in `dto`, and HTTP inputs in `request` as `*Request`. Services convert entities to DTOs or independent responses; Controllers construct VOs through converters. No service dependency on `vo`, HTTP request objects in persistence, or entities in API payloads—even nested or paginated.
- **Helpers:** Use `converter/<module>` for mappings without Mapper access and `Page.map` to preserve pagination metadata. Shared validation belongs in `validation/<module>`, not service implementation helpers. Keep global exceptions/advice in `exception` and security/session code in `security`.
- **Transactions:** Preserve wallet lock order: user row → ensure wallet → wallet row. Service coordinates locking; expiry processing retains per-user transactions and failure isolation.
- **Fixtures:** Test configuration sources belong only in `src/test/java`. Production uses database-backed platform configuration; do not add environment-backed runtime constructors for tests.
- **Verification:** Maintain `BackendArchitectureTest`; structural refactors must pass unit/architecture tests. Persistence or transaction changes also require `./mvnw clean verify -Pintegration` from `backend/` with the existing PostgreSQL/pgvector image. Preserve API contracts, authorization, tenant isolation, time semantics, and transaction behavior.

## Frontend UI Constraints (desktop `frontend/` only; `admin/` is not bound by these)

- Build renderer UI from the library in `frontend/src/renderer/src/components/ui/` — `Button`/`IconButton`/`LinkButton`/`TextButton`, `TextField`/`TextareaField`/`FieldRow`, `AppSelect`, `Segmented`, `ToggleSwitch`, `CheckRow`/`ChoiceRow`, `TabBar`, `Table*` family, `Modal`/`ConfirmModal`, `DropdownMenu`, `Tooltip`, `Collapse`, `EmptyState`, `Pill`/`StatusPill`/`Eyebrow`, `Badge`, `Avatar`, `Skeleton`, `Divider`, `Kbd`, `LevelMeter`, plus `toast()` for notifications.
- Do not hand-roll raw equivalents: no native `<details>`/`<summary>` (use `Collapse`), no ad-hoc styled `<button>` (use `Button` variants/sizes), no `<select>` (use `AppSelect`), no custom dialogs (use `Modal`) or inline notification banners (use `toast()`).
- When the library almost fits, extend the component (new variant/size/prop) instead of copying it into page code; page-level one-off looks go through the sanctioned override props (e.g. `TextareaField.controlClassName`).
- `components/ui/` and `lib/` use semantic Tailwind tokens only (`bg-card`, `text-text-secondary`, `border-border`…). Literal colors, gradients, and keyframes live only in `src/renderer/src/styles/tokens.css` (`@theme`) — enforced by `tests/ui/no-literal-colors.test.ts`.
- Register new or changed library components in `playground/registry.ts` (sync enforced by `tests/ui/registry-drift.test.ts`) and cover them in `tests/ui/`.
- Icons come from `@phosphor-icons/react`; keep content pages full-width without `max-w-*` centering caps.

## Testing Guidelines

Use Vitest/Testing Library (`*.test.ts`, `*.test.tsx`), Playwright, and JUnit 5/Mockito (`*Test.java`), with Testcontainers for integration. No coverage threshold. Cover changed behavior, failures, authorization, and cancellation. Use isolated data and mock suppliers, never real credentials or recordings.

## Commit & Pull Request Guidelines

Use focused commits with short prefixed subjects, e.g. `feat:`. PRs explain changes, link issues, list validation, and include UI screenshots or SQL upgrade steps when applicable.

## Security & Configuration

Keep database credentials, the platform master key, and the email-code secret in ignored deployment configuration or environment variables; Java does not load root `.env`. Platform endpoints/keys and SMTP settings are managed through the admin console and database, with no environment fallback. Custom-service keys stay encrypted on the desktop. Require desktop login and honor explicit per-capability service selections without automatic fallback; preserve nonblocking ordinary RAG failures. Match PostgreSQL and pgvector versions to the existing public deployment; do not upgrade or downgrade that deployment to satisfy older version pins. Align local development, tests, and SQL version checks during implementation. Add numbered SQL without Flyway or automatic initialization. Exclude dependencies, build output, logs, and personal data from Git.

For incorrect configuration (such as a missing endpoint path), explain the exact correction to the user. Do not add automatic completion, fallback, or compatibility behavior to accommodate configuration mistakes unless explicitly requested.

Persist business times as Beijing `TIMESTAMP(6) WITHOUT TIME ZONE` with `LocalDateTime`; use the shared `ServerTime` helper and `Asia/Shanghai` database sessions. Preserve explicit timezone information in API expiry timestamps. Interview duration is stored in whole seconds and settled using authoritative server time.

Reference RAG uses server PostgreSQL/pgvector with fixed `vector(1024)` and platform-owned embedding credentials for both indexing and queries. Keep embedding settings in admin only; never reintroduce desktop embedding keys or SQLite reference retrieval. Preserve tenant/environment filters and exclusive Bailian routing. Mount `/app/data/references` persistently when deploying. Old local documents require explicit user re-upload.
