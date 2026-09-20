import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const variant = process.argv.find((value) => value.startsWith('--variant='))?.split('=')[1] ?? 'original'
const variants = {
  original: { audio: true, video: { frameRate: 1 } },
  'video-true': { audio: true, video: true },
  'video-only': { audio: false, video: true },
}
assert.ok(variant in variants, 'Unsupported capture diagnostic variant')
const instrumented = process.argv.includes('--instrument')
const deadline = Date.now() + 30000
const profile = await mkdtemp(join(tmpdir(), 'copilot-capture-diagnostic-'))
const env = { ...process.env, COPILOT_USER_DATA: profile }
delete env.ELECTRON_RUN_AS_NODE
const output = join(root, 'test-results')
await mkdir(output, { recursive: true })
const eventLog = join(output, `capture-${variant}${instrumented ? '-instrumented' : ''}-events.jsonl`)
await writeFile(eventLog, '')
const report = {
  variant,
  instrumented,
  launchMethod: 'Playwright _electron.launch from Codex',
  permissionIdentityLimitation: 'macOS TCC may attribute this child process to Codex as the responsible application; permission status and capture results do not establish independently launched app authorization.',
  constraints: variants[variant],
  capturedContentRead: false,
  capturedContentSaved: false,
  cloudProviderCalled: false,
  logs: [],
}
let application
function log(kind, message) {
  const entry = { kind, message: String(message).slice(0, 1600) }
  if (report.logs.length < 100) report.logs.push(entry)
  appendFileSync(eventLog, `${JSON.stringify(entry)}\n`)
  if (kind === 'stdout') process.stdout.write(entry.message)
}

try {
  application = await _electron.launch({
    executablePath: join(root, '../dist/mac-arm64/掌灯 Rewick.app/Contents/MacOS/掌灯 Rewick'),
    args: [], env, timeout: 30000,
  })
  application.process().stderr?.on('data', (chunk) => log('stderr', chunk.toString()))
  application.process().stdout?.on('data', (chunk) => log('stdout', chunk.toString()))
  console.log(JSON.stringify({ stage: 'launched', pid: application.process().pid, instrumented, eventLog }))
  const page = await application.firstWindow()
  page.on('console', (message) => log(`renderer-${message.type()}`, message.text()))
  page.on('pageerror', (error) => log('renderer-error', error.message))
  await page.getByRole('heading', { name: '面试工作台', exact: true }).waitFor()
  report.environment = await application.evaluate(({ app, systemPreferences }) => ({
    packaged: app.isPackaged,
    appVersion: app.getVersion(),
    userData: app.getPath('userData'),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    permissions: {
      screen: systemPreferences.getMediaAccessStatus('screen'),
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
    },
  }))
  assert.equal(report.environment.userData, profile, 'Diagnostic must not use the real application profile')
  delete report.environment.userData
  console.log(JSON.stringify({ stage: 'environment', ...report.environment }))

  if (instrumented) {
    await application.evaluate(({ BaseWindow, desktopCapturer, session }) => {
      globalThis.__captureDiagnosticEvents = []
      const events = globalThis.__captureDiagnosticEvents
      const record = (event) => {
        events.push(event)
        console.log(JSON.stringify({ stage: 'handler-event', ...event }))
      }
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        const mainFrame = BaseWindow.getAllWindows().find(window => window.isVisible())?.webContents.mainFrame
        record({ kind: 'request', frameMatches: request.frame === mainFrame,
          framePresent: Boolean(request.frame), frameProcessId: request.frame?.processId,
          frameRoutingId: request.frame?.routingId, mainProcessId: mainFrame?.processId,
          mainRoutingId: mainFrame?.routingId, audioRequested: request.audioRequested,
          videoRequested: request.videoRequested, userGesture: request.userGesture })
        const reply = (value) => {
          record({ kind: 'callback', hasVideo: Boolean(value.video), audio: value.audio ?? null })
          try { callback(value) }
          catch (error) { record({ kind: 'callback-error', name: error.name, message: error.message }) }
        }
        if (request.frame !== mainFrame) { reply({}); return }
        void (async () => {
          let sources
          record({ kind: 'getSources-begin' })
          try { sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }) }
          catch (error) { record({ kind: 'getSources-error', name: error.name, message: error.message }); reply({}); return }
          record({ kind: 'getSources', count: sources.length })
          const source = sources[0]
          reply(source ? { video: source, audio: 'loopback' } : {})
        })()
      })
    })
  }

  report.capture = await page.evaluate(async ({ constraints, timeoutMs }) => {
    const started = performance.now()
    let timeout
    const capture = (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia(constraints)
        const tracks = stream.getTracks()
        try {
          return { result: 'success', elapsedMs: Math.round(performance.now() - started),
            audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length,
            tracks: tracks.map((track) => {
              const settings = track.getSettings()
              return { kind: track.kind, readyState: track.readyState, enabled: track.enabled, muted: track.muted,
                sampleRate: settings.sampleRate, channelCount: settings.channelCount,
                width: settings.width, height: settings.height, frameRate: settings.frameRate,
                displaySurface: settings.displaySurface }
            }) }
        } finally { tracks.forEach((track) => track.stop()) }
      } catch (error) {
        return { result: 'error', elapsedMs: Math.round(performance.now() - started), name: error.name, message: error.message }
      }
    })()
    try {
      return await Promise.race([capture, new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ result: 'timeout', elapsedMs: timeoutMs,
          message: 'Capture did not settle; a permission or picker prompt may be pending. No prompt was operated.' }), timeoutMs)
      })])
    } finally { clearTimeout(timeout) }
  }, { constraints: variants[variant], timeoutMs: Math.max(1, deadline - Date.now() - 1000) })
  console.log(JSON.stringify({ stage: 'capture', ...report.capture }))
  if (instrumented) {
    report.handler = await application.evaluate(() => globalThis.__captureDiagnosticEvents)
    console.log(JSON.stringify({ stage: 'handler', events: report.handler }))
  }
  report.permissionsAfter = await application.evaluate(({ systemPreferences }) => ({
    screen: systemPreferences.getMediaAccessStatus('screen'),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
  }))
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  console.error(report.error)
  process.exitCode = 1
} finally {
  await application?.close().catch((error) => log('close-error', error.message))
  await mkdir(output, { recursive: true })
  const filename = `capture-${variant}${instrumented ? '-instrumented' : ''}.json`
  await writeFile(join(output, filename), `${JSON.stringify(report, null, 2)}\n`)
  await rm(profile, { recursive: true, force: true })
  console.log(`Metadata report: ${join(output, filename)}`)
}
