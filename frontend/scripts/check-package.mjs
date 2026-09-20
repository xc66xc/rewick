import { fileURLToPath } from 'node:url'
process.env.COPILOT_TEST_APP_PATH ??= fileURLToPath(new URL('../../dist/mac-arm64/掌灯 Rewick.app', import.meta.url))
await import('./smoke-platform.mjs')
