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

Use two-space indentation, single quotes, and no semicolons in TypeScript; four spaces in Java. Keep TypeScript strict. Components/classes use `PascalCase`, hooks `useSomething`, services kebab-case. Reuse CSS Modules/tokens. No formatter or lint command; match surrounding code.

## Testing Guidelines

Use Vitest/Testing Library (`*.test.ts`, `*.test.tsx`), Playwright, and JUnit 5/Mockito (`*Test.java`), with Testcontainers for integration. No coverage threshold. Cover changed behavior, failures, authorization, and cancellation. Use isolated data and mock suppliers, never real credentials or recordings.

## Commit & Pull Request Guidelines

Use focused commits with short prefixed subjects, e.g. `feat:`. PRs explain changes, link issues, list validation, and include UI screenshots or SQL upgrade steps when applicable.

## Security & Configuration

Keep database credentials, the platform master key, and the email-code secret in ignored deployment configuration or environment variables; Java does not load root `.env`. Platform endpoints/keys and SMTP settings are managed through the admin console and database, with no environment fallback. Custom-service keys stay encrypted on the desktop. Require desktop login and honor explicit per-capability service selections without automatic fallback; preserve nonblocking ordinary RAG failures. Retain PostgreSQL 15.19/pgvector 0.5.1; add numbered SQL without Flyway or automatic initialization. Exclude dependencies, build output, logs, and personal data from Git.

For incorrect configuration (such as a missing endpoint path), explain the exact correction to the user. Do not add automatic completion, fallback, or compatibility behavior to accommodate configuration mistakes unless explicitly requested.

Persist business times as Beijing `TIMESTAMP(6) WITHOUT TIME ZONE` with `LocalDateTime`; use the shared `ServerTime` helper and `Asia/Shanghai` database sessions. Preserve explicit timezone information in API expiry timestamps. Daily quotas follow the Beijing calendar date.
