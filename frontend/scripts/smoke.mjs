import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { startMockServices } from './mock-services.mjs'
import { loginForSmoke } from './mock-auth.mjs'
import { checkAutoAnswers } from '../tests/e2e/auto-answer.mjs'
import { checkAnswerScroll } from '../tests/e2e/answer-scroll.mjs'
import { checkQuestionAssembly } from '../tests/e2e/question-assembly.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results')
const userData = await mkdtemp(join(tmpdir(), 'interview-copilot-e2e-'))
const fakeAsrKey = 'sk-local-e2e-asr-only-not-a-real-key'
const fakeLlmKey = 'sk-local-e2e-llm-only-not-a-real-key'
const spokenAnswerEnding = '接着我会结合执行计划检查索引和扫描行数，再用实际查询验证优化有没有效果。'
const editedTranscriptText = '我负责支付系统的架构。\n主要优化查询性能。'
const checked = expect.configure({ timeout: 10_000 })
const report = {
  providerMode: 'local simulated HTTP/SSE and Aliyun WebSocket protocol',
  liveProviderTested: false,
  realAudioCaptureTested: false,
  realModelSpokenQualityTested: false,
  chromiumCompositionTested: false,
  macosInputMethodTested: false,
  simulatedAudioCaptureTested: false,
  simulatedSystemAudioCaptureTested: false,
  realSystemAudioCaptureTested: false,
  simulatedSystemCaptureFailureIpcTested: false,
  legacyAutoAnswerMigrationTested: false,
  nativeWindowBlurDismissalTested: false,
  syntheticWindowBlurEventDismissalTested: false,
  checks: [],
  screenshots: [],
}
await mkdir(output, { recursive: true })
const mock = await startMockServices()
let app
let page
let editedRecordId
let manualConnectionIndex

async function launch({ fakeMedia = true } = {}) {
  const environment = { ...process.env, COPILOT_USER_DATA: userData }
  delete environment.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({
    executablePath: electronPath,
    args: ['.', ...(fakeMedia ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : [])],
    cwd: root,
    env: environment,
    timeout: 45_000,
  })
  page = await app.firstWindow()
  page.setDefaultTimeout(10_000)
  await page.waitForFunction(() => Boolean(window.copilot))
  await loginForSmoke(page, mock)
  await page.evaluate(() => {
    window.__smokeEvents = []
    window.copilot.onEvent((event) => window.__smokeEvents.push(event))
  })
}

async function checkpoint(name, run) {
  await run()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}

async function settingsPatch({ asr = {}, llm = {}, ...rest } = {}) {
  return page.evaluate(async (patch) => {
    if (patch.rest.context) {
      let library = await window.copilot.getInterviewLibrary()
      const environment = library.environments.find(value => value.id === library.activeEnvironmentId)
      const before = new Set(library.resumes.map(value => value.id))
      library = await window.copilot.saveResume({ ...patch.rest.context, ...(environment.resumeId ? { id: environment.resumeId } : {}) })
      const resume = library.resumes.find(value => value.id === environment.resumeId) ?? library.resumes.find(value => !before.has(value.id))
      await window.copilot.saveEnvironment({ id: environment.id, name: environment.name, resumeId: resume.id,
        targetId: environment.targetId, referenceIds: environment.referenceIds })
    }
    if (patch.rest.interviewTarget) {
      let library = await window.copilot.getInterviewLibrary()
      const environment = library.environments.find(value => value.id === library.activeEnvironmentId)
      const before = new Set(library.targets.map(value => value.id))
      library = await window.copilot.saveTarget({ ...patch.rest.interviewTarget, name: '模拟测试岗位', ...(environment.targetId ? { id: environment.targetId } : {}) })
      const target = library.targets.find(value => value.id === environment.targetId) ?? library.targets.find(value => !before.has(value.id))
      await window.copilot.saveEnvironment({ id: environment.id, name: environment.name, resumeId: environment.resumeId,
        targetId: target.id, referenceIds: environment.referenceIds })
    }
    const current = await window.copilot.getSettings()
    for (const kind of ['llm', 'asr']) {
      const change = patch[kind]
      if (!Object.keys(change).length || current.serviceSelections?.[kind]?.source !== 'custom') continue
      const profile = current.customServices.find(value => value.id === current.serviceSelections[kind].id)
      if (!profile) continue
      await window.copilot.saveCustomService({ ...profile, url: change.baseUrl ?? change.url ?? profile.url,
        model: change.model ?? profile.model, apiKey: change.apiKey ?? patch.keys[kind] })
    }
    return window.copilot.saveSettings({
      ...current,
      ...patch.rest,
      asr: { ...current.asr, ...patch.asr },
      llm: { ...current.llm, ...patch.llm },
    })
  }, { asr, llm, rest, keys: { asr: fakeAsrKey, llm: fakeLlmKey } })
}

async function screenshot(filename) {
  await page.screenshot({ path: join(output, filename), fullPage: true, animations: 'disabled' })
  report.screenshots.push(filename)
}

async function findSettingsFile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isFile() && entry.name === 'settings.json') return path
    if (entry.isDirectory()) {
      const found = await findSettingsFile(path)
      if (found) return found
    }
  }
  return undefined
}

try {
  await launch({ fakeMedia: false })
  await checkpoint('isolated Electron renderer and encrypted settings', async () => {
    report.version = await app.evaluate(({ app }) => app.getVersion())
    assert.deepEqual((await page.evaluate(() => window.copilot.getSettings())).autoAnswer, { enabled: true, pauseMs: 1500 })
    const security = await app.evaluate(({ BrowserWindow }) => {
      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      return { nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox }
    })
    assert.equal(security.nodeIntegration, false)
    assert.equal(security.contextIsolation, true)
    assert.equal(security.sandbox, true)
    assert.deepEqual(await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process })),
      { require: 'undefined', process: 'undefined' })

    const saved = await settingsPatch({
      asr: { url: mock.asrUrl, model: 'fun-asr-realtime', apiKey: fakeAsrKey, silenceMs: 800 },
      llm: { baseUrl: mock.llmBaseUrl, model: 'mock-fast', apiKey: fakeLlmKey, temperature: 0.5 },
      context: { name: '模拟测试资料', text: '测试候选人开发过订单系统，使用慢查询日志定位性能问题。' },
      answerStyle: 'concise',
    })
    assert.equal(saved.asr.hasApiKey, true)
    assert.equal(saved.llm.hasApiKey, true)
    assert.equal('apiKey' in saved.asr, false)
    assert.equal('apiKey' in saved.llm, false)
    const readBack = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(JSON.stringify(readBack).includes(fakeAsrKey), false)
    assert.equal(JSON.stringify(readBack).includes(fakeLlmKey), false)
    const savedPath = await findSettingsFile(userData)
    assert.ok(savedPath, 'settings file should be persisted in the isolated profile')
    const disk = await readFile(savedPath, 'utf8')
    assert.equal(disk.includes(fakeAsrKey), false)
    assert.equal(disk.includes(fakeLlmKey), false)
  })

  // Hydrate the isolated fake credentials before testing the native request handler.
  await page.reload()
  await page.waitForFunction(() => Boolean(window.copilot))
  await checkpoint('system capture source failure reaches the UI through real IPC without opening ASR', async () => {
    const failureMessage = '模拟系统音频来源不可用'
    const previousConnections = mock.asrConnections.length
    await app.evaluate(({ desktopCapturer, systemPreferences }, message) => {
      const originalGetSources = desktopCapturer.getSources
      const originalGetMediaAccessStatus = systemPreferences.getMediaAccessStatus
      globalThis.__smokeCaptureSourceCalls = 0
      globalThis.__smokeRestoreCapture = () => {
        desktopCapturer.getSources = originalGetSources
        systemPreferences.getMediaAccessStatus = originalGetMediaAccessStatus
        delete globalThis.__smokeRestoreCapture
        delete globalThis.__smokeCaptureSourceCalls
      }
      // Fail before any native source enumeration or recording can take place.
      desktopCapturer.getSources = async () => {
        globalThis.__smokeCaptureSourceCalls += 1
        throw new Error(message)
      }
      systemPreferences.getMediaAccessStatus = type => type === 'screen'
        ? 'granted' : originalGetMediaAccessStatus.call(systemPreferences, type)
    }, failureMessage)
    try {
      await page.getByRole('button', { name: '系统音频', exact: true }).click()
      await page.getByRole('button', { name: '开始转写', exact: true }).click()
      await checked(page.getByRole('alert')).toHaveText(failureMessage)
      await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
      assert.equal(await app.evaluate(() => globalThis.__smokeCaptureSourceCalls), 1)
      assert.equal(await page.evaluate(() => window.copilot.getCaptureError()), failureMessage)
      assert.equal(mock.asrConnections.length, previousConnections)
      await checked(page.getByText(/Invalid capture constraints/i)).toHaveCount(0)
      await screenshot('capture-source-error.png')
      report.simulatedSystemCaptureFailureIpcTested = true
    } finally {
      await app.evaluate(() => globalThis.__smokeRestoreCapture?.())
    }
  })

  await app.close()
  app = undefined
  await launch()

  await checkpoint('connection check uses configured local provider and main-process key', async () => {
    const connection = await page.evaluate(() => window.copilot.testModel())
    assert.ok(connection.latencyMs >= 0)
    assert.ok(connection.message.length > 0)
    assert.equal(mock.requests.at(-1).authorization, `Bearer ${fakeLlmKey}`)
    assert.equal(mock.requests.at(-1).body.model, 'mock-fast')
  })

  await checkpoint('immediate cancellation prevents a pending model request from starting', async () => {
    const previousRequests = mock.requests.length
    await page.evaluate(async () => {
      const pending = window.copilot.generateAnswer({
        requestId: 'cancel-before-settings-resolve',
        question: '此请求应在读取设置期间取消。',
        transcript: '',
      })
      await Promise.all([pending, window.copilot.cancelAnswer()])
    })
    assert.equal(mock.requests.length, previousRequests)
  })

  await checkpoint('Aliyun PCM stream, interim correction, and final flush on stop', async () => {
    const { sessionId } = await page.evaluate(() => window.copilot.startAsr())
    await page.evaluate((id) => {
      window.copilot.sendAudio(id, new Int16Array(1600).fill(1).buffer)
      window.copilot.sendAudio(id, new Int16Array(1600).fill(2).buffer)
    }, sessionId)
    await checked.poll(() => mock.asrConnections[0]?.audioBytes).toBe(6400)
    await checked.poll(() => page.evaluate((id) => window.__smokeEvents.some((event) =>
      event.kind === 'transcript' && event.sessionId === id && event.segment.text === '你如何排查慢查询' && !event.segment.isFinal), sessionId)).toBe(true)
    await page.evaluate(() => window.copilot.stopAsr())
    const events = await page.evaluate((id) => window.__smokeEvents.filter((event) => event.sessionId === id), sessionId)
    const transcript = events.filter((event) => event.kind === 'transcript').map((event) => event.segment)
    assert.ok(transcript.some((segment) => segment.text === '你如何排查慢查询？' && segment.isFinal))
    const firstSentence = transcript.filter((segment) => segment.startMs === 0)
    assert.ok(firstSentence.length >= 2)
    assert.equal(new Set(firstSentence.map((segment) => segment.id)).size, 1, 'interim and final must share an id')
    const connection = mock.asrConnections[0]
    assert.equal(connection.authorization, `Bearer ${fakeAsrKey}`)
    assert.equal(connection.commands[0].header.action, 'run-task')
    assert.equal(connection.commands[0].payload.parameters.sample_rate, 16000)
    assert.equal(connection.commands[0].payload.parameters.format, 'pcm')
    assert.equal(connection.commands.at(-1).header.action, 'finish-task')
    assert.equal(connection.finished, true)
  })

  await checkpoint('ASR failure is surfaced and a clean replacement session can start', async () => {
    await settingsPatch({ asr: { url: `${mock.asrUrl}?mode=error` } })
    const failure = await page.evaluate(async () => {
      try { await window.copilot.startAsr(); return null }
      catch (error) { return String(error) }
    })
    assert.ok(failure && /鉴权|认证|API Key/.test(failure), 'provider error must reach caller')
    await settingsPatch({ asr: { url: mock.asrUrl } })
    const { sessionId } = await page.evaluate(() => window.copilot.startAsr())
    await page.evaluate((id) => {
      window.copilot.sendAudio('stale-session', new Int16Array(1600).buffer)
      window.copilot.sendAudio(id, new Int16Array(1600).buffer)
    }, sessionId)
    await checked.poll(() => mock.asrConnections.at(-1).audioBytes).toBe(3200)
    await page.evaluate(() => window.copilot.stopAsr())
    assert.equal(mock.asrConnections.at(-1).audioBytes, 3200)
  })

  // Reload to let the real UI hydrate the externally configured test settings.
  await page.reload()
  await page.waitForFunction(() => Boolean(window.copilot))
  await checkpoint('settings and both spoken answer styles can be edited and saved through the UI', async () => {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await page.getByRole('combobox', { name: /^回答模型/ }).selectOption('new')
    const custom = page.getByRole('dialog', { name: '添加回答模型', exact: true })
    await custom.getByLabel('配置名称', { exact: true }).fill('我的模拟模型')
    await custom.getByLabel('模型名称', { exact: true }).fill('mock-ui')
    await custom.getByLabel('API Key', { exact: true }).fill(fakeLlmKey)
    await custom.getByRole('button', { name: '保存并选用', exact: true }).click()
    await checked(custom).not.toBeVisible()
    const answerStyle = page.getByRole('combobox', { name: '回答风格', exact: true })
    await checked(answerStyle.getByRole('option')).toHaveText(['简短口语', '展开口语'])
    await answerStyle.selectOption({ label: '展开口语' })
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).llm.model)).toBe('mock-ui')
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).answerStyle)).toBe('detailed')
    await answerStyle.selectOption({ label: '简短口语' })
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).answerStyle)).toBe('concise')
    await screenshot('settings.png')
    await page.getByRole('button', { name: '关闭设置', exact: true }).click()
    await page.getByRole('button', { name: '工作台', exact: true }).click()
  })

  await checkpoint('synthetic microphone passes through AudioWorklet and stops with final transcript', async () => {
    const previousConnections = mock.asrConnections.length
    await page.getByRole('button', { name: '麦克风', exact: true }).click()
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(previousConnections + 1)
    await checked.poll(() => mock.asrConnections.at(-1).audioMessages).toBeGreaterThanOrEqual(2)
    await checked.poll(() => mock.asrConnections.at(-1).hasNonzeroPcm).toBe(true)
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('textbox', { name: '转写文字 2', exact: true })).toHaveValue('你如何排查慢查询？')
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    await checked.poll(() => page.evaluate(async () => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.segments.some((segment) => segment.text === '你如何排查慢查询？' && segment.isFinal))
    })).toBe(true)
    await screenshot('transcription.png')
    report.simulatedAudioCaptureTested = true
  })

  // v30 speech-actions: 历史转写条的操作按钮默认收起，需先悬停所在条目展开再点击。
  async function answerSentence(label) {
    const button = page.getByRole('button', { name: label, exact: true })
    await button.locator('xpath=ancestor::li[1]').hover()
    await button.click()
  }

  await checkpoint('answering a transcript sentence uses that sentence and preserves the manual draft', async () => {
    const sentence = '请介绍你做过的项目。'
    const draft = '完全无关的草稿：请解释浏览器的 CSS 层叠规则。'
    const previousRequests = mock.requests.length
    await page.getByLabel('当前问题', { exact: false }).fill(draft)
    await answerSentence(`回答这句：${sentence}`)
    const answer = page.getByRole('article', { name: '回答 1', exact: true })
    await checked(answer.getByRole('heading', { name: sentence, exact: true })).toBeVisible()
    await checked(answer.getByText('已完成', { exact: true })).toBeVisible()
    await checked(answer.getByText(spokenAnswerEnding, { exact: true })).toBeVisible()
    await checked(answer.getByText('口语回答', { exact: true })).toBeVisible()
    await checked(answer.getByRole('heading')).toHaveCount(1)
    await checked(answer.getByRole('list')).toHaveCount(0)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue(draft)
    assert.equal(mock.requests.length, previousRequests + 1)
    const message = mock.requests.at(-1).body.messages.find((item) => item.role === 'user')
    const payload = JSON.parse(message.content)
    assert.equal(payload.question, sentence)
    assert.equal(payload.transcript, sentence, 'later transcript segments must not enter the selected sentence context')
    assert.ok(payload.personalContext.includes('测试候选人开发过订单系统'))
    assert.equal(JSON.stringify(payload).includes(draft), false)
    await checked.poll(() => page.evaluate(async (question) => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.answers.some((answer) => answer.question === question && answer.status === 'complete'))
    }, sentence)).toBe(true)
    await screenshot('sentence-answer.png')
  })

  await checkpoint('selecting another transcript sentence cancels the old stream and answers the new sentence', async () => {
    const firstSentence = '请介绍你做过的项目。'
    const secondSentence = '你如何排查慢查询？'
    const draft = await page.getByLabel('当前问题', { exact: false }).inputValue()
    await settingsPatch({ llm: { model: 'mock-slow' } })
    await answerSentence(`回答这句：${firstSentence}`)
    const previousAnswer = page.getByRole('article', { name: '回答 2', exact: true })
    await checked(previousAnswer.getByText(/先确认性能瓶颈/)).toBeVisible()
    const previousRequest = mock.requests.at(-1)
    assert.equal(previousRequest.body.model, 'mock-slow')
    const previousCancellations = mock.stats.cancelledStreams
    await settingsPatch({ llm: { model: 'mock-ui' } })
    await answerSentence(`回答这句：${secondSentence}`)
    const nextAnswer = page.getByRole('article', { name: '回答 3', exact: true })
    await checked(nextAnswer.getByRole('heading', { name: secondSentence, exact: true })).toBeVisible()
    await checked(nextAnswer.getByText('已完成', { exact: true })).toBeVisible()
    await checked(previousAnswer.getByText('已停止', { exact: true })).toBeVisible()
    await checked.poll(() => previousRequest.cancelled).toBe(true)
    await checked.poll(() => mock.stats.cancelledStreams).toBeGreaterThan(previousCancellations)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue(draft)
    const message = mock.requests.at(-1).body.messages.find((item) => item.role === 'user')
    const payload = JSON.parse(message.content)
    assert.equal(payload.question, secondSentence)
    assert.equal(payload.transcript, `${firstSentence}\n${secondSentence}`)
    await page.getByRole('button', { name: '新会话', exact: true }).click()
  })

  await checkpoint('one click answers the visible focused sentence before a pending multiline update changes its height', async () => {
    await settingsPatch({ asr: { url: `${mock.asrUrl}?mode=manual` } })
    const previousConnections = mock.asrConnections.length
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(previousConnections + 1)
    const connectionIndex = mock.asrConnections.length - 1
    const visibleText = '请介绍你负责的系统。'
    const pendingText = '请介绍你负责的系统。\n具体承担了哪些职责？\n为什么采用现在的架构？\n遇到过哪些技术难题？\n你如何处理这些问题？\n最后取得了什么结果？'
    const first = page.getByRole('textbox', { name: '转写文字 1', exact: true })
    mock.sendSentence(connectionIndex, { sentenceId: 0, text: visibleText, isFinal: false })
    await checked(first).toHaveValue(visibleText)
    await first.focus()
    const previousHeight = (await first.boundingBox()).height
    mock.sendSentence(connectionIndex, { sentenceId: 0, text: pendingText, isFinal: false })
    mock.sendSentence(connectionIndex, { sentenceId: 1, text: '这是一条用于确认更新已经送达的新句。', isFinal: true })
    await checked(page.getByRole('textbox', { name: '转写文字 2', exact: true })).toHaveValue('这是一条用于确认更新已经送达的新句。')
    await checked(first).toHaveValue(visibleText)
    await checked(first).toBeFocused()
    const previousRequests = mock.requests.length
    await page.getByRole('listitem').filter({ has: first }).hover()
    await page.getByRole('listitem').filter({ has: first }).getByRole('button', { name: /回答这句/ }).click()
    const answer = page.getByRole('article', { name: '回答 1', exact: true })
    await checked(answer.getByRole('heading')).toHaveText(visibleText)
    await checked(answer.getByText('已完成', { exact: true })).toBeVisible()
    assert.equal(mock.requests.length, previousRequests + 1, 'a single mouse click should start exactly one answer')
    const message = mock.requests.at(-1).body.messages.find((item) => item.role === 'user')
    const payload = JSON.parse(message.content)
    assert.equal(payload.question, visibleText)
    assert.equal(payload.transcript, visibleText)
    await checked(first).toHaveValue(pendingText)
    await checked.poll(async () => (await first.boundingBox()).height).toBeGreaterThan(previousHeight)
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '新会话', exact: true }).click()
  })

  await checkpoint('live transcript editing preserves focus, Chinese composition, selection, and native undo', async () => {
    await settingsPatch({ asr: { url: `${mock.asrUrl}?mode=manual` } })
    const previousConnections = mock.asrConnections.length
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(previousConnections + 1)
    manualConnectionIndex = mock.asrConnections.length - 1
    const first = page.getByRole('textbox', { name: '转写文字 1', exact: true })
    const second = page.getByRole('textbox', { name: '转写文字 2', exact: true })
    mock.sendSentence(manualConnectionIndex, { sentenceId: 0, text: '我负责订单吸统的架构', isFinal: false })
    await checked(first).toHaveValue('我负责订单吸统的架构')
    await checked(first).toBeEditable()
    await first.focus()
    mock.sendSentence(manualConnectionIndex, { sentenceId: 0, text: '我负责订单系统的架构。', isFinal: false })
    mock.sendSentence(manualConnectionIndex, { sentenceId: 1, text: '你如何排查慢查询？', isFinal: true })
    await checked(second).toHaveValue('你如何排查慢查询？')
    await checked(first).toHaveValue('我负责订单吸统的架构')
    await checked(first).toBeFocused()
    await second.focus()
    await checked(first).toHaveValue('我负责订单系统的架构。')

    const original = '我负责订单系统的架构。\n主要优化查询性能。'
    await first.fill(original)
    await first.evaluate((element) => {
      window.__compositionEvents = []
      for (const type of ['compositionstart', 'compositionend']) {
        element.addEventListener(type, () => window.__compositionEvents.push(type))
      }
      element.setSelectionRange(3, 5)
    })
    const cdp = await page.context().newCDPSession(page)
    try {
      await cdp.send('Input.imeSetComposition', { text: '支付', selectionStart: 2, selectionEnd: 2, replacementStart: 3, replacementEnd: 5 })
      await checked(first).toHaveValue(editedTranscriptText)
      mock.sendSentence(manualConnectionIndex, { sentenceId: 0, text: '这条服务端临时文本不能打断中文组合输入。', isFinal: false })
      mock.sendSentence(manualConnectionIndex, { sentenceId: 1, text: '你如何排查慢查询和索引问题？', isFinal: true })
      await checked(second).toHaveValue('你如何排查慢查询和索引问题？')
      await checked(first).toHaveValue(editedTranscriptText)
      await cdp.send('Input.insertText', { text: '支付' })
      assert.deepEqual(await page.evaluate(() => window.__compositionEvents), ['compositionstart', 'compositionend'])
      report.chromiumCompositionTested = true
    } finally { await cdp.detach() }
    await checked(first).toHaveValue(editedTranscriptText)
    assert.deepEqual(await first.evaluate((element) => [element.selectionStart, element.selectionEnd]), [5, 5])
    await first.press('Meta+z')
    await checked(first).toHaveValue(original)
    await first.press('Meta+Shift+z')
    await checked(first).toHaveValue(editedTranscriptText)
    await first.evaluate((element) => element.setSelectionRange(7, 7))
    mock.sendSentence(manualConnectionIndex, { sentenceId: 0, text: '这条服务端最终文本不能覆盖手动修正。', isFinal: true, endMs: 1800 })
    mock.sendSentence(manualConnectionIndex, { sentenceId: 2, text: '你还做过哪些稳定性', isFinal: false })
    await checked(page.getByRole('textbox', { name: '转写文字 3', exact: true })).toHaveValue('你还做过哪些稳定性')
    await checked(first).toHaveValue(editedTranscriptText)
    await checked(first).toBeFocused()
    assert.deepEqual(await first.evaluate((element) => [element.selectionStart, element.selectionEnd]), [7, 7])
    await second.focus()
    await checked(first).toHaveValue(editedTranscriptText)
    mock.sendSentence(manualConnectionIndex, { sentenceId: 2, text: '你还做过哪些稳定性优化？', isFinal: true })
    await checked(page.getByRole('textbox', { name: '转写文字 3', exact: true })).toHaveValue('你还做过哪些稳定性优化？')
  })

  await checkpoint('edited transcript drives the answer, disables empty rows, and saves on blur', async () => {
    const first = page.getByRole('textbox', { name: '转写文字 1', exact: true })
    const second = page.getByRole('textbox', { name: '转写文字 2', exact: true })
    const firstRow = page.getByRole('listitem').filter({ has: first })
    const secondRow = page.getByRole('listitem').filter({ has: second })
    await second.fill('  \n ')
    await checked(secondRow.getByRole('button', { name: /回答这句/ })).toBeDisabled()
    await second.fill('你如何排查慢查询？')
    await page.getByLabel('当前问题', { exact: false }).fill('这个草稿不能覆盖刚刚修正的转写文字。')
    await checked.poll(() => page.evaluate(async (text) => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.segments.some((segment) => segment.text === text && segment.isEdited && segment.isFinal && segment.endMs === 1800))
    }, editedTranscriptText)).toBe(true)
    await firstRow.hover()
    await firstRow.getByRole('button', { name: /回答这句/ }).click()
    const answer = page.getByRole('article', { name: '回答 1', exact: true })
    await checked(answer.getByRole('heading')).toHaveText(editedTranscriptText)
    await checked(answer.getByText('已完成', { exact: true })).toBeVisible()
    const message = mock.requests.at(-1).body.messages.find((item) => item.role === 'user')
    const payload = JSON.parse(message.content)
    assert.equal(payload.question, editedTranscriptText)
    assert.equal(payload.transcript, editedTranscriptText)
    await checked(first).toHaveValue(editedTranscriptText)
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    const records = await page.evaluate(() => window.copilot.getHistory())
    const record = records.find((entry) => entry.segments.some((segment) => segment.text === editedTranscriptText))
    assert.ok(record, 'edited transcript must be saved without an edit/save button')
    editedRecordId = record.id
    assert.ok(record.answers.some((entry) => entry.question === editedTranscriptText && entry.status === 'complete'))
    await screenshot('transcript-edit.png')
    await settingsPatch({ asr: { url: mock.asrUrl } })
    await page.getByRole('button', { name: '新会话', exact: true }).click()
  })

  await checkpoint('manual question produces a complete Chinese streaming answer and history', async () => {
    await page.getByLabel('当前问题', { exact: false }).fill('请介绍你如何定位订单系统的慢查询？')
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue('')
    await checked(page.getByText(spokenAnswerEnding, { exact: true })).toBeVisible()
    await checked.poll(() => page.evaluate(async () => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.answers.some((answer) => answer.question === '请介绍你如何定位订单系统的慢查询？' && answer.status === 'complete' && answer.text.includes('验证优化有没有效果')))
    })).toBe(true)
    const request = mock.requests.at(-1)
    assert.equal(request.body.model, 'mock-ui')
    assert.equal(request.body.stream, true)
    assert.equal(JSON.parse(request.body.messages.find(item => item.role === 'user').content).question,
      '请介绍你如何定位订单系统的慢查询？')
    const messages = JSON.stringify(request.body.messages)
    assert.ok(messages.includes('订单系统'))
    assert.ok(messages.includes('请介绍你如何定位'))
    await screenshot('workspace.png')
  })

  await checkpoint('cancel keeps received text and closes the upstream stream', async () => {
    const previousCancellations = mock.stats.cancelledStreams
    await settingsPatch({ llm: { model: 'mock-slow' } })
    await page.getByLabel('当前问题', { exact: false }).fill('如果查询性能突然下降，你会怎么排查？')
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked(page.getByText(/先确认性能瓶颈/)).toBeVisible()
    await page.getByRole('button', { name: '停止生成', exact: true }).click()
    await checked.poll(() => mock.stats.cancelledStreams).toBeGreaterThan(previousCancellations)
    await checked.poll(() => page.evaluate(async () => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.answers.some((answer) => answer.question === '如果查询性能突然下降，你会怎么排查？' && answer.status === 'cancelled' && answer.text.includes('先确认')))
    })).toBe(true)
  })

  await checkpoint('a provider error is visible and persists with the failed answer', async () => {
    await settingsPatch({ llm: { model: 'mock-error' } })
    await page.getByLabel('当前问题', { exact: false }).fill('这次请求用于验证连接错误。')
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked(page.getByRole('alert').filter({ hasText: /模拟|401|API Key/ })).toBeVisible()
    await checked.poll(() => page.evaluate(async () => {
      const records = await window.copilot.getHistory()
      return records.some((record) => record.answers.some((answer) => answer.status === 'error' && Boolean(answer.error)))
    })).toBe(true)
  })

  await checkpoint('history and compact window remain usable', async () => {
    await page.getByRole('button', { name: '会话记录', exact: true }).click()
    await checked(page.getByText('请介绍你如何定位订单系统的慢查询？', { exact: true }).first()).toBeVisible()
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: '请介绍你如何定位订单系统的慢查询？', exact: true }) }).click()
    await checked(page.getByRole('article', { name: '回答 1', exact: true }).getByText(spokenAnswerEnding, { exact: true })).toBeVisible()
    await screenshot('history.png')
    await page.getByRole('button', { name: '工作台', exact: true }).click()
    await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
    const compactBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    assert.ok(compactBounds.width <= 650)
    await screenshot('compact.png')
    await page.getByRole('button', { name: '恢复完整窗口', exact: true }).click()
    const expandedBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    assert.ok(expandedBounds.width > compactBounds.width)
  })

  await checkAutoAnswers({ app, page, mock, checked, checkpoint, settingsPatch, screenshot, report })
  await checkQuestionAssembly({ app, page, mock, checked, checkpoint, settingsPatch, screenshot, report })
  await checkAnswerScroll({ app, page, checked, checkpoint, settingsPatch, screenshot, report })

  await checkpoint('app restart migrates legacy automatic-answer settings and restores encrypted keys and history', async () => {
    await settingsPatch({ llm: { model: 'mock-fast' } })
    await app.close()
    app = undefined
    // Simulate an older profile using only the isolated test settings file.
    const settingsPath = await findSettingsFile(userData)
    const persisted = JSON.parse(await readFile(settingsPath, 'utf8'))
    delete persisted.settings.autoAnswer
    await writeFile(settingsPath, `${JSON.stringify(persisted, null, 2)}\n`)
    await launch()
    const restored = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(restored.llm.model, 'mock-fast')
    assert.equal(restored.llm.hasApiKey, true)
    assert.equal(restored.asr.hasApiKey, true)
    assert.deepEqual(restored.autoAnswer, { enabled: true, pauseMs: 1500 })
    report.legacyAutoAnswerMigrationTested = true
    await page.evaluate(() => window.copilot.testModel())
    assert.equal(mock.requests.at(-1).authorization, `Bearer ${fakeLlmKey}`)
    const records = await page.evaluate(() => window.copilot.getHistory())
    assert.ok(records.some((record) => record.answers.some((answer) => answer.status === 'complete')))
    assert.ok(records.some((record) => record.answers.some((answer) => answer.status === 'cancelled')))
    const edited = records.find((record) => record.id === editedRecordId)
    assert.ok(edited?.segments.some((segment) => segment.text === editedTranscriptText && segment.isEdited && segment.isFinal && segment.endMs === 1800))
    assert.ok(edited?.answers.some((answer) => answer.question === editedTranscriptText && answer.status === 'complete'))
  })
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error instanceof Error ? error.stack : String(error)
  if (page && !page.isClosed()) await screenshot('failure.png').catch(() => undefined)
  console.error(report.error)
  process.exitCode = 1
} finally {
  await writeFile(join(output, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await app?.close().catch(() => undefined)
  await mock.close()
  await rm(userData, { recursive: true, force: true })
}
