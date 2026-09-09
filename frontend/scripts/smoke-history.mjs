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
import { checkHistoryDeletion } from '../tests/e2e/history-deletion.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results')
const directory = await mkdtemp(join(tmpdir(), 'copilot-history-e2e-'))
const profile = join(directory, 'profile')
const packaged = process.argv.includes('--packaged')
const appBundle = process.env.COPILOT_TEST_APP_PATH ?? join(root, '../dist/mac-arm64/Interview Copilot.app')
const checked = expect.configure({ timeout: 15_000 })
const report = {
  packaged, passed: false, liveProviderTested: false, realAudioCaptureTested: false,
  realSystemAudioCaptureTested: false, ...(packaged ? { appBundle } : {}),
  checks: [], screenshots: [], consoleErrors: [], pageErrors: [], consoleMessages: [], cleanupErrors: [],
}
let app
let page
let mock
let launchNumber = 0
await mkdir(output, { recursive: true })

async function launch() {
  const env = { ...process.env, COPILOT_USER_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  const fakeMedia = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  const currentLaunch = ++launchNumber
  app = await _electron.launch({
    executablePath: packaged ? join(appBundle, 'Contents/MacOS/Interview Copilot') : electronPath,
    args: [...(packaged ? [] : ['.']), ...fakeMedia], cwd: root, env, timeout: 30_000,
  })
  const observed = new WeakSet()
  function observe(window) {
    if (observed.has(window)) return
    observed.add(window)
    window.on('console', message => {
      const type = message.type()
      const text = message.text()
      if (!['warning', 'error'].includes(type)) return
      report.consoleMessages.push({ launch: currentLaunch, type, text, location: message.location() })
      const reactWarning = /validateDOMNesting|hydration|hydrating|cannot (?:appear|contain)|cannot be a (?:child|descendant)|Each child in a list|React (?:error|warning)/i.test(text)
      if (type === 'error' || reactWarning) report.consoleErrors.push(`[launch ${currentLaunch}] ${text}`)
    })
    window.on('pageerror', error => {
      report.pageErrors.push(`[launch ${currentLaunch}] ${error.stack || error.message}`)
    })
  }
  app.on('window', observe)
  page = await app.firstWindow()
  observe(page)
  page.setDefaultTimeout(15_000)
  await page.addInitScript(() => {
    // Chromium's fake media device is the only capture source this suite may open.
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    })
  })
  // Re-render with listeners installed so initial React errors cannot precede observation.
  await page.reload()
  await page.waitForFunction(() => Boolean(window.copilot?.getHistory && window.copilot?.removeSession))
  await loginForSmoke(page, mock)
  const metadata = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }))
  assert.equal(metadata.packaged, packaged)
  report.version = metadata.version
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

async function restart() {
  await app.close()
  app = undefined
  return launch()
}

async function cleanup(name, operation) {
  try { await operation() }
  catch (error) {
    report.cleanupErrors.push(`${name}: ${error instanceof Error ? error.stack : String(error)}`)
    report.passed = false
    process.exitCode = 1
  }
}

try {
  mock = await startMockServices()
  await launch()
  await checkHistoryDeletion({ app, page, mock, checked, checkpoint, screenshot, report, restart })
  assert.deepEqual(report.consoleErrors, [], 'history operations must not emit React or console errors across app restarts')
  assert.deepEqual(report.pageErrors, [], 'history operations must not emit uncaught renderer errors across app restarts')
  report.passed = true
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  console.error(report.error)
  if (page && !page.isClosed()) await screenshot('history-deletion-failure.png').catch(() => undefined)
  process.exitCode = 1
} finally {
  await cleanup('close app', async () => { await app?.close() })
  await cleanup('close mock services', async () => { await mock?.close() })
  await cleanup('remove temporary profile', () => rm(directory, { recursive: true, force: true }))
  await writeFile(join(output, packaged ? 'package-history-deletion-report.json' : 'history-deletion-report.json'), `${JSON.stringify(report, null, 2)}\n`)
}
