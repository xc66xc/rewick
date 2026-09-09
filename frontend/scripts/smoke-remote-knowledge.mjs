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
import { startRemoteKnowledgeMock } from './mock-remote-knowledge.mjs'
import { checkRemoteKnowledge } from '../tests/e2e/remote-knowledge.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results')
const directory = await mkdtemp(join(tmpdir(), 'copilot-remote-knowledge-e2e-'))
const profile = join(directory, 'profile')
const localReference = join(directory, 'synthetic-local-reference.txt')
await writeFile(localReference, 'LOCAL_REFERENCE_ONLY_82：合成 Redis 缓存知识。应先排查缓存一致性，再分析慢查询和缓存失效。\n')
const packaged = process.argv.includes('--packaged')
const appBundle = process.env.COPILOT_TEST_APP_PATH ?? join(root, '../dist/mac-arm64/Interview Copilot.app')
const mock = await startMockServices()
const remote = await startRemoteKnowledgeMock()
const report = { packaged, passed: false, liveProviderTested: false, realAudioCaptureTested: false,
  realEmbeddingQualityTested: false, realRemoteKnowledgeQualityTested: false,
  ...(packaged ? { appBundle } : {}), checks: [], screenshots: [] }
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
  await page.waitForFunction(() => Boolean(window.copilot?.testRemoteKnowledge))
  await loginForSmoke(page, mock)
  const metadata = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }))
  assert.equal(metadata.packaged, packaged)
  report.version = metadata.version
  await app.evaluate(({ dialog, session }) => {
    globalThis.__remoteDialogSelections = []
    globalThis.__remoteUnexpectedNetwork = []
    globalThis.__remoteLocalRetrievalOperations = []
    const { Worker } = process.getBuiltinModule('node:worker_threads')
    const originalPostMessage = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, ...args) {
      if (['snapshot', 'search', 'releaseSnapshot'].includes(message?.operation)) {
        globalThis.__remoteLocalRetrievalOperations.push(message.operation)
      }
      return Reflect.apply(originalPostMessage, this, [message, ...args])
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        globalThis.__remoteUnexpectedNetwork.push(`${url.protocol}//${url.host}${url.pathname}`)
        return Promise.reject(new Error('Non-loopback fetch blocked by isolated remote E2E'))
      }
      return originalFetch(input, options)
    }
    dialog.showOpenDialog = async () => {
      if (!globalThis.__remoteDialogSelections.length) throw new Error('Unexpected native file dialog in isolated remote test')
      return { canceled: false, filePaths: globalThis.__remoteDialogSelections.shift() }
    }
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url)
      const cancel = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
        && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      if (cancel) globalThis.__remoteUnexpectedNetwork.push(details.url)
      callback({ cancel })
    })
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
async function closeApp() {
  if (!app) return
  const unexpected = await app.evaluate(() => globalThis.__remoteUnexpectedNetwork)
  assert.deepEqual(unexpected, [], 'isolated tests must never attempt a non-loopback provider request')
  await app.close()
  app = undefined
}

try {
  await launch()
  await checkRemoteKnowledge({ app, page, profile, localReference, mock, remote, checked, checkpoint, screenshot, report,
    restart: async () => { await closeApp(); return launch() } })
  assert.deepEqual(remote.unexpectedRequests, [], 'provider metadata URLs must not be fetched')
  assert.equal(mock.asrConnections.length, 0, 'this suite must not start any audio session')
  await closeApp()
  report.passed = true
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  console.error(report.error)
  if (page && !page.isClosed()) await screenshot('remote-knowledge-failure.png').catch(() => undefined)
  process.exitCode = 1
} finally {
  await writeFile(join(output, packaged ? 'package-remote-knowledge-report.json' : 'remote-knowledge-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await app?.close().catch(() => undefined)
  await remote.close()
  await mock.close()
  await rm(directory, { recursive: true, force: true })
}
