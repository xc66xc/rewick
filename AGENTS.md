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

## Coding Style & Naming Conventions


Use two-space indentation, single quotes, and no semicolons in TypeScript. Keep TypeScript strict. Components/classes use `PascalCase`, hooks `useSomething`, services kebab-case. Reuse CSS Modules/tokens. No formatter or lint command; match surrounding code.

### backend

Use four-space Java indentation and constructor injection. Base packages must use `com.interview.copilot`; organize by responsibility, never a flat domain package such as `auth`.

```text
controller  HTTP endpoints          service                 use-case interfaces
service/impl use-case implementations mapper                 MyBatis-Plus database access
entity      database mappings       model                   domain models
dto         transfer objects        vo                      view objects
request     request bodies          response                response bodies
config      configuration           security                authentication and authorization
exception   exceptions/advice       util                    utilities
constant    constants/enums         converter               object conversions
validation  custom validation       job                     scheduled tasks
event       events/listeners        common                  shared base components
```

Under each responsibility package, group business-specific classes into module subpackages rather than accumulating them directly in the responsibility package. Use the same lowercase module name across layers. For example, a user module uses:

```text
com.interview.copilot
├── controller/user/UserController.java
├── service/user/UserService.java
├── service/impl/user/UserServiceImpl.java
├── mapper/user/UserMapper.java
├── entity/user/User.java
├── request/user/CreateUserRequest.java
└── response/user/UserResponse.java
```

Apply this structure to other business-specific packages such as `model`, `dto`, `vo`, `converter`, `validation`, `job`, and `event` when needed. Create only packages required by the module; do not scaffold empty packages. Shared infrastructure packages such as `common`, `util`, and `config` do not require business-module subpackages. Keep the utility package named `util` consistently; do not introduce a parallel `utils` package.

Controllers validate HTTP input, invoke service interfaces, and return `response`/`vo`; they must not contain business logic or access persistence directly. Put service interfaces in `service/<module>` and their concrete business implementations in `service/impl/<module>`, named `*ServiceImpl`. The `impl` package is a subpackage of `service`, not a separate top-level `serviceimpl` package. Controllers depend on `*Service` interfaces through constructor injection, never on their concrete implementations.

Use MyBatis-Plus for database access through concrete `*Mapper` interfaces in `mapper`. Service implementations invoke these Mappers; do not introduce JPA repositories, JDBC/JdbcTemplate access, or SQL in controllers. Entities must never be API payloads. Put global exception handling in `exception` and security/session code in `security`.

Use `*Request`, `*Response`/`*VO`, `*Service`, `*ServiceImpl`, and `*Mapper` naming patterns.

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
