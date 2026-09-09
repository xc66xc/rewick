import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { startMockServices } from './mock-services.mjs'
import { loginForSmoke } from './mock-auth.mjs'
import { createPdfRagFixtures } from '../tests/fixtures/pdf-rag.mjs'
import { checkInterviewEnvironments } from '../tests/e2e/interview-environments.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results')
const directory = await mkdtemp(join(tmpdir(), 'copilot-environments-e2e-'))
const profile = join(directory, 'profile')
const fixtures = await createPdfRagFixtures(join(directory, 'fixtures'))
fixtures.jd = join(directory, 'fixtures', 'synthetic-target.md')
fixtures.resumeAlternate = join(directory, 'fixtures', 'synthetic-resume-b.txt')
await writeFile(fixtures.jd, '# 合成岗位 JD\nJD_ENV_B_ONLY_53：关注 MySQL 慢查询与数据质量。\n')
await writeFile(fixtures.resumeAlternate, 'RESUME_ENV_B_ONLY_92\n合成经历 B：参与演示数据平台的 MySQL 查询分析。\n')
const packaged = process.argv.includes('--packaged')
const appBundle = process.env.COPILOT_TEST_APP_PATH ?? join(root, '../dist/mac-arm64/Interview Copilot.app')
const mock = await startMockServices()
const report = { packaged, passed: false, liveProviderTested: false, realAudioCaptureTested: false,
  realEmbeddingQualityTested: false, ...(packaged ? { appBundle } : {}), checks: [], screenshots: [] }
const checked = expect.configure({ timeout: 15_000 })
let app
let page
await mkdir(output, { recursive: true })

async function launch() {
  const env = { ...process.env, COPILOT_USER_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: packaged
    ? join(appBundle, 'Contents/MacOS/Interview Copilot') : electronPath,
  args: packaged ? [] : ['.'], cwd: root, env, timeout: 30_000 })
  page = await app.firstWindow()
  page.setDefaultTimeout(15_000)
  await page.waitForFunction(() => Boolean(window.copilot?.listReferences))
  await loginForSmoke(page, mock)
  const metadata = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }))
  assert.equal(metadata.packaged, packaged)
  report.version = metadata.version
  await app.evaluate(({ dialog }) => {
    globalThis.__ragDialogSelections = []
    dialog.showOpenDialog = async () => {
      if (!globalThis.__ragDialogSelections.length) throw new Error('Unexpected native file dialog during isolated RAG test')
      const filePaths = globalThis.__ragDialogSelections.shift()
      return { canceled: filePaths === null, filePaths: filePaths ?? [] }
    }
  })
  return { app, page }
}

async function checkpoint(name, run) {
  await run()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}

async function screenshot(name) {
  const filename = `${packaged ? 'packaged-' : ''}${name}`
  await page.screenshot({ path: join(output, filename), fullPage: true, animations: 'disabled' })
  report.screenshots.push(filename)
}

try {
  await launch()
  await checkInterviewEnvironments({ app, page, profile, fixtures, mock, checked, checkpoint, screenshot, report,
    restart: async () => { await app.close(); app = undefined; return launch() } })
  report.passed = true
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  console.error(report.error)
  if (page && !page.isClosed()) await screenshot('interview-environments-failure.png').catch(() => undefined)
  process.exitCode = 1
} finally {
  await writeFile(join(output, packaged ? 'package-environments-report.json' : 'interview-environments-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await app?.close().catch(() => undefined)
  await mock.close()
  await rm(directory, { recursive: true, force: true })
}
