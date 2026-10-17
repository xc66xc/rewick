import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { WebSocketServer } from 'ws'
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const temporary = await mkdtemp(join(tmpdir(), 'copilot-mock-desktop-'))
const output = join(frontend, 'test-results'); await mkdir(output, { recursive: true })
const id = randomUUID(), environmentId = randomUUID(), resumeId = randomUUID()
const now = new Date().toISOString()
const environment = { id: environmentId, interviewType: 'technical', name: '合成模拟环境', resumeId, targetId: null, referenceIds: [], createdAt: now, updatedAt: now, version: 1 }
const library = { resumes: [{ id: resumeId, name: '合成简历', text: '合成工程师', createdAt: now, updatedAt: now, version: 1 }], targets: [], environments: [environment], activeEnvironmentId: environmentId }
let current = { id, state: 'ready', version: 1, generation: 1, environmentName: environment.name, interviewType: 'technical', durationMinutes: 15, usedSeconds: 0, remainingSeconds: 900, avatarId: 'rewick-interviewer', voiceId: 'test', turns: [], reportStatus: 'pending', createdAt: now }
let socket, sequence = 0, micFrames = 0, consumedCredit = 0, speech
const commands = [], checks = [], errors = [], suppliers = []
const preferences = { version: 1, preferences: { answerStyle: 'concise', temperature: .5, silenceMs: 800, autoAnswer: { enabled: true, pauseMs: 1500 }, retrievalEnabled: false, remoteKnowledgeEnabled: false, webSearchEnabled: false, platformSelections: { llm: null, asr: null, knowledge: null } }, unavailableSelections: [] }
const reply = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
function send(kind, payload, generation = current.generation) { socket?.send(JSON.stringify({ protocolVersion: 1, sessionId: id, kind, generation, sequence: sequence++, payload })) }
function state(asrReady = false) { send('state', { ...current, asrReady }) }
function speak() {
  current = { ...current, state: 'speaking', version: current.version + 1, generation: current.generation + 1 }
  if (!current.turns.length) { const turn = { id: randomUUID(), number: 1, question: '请介绍你负责的项目。', answerText: '', status: 'pending' }; current.turns.push(turn); current.currentTurnId = turn.id }
  state(); speech = { id: randomUUID(), offset: 0, sequence: 0, credit: 0, ended: false }
  send('speech.start', { speechId: speech.id, sampleRate: 24000, channels: 1, format: 'pcm16' })
}
function flush() {
  if (!speech || speech.ended) return
  while (speech.credit >= 4800 && speech.offset < 120000) {
    const pcm = Buffer.alloc(4800); for (let index = 0; index < 2400; index++) pcm.writeInt16LE(Math.round(Math.sin((speech.offset / 2 + index) * Math.PI * 2 * 220 / 24000) * 5000), index * 2)
    const frame = Buffer.alloc(28 + pcm.length); frame.set([77, 73, 1, 1]); frame.writeUInt32LE(current.generation, 4); frame.set(Buffer.from(speech.id.replaceAll('-', ''), 'hex'), 8); frame.writeUInt32LE(speech.sequence++, 24); frame.set(pcm, 28)
    socket.send(frame); speech.credit -= pcm.length; speech.offset += pcm.length
  }
  if (speech.offset >= 120000) { speech.ended = true; send('speech.end', { speechId: speech.id }) }
}
const server = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const part of req) raw += part; const body = raw ? JSON.parse(raw) : undefined
    if (req.url === '/api/v1/auth/login') return reply(res, { accessToken: 'local-synthetic-token', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'mock-test-user', displayName: '模拟测试', email: 'mock@example.test' } })
    if (req.headers.authorization !== 'Bearer local-synthetic-token') return reply(res, {}, 401)
    if (req.url === '/api/v1/auth/session' || req.url === '/api/v1/auth/logout') return reply(res, {})
    if (req.url === '/api/v1/platform') return reply(res, { user: { id: 'mock-test-user', displayName: '模拟测试', email: 'mock@example.test' }, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '', available: [] }, services: { asr: [], knowledge: [] }, limits: { maxAsrSessionSeconds: 3600 } })
    if (req.url === '/api/v1/background') return reply(res, library)
    if (req.url === '/api/v1/user-preferences') return reply(res, preferences)
    if (req.url === '/api/v1/wallet') return reply(res, { availableSeconds: 0, version: 1, session: null, serverTime: new Date().toISOString() })
    if (req.url === '/api/v1/session-records') return reply(res, { records: [], nextCursor: null })
    if (req.url === '/api/v1/references') return reply(res, [])
    if (req.url === '/api/v1/telemetry/settings') return reply(res, { enabled: false })
    if (req.url === '/api/v1/mock-wallet') return reply(res, { availableSeconds: 1800, version: 1 })
    if (req.url === '/api/v1/mock-wallet/ledger') return reply(res, { items: [{ id: '1', deltaSeconds: 1800, balanceAfterSeconds: 1800, reason: '合成管理员发放', createdAt: now }] })
    if (req.url === '/api/v1/mock-interviews/capabilities') return reply(res, { enabled: true, voices: [{ id: 'test', name: '测试音色' }], avatars: [{ id: 'rewick-interviewer', name: '卡通面试官' }], durations: [15, 30, 45] })
    if (req.url === '/api/v1/mock-interviews') return reply(res, req.method === 'POST' ? current : { items: [current] })
    if (req.url === `/api/v1/mock-interviews/${id}`) return reply(res, req.method === 'DELETE' ? { deleted: true } : current)
    if (req.url === `/api/v1/mock-interviews/${id}/commands`) {
      commands.push(body)
      if (['start', 'repeat', 'resume'].includes(body.command)) speak()
      else if (body.command === 'playback_completed' || body.command === 'interrupt') { current = { ...current, state: 'listening', version: current.version + 1, generation: current.generation + 1 }; state(true) }
      else if (body.command === 'submit_answer') { current.turns = current.turns.map(turn => turn.id === body.turnId ? { ...turn, answerText: body.text, status: 'answered' } : turn); current = { ...current, state: 'deciding', version: current.version + 1, generation: current.generation + 1 }; state() }
      else if (body.command === 'skip') { current.turns = current.turns.map(turn => turn.id === current.currentTurnId ? { ...turn, status: 'skipped' } : turn); current = { ...current, state: 'paused', version: current.version + 1, generation: current.generation + 1 }; state() }
      else if (body.command === 'pause' || body.command === 'finish') { current = { ...current, state: body.command === 'finish' ? 'completed' : 'paused', version: current.version + 1, generation: current.generation + 1 }; state() }
      return reply(res, current)
    }
    suppliers.push(req.url); return reply(res, {}, 404)
  } catch (error) { errors.push(String(error)); reply(res, {}, 500) }
})
const wss = new WebSocketServer({ server })
wss.on('connection', (ws, req) => {
  assert.equal(req.headers.authorization, 'Bearer local-synthetic-token'); socket = ws
  ws.on('message', (raw, binary) => {
    if (binary) { const bytes = Buffer.from(raw); assert.equal(bytes.toString('ascii', 0, 2), 'MI'); assert.equal(bytes[3], 0); if (bytes.readUInt32LE(4) !== current.generation || current.state !== 'listening') return; micFrames++; return }
    const event = JSON.parse(raw.toString())
    if (event.kind === 'connect') state(current.state === 'listening')
    if (event.kind === 'playback.credit' && event.speechId === speech?.id && event.generation === current.generation) { consumedCredit += event.bytes; speech.credit += event.bytes; flush() }
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`
let application, page
try {
  await promisify(execFile)(process.execPath, [join(frontend, 'node_modules/electron-vite/bin/electron-vite.js'), 'build', '--outDir', join(temporary, 'out')], { cwd: frontend, env: { ...process.env, COPILOT_PLATFORM_URL: baseUrl }, maxBuffer: 500000, timeout: 120000 })
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ ...JSON.parse(await readFile(join(frontend, 'package.json'))), main: 'out/main/index.js' }))
  await symlink(join(frontend, 'node_modules'), join(temporary, 'node_modules'), 'dir'); await symlink(join(frontend, 'scripts'), join(temporary, 'scripts'), 'dir')
  const env = { ...process.env, COPILOT_USER_DATA: join(temporary, 'profile') }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  application = await _electron.launch({ executablePath: electronPath, args: [temporary, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], cwd: frontend, env, timeout: 45000 })
  page = await application.firstWindow(); page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination()
      gain.gain.value = 0; oscillator.connect(gain); gain.connect(destination); oscillator.start()
      for (const track of destination.stream.getTracks()) { const original = track.stop.bind(track); track.stop = () => { original(); oscillator.stop(); void context.close() } }
      return destination.stream
    }
  })
  await page.evaluate(async () => { await window.copilot.platformLogin({ identifier: 'mock@example.test', password: 'local-synthetic-password' }) })
  await page.getByRole('button', { name: '模拟面试', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AI 模拟面试', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '检查麦克风与扬声器', exact: true }).click()
  await expect(page.getByRole('main').getByRole('button', { name: '准备面试', exact: true })).toBeEnabled()
  await page.getByRole('main').getByRole('button', { name: '准备面试', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始面试', exact: true })).toBeEnabled()
  checks.push('real renderer/device preflight + scoped IPC/REST creates independent mock session with assist balance0')
  await page.getByRole('button', { name: '开始面试', exact: true }).click()
  await expect.poll(() => consumedCredit).toBeGreaterThan(96000)
  await expect.poll(() => commands.some(value => value.command === 'playback_completed')).toBe(true)
  await expect.poll(() => micFrames).toBeGreaterThan(0)
  checks.push('real worklet playback consumes credits and drains before listening; synthetic microphone PCM passes 28byte protocol')
  const answer = page.getByRole('textbox', { name: /你的回答/ })
  send('transcript.partial', { id: 'final1', text: '我负责', isFinal: false, startMs: 0 })
  await expect(answer).toHaveValue('我负责')
  send('transcript.partial', { id: 'final1', text: '我负责缓存设计', isFinal: false, startMs: 0 })
  await expect(answer).toHaveValue('我负责缓存设计')
  await expect(page.getByText('正在倾听，停顿 1.8 秒后自动提交。', { exact: true })).toBeVisible()
  checks.push('live ASR partials replace text directly inside answer textarea')
  send('transcript.final', { id: 'final1', text: '嗯。', isFinal: true, startMs: 0 }); await new Promise(resolve => setTimeout(resolve, 2000))
  assert.equal(commands.filter(value => value.command === 'submit_answer').length, 0)
  send('transcript.final', { id: 'final1', text: '我负责缓存和数据库的一致性。', isFinal: true, startMs: 0 })
  await expect.poll(() => commands.filter(value => value.command === 'submit_answer').length).toBe(1)
  checks.push('acknowledgements ignored; complete answer automatically submits once after1.8seconds')
  await page.getByRole('button', { name: '暂停', exact: true }).click(); await expect(page.getByRole('button', { name: '恢复面试', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '恢复面试', exact: true }).click(); await page.getByRole('button', { name: '打断并回答', exact: true }).click()
  await expect(page.getByRole('button', { name: '我回答完了', exact: true })).toBeVisible()
  checks.push('pause/resume and immediate button interruption return to microphone safely')
  const before = commands.length
  await application.evaluate(({ webContents }, url) => webContents.getAllWebContents().find(value => value.getURL() === url)?.send('copilot:event', { kind: 'shortcut', action: 'toggle-source' }), page.url())
  assert.equal(commands.length, before)
  await page.screenshot({ path: join(output, 'mock-interview-active.png') })
  await page.getByRole('button', { name: '结束面试', exact: true }).click(); await expect(page.getByRole('heading', { name: '面试问答', exact: true })).toBeVisible()
  await page.screenshot({ path: join(output, 'mock-interview-report.png') })
  const exportPath = join(temporary, 'mock-qa.md')
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, exportPath)
  await page.getByRole('button', { name: '导出 Q&A Markdown', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出 Q&A Markdown', exact: true })).toBeEnabled()
  await expect.poll(async () => readFile(exportPath, 'utf8').catch(() => '')).toContain('我负责缓存和数据库的一致性。')
  const markdown = await readFile(exportPath, 'utf8')
  assert.ok(markdown.includes('请介绍你负责的项目。'))
  checks.push('finish releases media; native save dialog exports actual saved Q&A Markdown')
  await page.getByRole('button', { name: '余额流水', exact: true }).click(); await expect(page.getByText(/合成管理员发放/)).toBeVisible()
  assert.equal(errors.length, 0, errors.join('\n'))
  assert.ok(!suppliers.some(value => /answer|asr|llm|report/.test(value)), JSON.stringify(suppliers))
  for (const check of checks) console.log(`PASS ${check}`)
} catch (error) {
  if (page) { await page.screenshot({ path: join(output, 'mock-interview-failure.png') }).catch(() => undefined); await writeFile(join(output, 'mock-interview-failure.txt'), await page.locator('body').innerText()) }
  throw error
} finally {
  await writeFile(join(output, 'mock-interview-report.json'), JSON.stringify({ checks, errors, realElectron: true, fakeSuppliers: true, syntheticAudio: true, realMicTested: false, realProviderTested: false }, null, 2))
  await application?.close().catch(() => undefined)
  for (const client of wss.clients) client.terminate()
  await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true })
}
