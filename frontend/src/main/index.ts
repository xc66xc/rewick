import { PaymentClient } from './services/payment-client'
import { InterviewTimer } from './services/interview-timer'
import { AccountWorkspaces } from './services/account-workspace'
import { platformBaseUrl } from '../shared/defaults'
import { app, BrowserWindow, Menu, dialog, globalShortcut, ipcMain, safeStorage, session, systemPreferences, desktopCapturer } from 'electron'
import type { IpcMainInvokeEvent, Rectangle } from 'electron'
import { basename, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SettingsStore } from './services/settings-store'
import type { ServiceSecrets } from './services/settings-store'
import { PlatformService } from './services/platform-client'
import { testCustomService } from './services/custom-service-test'
import { customServiceSchema } from './services/custom-service-profiles'
import { PlatformWork } from './services/platform-work'
import { needsPlatform, routeService } from './services/service-routing'
import type { PlatformCapability } from './services/service-routing'
import { InterviewStore } from './services/interview-store'
import { environmentInputSchema } from './services/interview-validation'
import { SerialQueue } from './services/storage'
import { HistoryStore, sessionToMarkdown } from './services/history-store'
import { AsrClient } from './services/asr-client'
import { LlmClient } from './services/llm-client'
import { DisplayCaptureService } from './services/display-capture'
import { ReferenceService } from './services/reference-service'
import { extractDocument } from './services/document-extractor'
import { RemoteKnowledgeClient } from './services/remote-knowledge-client'
import { answerRequestSchema, parseInput, referencePatchSchema, settingsInputSchema } from './services/validation'
import type { AppEvent, Settings, SettingsInput, SessionRecord, RetrievalContext } from '../shared/types'
import { resolveInterviewSettings } from '../shared/interview-settings'

// IDE/terminal parents may lack NSAudioCaptureUsageDescription required by CoreAudio Tap.
// Use Electron's documented screen-recording capture path during macOS development.
if (process.platform === 'darwin' && !app.isPackaged) {
  const disabled = app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean)
  app.commandLine.appendSwitch('disable-features', [...new Set([...disabled, 'MacCatapLoopbackAudioForScreenShare'])].join(','))
}

const directory = fileURLToPath(new URL('.', import.meta.url))
if (process.env.COPILOT_USER_DATA) app.setPath('userData', process.env.COPILOT_USER_DATA)
app.setName('Interview Copilot')
let window: BrowserWindow | null = null
let asr: AsrClient | null = null
let llm: LlmClient | null = null
let fullBounds: Rectangle | null = null
let fullMaximized = false
let fullFullScreen = false
let compact = false
let startingAsr = false
let asrEpoch = 0
let answerEpoch = 0
let answerDispatchEpoch = 0
let pendingAnswerId: string | null = null
let retrievalController: AbortController | null = null
let activeAnswerId: string | null = null
let activeAsrId: string | null = null
let changingEnvironment = false
const interviewMutations = new SerialQueue()
const secretStorage = {
  encryptString: (value: string) => safeStorage.encryptString(value),
  decryptString: (value: Buffer) => safeStorage.decryptString(value),
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable()
}
const authSettings = new SettingsStore(join(app.getPath('userData'), 'authentication-v3'), secretStorage)
const platform = new PlatformService(authSettings)
const accounts = new AccountWorkspaces(app.getPath('userData'), secretStorage, () => emit({ kind: 'documents-changed' }), () => authSettings.getConnectionSnapshot(), async token => {
  await authSettings.clearPlatformSession(token)
  await syncAccount()
  emit({ kind: 'settings-changed' })
})
const interviewTimer = new InterviewTimer(wallet => emit({ kind: 'wallet-changed', wallet }), () => disposeWork())
async function walletConnection() {
  const snapshot = await authSettings.getConnectionSnapshot()
  if (!snapshot.settings.platform?.authenticated || !snapshot.secrets.platformAccessToken) throw new Error('请先登录。')
  return { baseUrl: snapshot.settings.platform.baseUrl, token: snapshot.secrets.platformAccessToken }
}
async function syncAccount() {
  const authenticated = await authSettings.getSettings()
  if (accounts.identity(authenticated) !== accounts.active?.id) { interviewTimer.dispose(); disposeWork() }
  return accounts.activate(authenticated)
}
const settings = new Proxy(authSettings, {
  get(_target, property) {
    if (property === 'getSettings' || property === 'getConnectionSnapshot' || property === 'getSecrets') return async () => {
      const auth = await authSettings.getConnectionSnapshot()
      const own = accounts.context.getStore() ?? accounts.active
      if (own && accounts.identity(auth.settings) !== own.id) throw new Error('账户已切换，请重试。')
      const snapshot = own ? await own.settings.getConnectionSnapshot() : auth
      const value = { settings: { ...snapshot.settings, platform: auth.settings.platform, accountScope: own?.id }, secrets: { ...snapshot.secrets, platformAccessToken: auth.secrets.platformAccessToken } }
      return property === 'getSettings' ? value.settings : property === 'getSecrets' ? value.secrets : value
    }
    if (property === 'saveSettings') return async (input: SettingsInput) => {
      const own = accounts.context.getStore() ?? accounts.active
      if (own) return own.settings.saveSettings(input)
      return authSettings.saveSettings(input)
    }
    const target = accounts.current().settings
    const method = Reflect.get(target, property)
    return typeof method === 'function' ? method.bind(target) : method
  }
})
const platformMutations = new SerialQueue()
const platformWork = new PlatformWork()
let releasePlatformAsr: (() => void) | undefined
let releasePlatformAnswer: (() => void) | undefined
function mutatePlatform<T>(operation: () => Promise<T>): Promise<T> {
  const finish = platformWork.beginChange()
  return platformMutations.run(operation).finally(finish)
}
async function serviceConnection(snapshot: { settings: Settings; secrets: ServiceSecrets }, capability: PlatformCapability, signal?: AbortSignal) {
  let config = snapshot.settings
  if (needsPlatform(config, snapshot.secrets, capability)) {
    try { const refreshed = await platform.refreshSnapshot(snapshot, signal); config = { ...config, platform: refreshed.platform } }
    finally {
      await syncAccount()
      emit({ kind: 'settings-changed' })
    }
  }
  return routeService(config, snapshot.secrets, capability)
}
async function testService(capability: 'llm' | 'knowledge'): Promise<{ latencyMs: number; message: string }> {
  const revision = platformWork.revision
  const controller = new AbortController()
  const snapshot = await settings.getConnectionSnapshot()
  let release: (() => void) | undefined
  try {
    if (needsPlatform(snapshot.settings, snapshot.secrets, capability)) {
      release = platformWork.track(revision, () => controller.abort(new Error('平台连接已更改，连接测试已取消。')))
    }
    const connection = await serviceConnection(snapshot, capability, controller.signal)
    return capability === 'llm'
      ? await new LlmClient(connection.settings, connection.apiKey, () => undefined, connection.platform).test(controller.signal)
      : await new RemoteKnowledgeClient(connection.settings.remoteKnowledge, connection.apiKey).test(controller.signal)
  } finally { release?.() }
}
async function retrieveRemote(snapshot: { settings: Settings; secrets: ServiceSecrets }, query: string, signal: AbortSignal, platformRevision: number): Promise<RetrievalContext> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  let release: (() => void) | undefined
  try {
    if (needsPlatform(snapshot.settings, snapshot.secrets, 'knowledge')) {
      release = platformWork.track(platformRevision, () => controller.abort(new Error('平台连接已更改，本次跳过远程知识库。')))
    }
    const connection = await serviceConnection(snapshot, 'knowledge', controller.signal)
    return await new RemoteKnowledgeClient(connection.settings.remoteKnowledge, connection.apiKey).retrieve(query, controller.signal)
  } catch (error) {
    signal.throwIfAborted()
    const message = error instanceof Error ? error.message : '远程知识库连接失败，本次继续回答。'
    return { status: 'degraded', excerpts: [], message, remote: { agentId: needsPlatform(snapshot.settings, snapshot.secrets, 'knowledge') ? 'platform' : snapshot.settings.remoteKnowledge.agentId, status: 'degraded', message } }
  } finally { release?.(); signal.removeEventListener('abort', onAbort) }
}
const history = scopedStore('history')
const displayCapture = new DisplayCaptureService({
  getSources: () => desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }),
  screenPermission: () => process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
})
const emit = (event: AppEvent): void => {
  const owner = accounts.context.getStore()
  if (owner && owner !== accounts.active) return
  if (event.kind === 'asr-status') {
    if (event.status === 'connecting' || event.status === 'listening' || event.status === 'stopping') activeAsrId = event.sessionId
    else if (activeAsrId === event.sessionId) { activeAsrId = null; releasePlatformAsr?.(); releasePlatformAsr = undefined }
  }
  if ((event.kind === 'answer-done' || event.kind === 'answer-error') && event.requestId === activeAnswerId) { activeAnswerId = null; releasePlatformAnswer?.(); releasePlatformAnswer = undefined }
  if (window && !window.isDestroyed()) window.webContents.send('copilot:event', event)
}
function scopedStore<K extends 'history' | 'interviews' | 'references'>(kind: K): ReturnType<AccountWorkspaces['current']>[K] {
  return new Proxy({} as ReturnType<AccountWorkspaces['current']>[K], { get(_target, property) {
    const target = accounts.current()[kind]
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}
const references = scopedStore('references')
const interviews = scopedStore('interviews')
async function effectiveSettings() {
  const value = await settings.getSettings()
  return accounts.active ? interviews.resolve(value) : value
}
function assertInterviewIdle() {
  if (interviewTimer.active) throw new Error('请先结束面试，再修改本次面试内容。')
  if (startingAsr || activeAsrId || pendingAnswerId || activeAnswerId) throw new Error('请先停止转写和回答，再切换或修改当前面试环境。')
}
function mutateInterviews<T>(operation: () => Promise<T>): Promise<T> {
  return interviewMutations.run(async () => {
    assertInterviewIdle()
    changingEnvironment = true
    try {
      const result = await operation()
      emit({ kind: 'interviews-changed' })
      return result
    } finally { changingEnvironment = false }
  })
}

function cancelAnswerWork(): void {
  releasePlatformAnswer?.(); releasePlatformAnswer = undefined
  answerEpoch++
  retrievalController?.abort()
  retrievalController = null
  llm?.cancel()
  activeAnswerId = null
  if (pendingAnswerId) emit({ kind: 'answer-done', requestId: pendingAnswerId, cancelled: true })
  pendingAnswerId = null
}

const serviceTests = new Set<AbortController>()

function disposeWork(): void {
  answerDispatchEpoch++
  for (const controller of serviceTests) controller.abort(new Error('登录状态已改变，连接测试已取消。'))
  serviceTests.clear()
  releasePlatformAsr?.(); releasePlatformAsr = undefined
  asrEpoch++
  startingAsr = false
  asr?.dispose()
  activeAsrId = null
  cancelAnswerWork()
}

function assertSender(event: IpcMainInvokeEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的应用请求')
}

function registerHandlers(): void {
  const publicChannels = new Set(['settings:get', 'settings:save', 'platform:login', 'platform:register', 'platform:email-code', 'platform:password-reset-code', 'platform:password-reset', 'platform:logout', 'platform:refresh', 'asr:stop', 'answer:cancel', 'window:compact', 'window:pin'])
  const handle = (channel: string, callback: (arg: unknown) => unknown): void => {
    ipcMain.handle(channel, async (event, envelope: unknown) => {
      assertSender(event)
      const { payload: arg, accountScope } = parseInput(z.object({ payload: z.unknown().optional(), accountScope: z.string().optional() }), envelope)
      const dispatch = channel === 'answer:generate' || channel === 'answer:cancel' ? ++answerDispatchEpoch : answerDispatchEpoch
      const asrDispatch = asrEpoch
      const owner = await syncAccount()
      if (accountScope && owner?.id !== accountScope && !channel.startsWith('platform:') && channel !== 'settings:get') throw new Error('账户已切换，旧操作已取消。')
      if (!publicChannels.has(channel) && (!owner || accountScope !== owner.id)) {
        disposeWork(); emit({ kind: 'settings-changed' })
        throw new Error('请先使用邮箱注册或登录。')
      }
      if (channel === 'answer:generate' && dispatch !== answerDispatchEpoch) {
        const request = parseInput(answerRequestSchema, arg)
        emit({ kind: 'answer-done', requestId: request.requestId, cancelled: true })
        return
      }
      if (channel === 'asr:start' && asrDispatch !== asrEpoch) throw new Error('转写连接已取消。')
      if (channel.startsWith('platform:') || !owner) return callback(arg)
      const result = await accounts.context.run(owner, () => callback(arg))
      if (accounts.active !== owner) throw new Error('账户已切换，旧请求结果已丢弃。')
      return result
    })
  }
  async function paymentRequest<T>(operation: (client: PaymentClient) => Promise<T>): Promise<T> {
    const revision = platformWork.revision
    const connection = await walletConnection()
    const controller = new AbortController()
    const release = platformWork.track(revision, () => controller.abort(new Error('账户已切换，支付请求已取消。')))
    try { return await operation(new PaymentClient(connection, controller.signal)) }
    finally { release() }
  }
  handle('payments:catalog', () => paymentRequest(client => client.catalog()))
  handle('payments:list', () => paymentRequest(client => client.orders()))
  handle('payments:create', input => paymentRequest(client => client.create(input)))
  handle('payments:refresh', id => paymentRequest(client => client.refresh(id)))
  handle('payments:cancel', id => paymentRequest(client => client.cancel(id)))
  handle('wallet:get', async () => interviewTimer.read(await walletConnection()))
  handle('interview:start', input => interviewMutations.run(async () => {
    const requestId = parseInput(z.string().uuid(), input)
    const config = await effectiveSettings()
    if (!config.context.text.trim() || !config.interviewEnvironment?.resumeId) throw new Error('开始面试前必须选择并填写简历。')
    if (!config.remoteKnowledge.enabled && config.retrieval.enabled) {
      const documents = await references.list()
      const selected = config.interviewEnvironment.referenceIds
      if (selected.some(id => !documents.some(item => item.id === id && item.status === 'ready' && item.enabled))) throw new Error('所选资料尚未准备完成，请等待索引完成或取消选择。')
    }
    return interviewTimer.start(await walletConnection(), requestId)
  }))
  handle('interview:end', () => interviewTimer.end())
  handle('settings:get', () => effectiveSettings())
  handle('platform:login', input => {
    return mutatePlatform(async () => { disposeWork(); await platform.login(input); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:email-code', input => platform.emailCode(input))
  handle('platform:password-reset-code', input => platform.passwordResetCode(input))
  handle('platform:password-reset', input => platform.resetPassword(input))
  handle('platform:register', input => mutatePlatform(async () => {
    disposeWork(); await platform.register(input); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings()
  }))
  handle('platform:logout', () => {
    return mutatePlatform(async () => { await interviewTimer.end().catch(() => undefined); disposeWork(); await platform.logout(); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:refresh', () => {
    const controller = new AbortController()
    const release = platformWork.track(platformWork.revision, () => controller.abort(new Error('平台连接已更改，状态刷新已取消。')))
    return platformMutations.run(async () => {
      try { await platform.refresh(controller.signal); await syncAccount(); return await effectiveSettings() }
      finally {
        release()
        if (!(await settings.getSettings()).platform?.authenticated) disposeWork()
        emit({ kind: 'settings-changed' })
      }
    })
  })
  handle('audio:capture-error', () => displayCapture.getFailure())
  handle('settings:save', async input => {
    let parsed = parseInput(settingsInputSchema, input)
    const previous = await settings.getSettings()
    if (interviewTimer.active) {
      const before = parseInput(settingsInputSchema, previous)
      if (JSON.stringify({ ...parsed, autoAnswer: before.autoAnswer }) !== JSON.stringify(before)) throw new Error('请先结束面试，再修改模型与设置。')
    }
    if (!previous.platform?.authenticated) parsed = { ...parseInput(settingsInputSchema, previous), platform: parsed.platform }
    parsed.platform.enabled = true
    // Backgrounds belong to the interview library; stale settings dialogs cannot overwrite them.
    const platformChanged = parsed.platform.baseUrl !== previous.platform?.baseUrl || (previous.platform?.enabled && !parsed.platform.enabled)
    const finishPlatformChange = platformChanged ? platformWork.beginChange() : undefined
    if (platformChanged) disposeWork()
    try { await settings.saveSettings({ ...parsed, context: previous.context, interviewTarget: previous.interviewTarget }) }
    finally { finishPlatformChange?.() }
    const saved = await effectiveSettings()
    emit({ kind: 'settings-changed' })
    return saved
  })
  handle('services:test', async input => {
    const controller = new AbortController()
    serviceTests.add(controller)
    try { return await testCustomService(settings, parseInput(customServiceSchema, input), controller.signal) }
    finally { serviceTests.delete(controller) }
  })
  handle('services:save', async input => {
    assertInterviewIdle()
    const profile = parseInput(customServiceSchema, input)
    await settings.saveCustomService(profile)
    emit({ kind: 'settings-changed' })
    return effectiveSettings()
  })
  handle('services:remove', async input => {
    assertInterviewIdle()
    await settings.removeCustomService(parseInput(z.string().min(1).max(128), input))
    emit({ kind: 'settings-changed' })
    return effectiveSettings()
  })
  handle('model:test', () => testService('llm'))
  handle('context:import', async () => {
    if (!window) return null
    const result = await dialog.showOpenDialog(window, { title: '导入简历', properties: ['openFile'], filters: [{ name: '简历文件', extensions: ['pdf', 'md', 'txt'] }] })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const { text } = await extractDocument(path)
    if (text.length > 100000) throw new Error('资料超过 10 万字符，请保留与面试相关的内容。')
    return { name: basename(path), text }
  })
  handle('target:import', async () => {
    if (!window) return null
    const result = await dialog.showOpenDialog(window, { title: '导入岗位 JD', properties: ['openFile'], filters: [{ name: '岗位文件', extensions: ['pdf', 'md', 'txt'] }] })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const { text } = await extractDocument(path)
    if (text.length > 12000) throw new Error('岗位 JD 超过 12,000 字符，请精简文件后导入，或复制需要的内容。')
    return { name: basename(path), text }
  })
  const profileId = z.string().min(1).max(128)
  handle('interviews:list', () => interviews.list())
  handle('resumes:save', input => mutateInterviews(() => interviews.saveResume(input as Parameters<InterviewStore['saveResume']>[0])))
  handle('resumes:remove', input => mutateInterviews(() => interviews.removeResume(parseInput(profileId, input))))
  handle('targets:save', input => mutateInterviews(() => interviews.saveTarget(input as Parameters<InterviewStore['saveTarget']>[0])))
  handle('targets:remove', input => mutateInterviews(() => interviews.removeTarget(parseInput(profileId, input))))
  handle('environments:save', input => mutateInterviews(async () => {
    const parsed = parseInput(environmentInputSchema, input)
    const library = await interviews.list()
    if (parsed.id === library.activeEnvironmentId) assertInterviewIdle()
    const available = new Set((await references.list()).map(document => document.id))
    if (parsed.referenceIds.some(id => !available.has(id))) throw new Error('部分参考资料已移除，请取消这些选择后保存。')
    return interviews.saveEnvironment(parsed)
  }))
  handle('environments:remove', input => mutateInterviews(() => interviews.removeEnvironment(parseInput(profileId, input))))
  handle('environments:activate', input => mutateInterviews(async () => {
    assertInterviewIdle()
    const config = await settings.getSettings()
    const library = await interviews.activate(parseInput(profileId, input))
    return resolveInterviewSettings(config, library)
  }))
  handle('remote-knowledge:test', () => testService('knowledge'))
  handle('references:list', () => references.list())
  handle('references:import', async () => {
    if (!window) return []
    const result = await dialog.showOpenDialog(window, { title: '导入参考资料', properties: ['openFile', 'multiSelections'], filters: [{ name: '参考资料', extensions: ['pdf', 'md', 'txt'] }] })
    return result.canceled ? [] : references.importFiles(result.filePaths)
  })
  const documentId = z.string().min(1).max(128)
  handle('references:preview', id => references.preview(parseInput(documentId, id)))
  handle('references:update', input => {
    const value = parseInput(z.object({ id: documentId, patch: referencePatchSchema }), input)
    return references.update(value.id, value.patch)
  })
  handle('references:remove', id => references.remove(parseInput(documentId, id)))
  handle('references:reindex', id => references.reindex(parseInput(documentId, id)))
  handle('asr:start', async () => {
    interviewTimer.assertActive()
    if (changingEnvironment) throw new Error('正在保存面试环境，请稍后开始转写。')
    if (startingAsr) throw new Error('正在连接转写服务，请稍候。')
    startingAsr = true
    const epoch = ++asrEpoch
    const platformRevision = platformWork.revision
    const controller = new AbortController()
    let release: (() => void) | undefined
    let ownedAsr: AsrClient | undefined
    try {
      asr?.dispose()
      releasePlatformAsr?.(); releasePlatformAsr = undefined
      const snapshot = await settings.getConnectionSnapshot()
      if (epoch !== asrEpoch) throw new Error('转写连接已取消。')
      if (needsPlatform(snapshot.settings, snapshot.secrets, 'asr')) {
        release = releasePlatformAsr = platformWork.track(platformRevision, () => {
          controller.abort(new Error('平台连接已更改，转写已停止。'))
          if (epoch === asrEpoch) { asrEpoch++; startingAsr = false }
          if (ownedAsr && asr === ownedAsr) ownedAsr.dispose()
          if (releasePlatformAsr === release) releasePlatformAsr = undefined
        })
      }
      const connection = await serviceConnection(snapshot, 'asr', controller.signal)
      if (epoch !== asrEpoch) throw new Error('转写连接已取消。')
      interviewTimer.assertActive()
      ownedAsr = asr = new AsrClient(connection.settings.asr, connection.apiKey, emit)
      return await ownedAsr.start()
    } catch (error) {
      release?.()
      if (releasePlatformAsr === release) releasePlatformAsr = undefined
      throw error
    } finally { if (epoch === asrEpoch) startingAsr = false }
  })
  ipcMain.on('asr:audio', (event, sessionId: unknown, audio: unknown, accountScope: unknown) => {
    if (!accounts.active || accountScope !== accounts.active.id) return
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    if (typeof sessionId !== 'string' || !(audio instanceof ArrayBuffer) || audio.byteLength > 64000 || audio.byteLength % 2 !== 0) return
    if (interviewTimer.active) asr?.sendAudio(sessionId, audio)
  })
  handle('asr:stop', () => { asrEpoch++; startingAsr = false; return asr?.stop() })
  handle('answer:generate', async input => {
    interviewTimer.assertActive()
    if (changingEnvironment) throw new Error('正在保存面试环境，请稍后生成回答。')
    const request = parseInput(answerRequestSchema, input)
    cancelAnswerWork()
    const epoch = answerEpoch
    const platformRevision = platformWork.revision
    pendingAnswerId = request.requestId
    const controller = new AbortController()
    retrievalController = controller
    try {
      const snapshot = await settings.getConnectionSnapshot()
      const config = await interviews.resolve(snapshot.settings)
      if (request.environmentId && request.environmentId !== config.interviewEnvironment?.id) throw new Error('面试环境已切换，请重新生成回答。')
      const secrets = snapshot.secrets
      if (epoch !== answerEpoch) return
      if (needsPlatform(config, secrets, 'llm')) {
        releasePlatformAnswer = platformWork.track(platformRevision, () => { if (epoch === answerEpoch) cancelAnswerWork() })
      }
      const connection = await serviceConnection({ settings: config, secrets }, 'llm', controller.signal)
      if (epoch !== answerEpoch || controller.signal.aborted) return
      const retrieval = config.remoteKnowledge.enabled
        ? await retrieveRemote({ settings: config, secrets }, request.question, controller.signal, platformRevision)
        : await references.retrieve(request.question, request.transcript, config, controller.signal)
      if (epoch !== answerEpoch || controller.signal.aborted) return
      emit({ kind: 'answer-context', requestId: request.requestId, interviewTarget: config.interviewTarget, retrieval, interviewEnvironment: config.interviewEnvironment })
      interviewTimer.assertActive()
      pendingAnswerId = null
      activeAnswerId = request.requestId
      llm = new LlmClient(connection.settings, connection.apiKey, emit, connection.platform)
      // The service emits its own request-scoped error; do not send a duplicate event here.
      void llm.generate(request, retrieval).catch(() => undefined)
    } catch (error) {
      if (epoch !== answerEpoch || controller.signal.aborted) return
      pendingAnswerId = null
      releasePlatformAnswer?.(); releasePlatformAnswer = undefined
      throw error
    } finally { if (retrievalController === controller) retrievalController = null }
  })
  handle('answer:cancel', () => cancelAnswerWork())
  handle('window:pin', input => {
    const value = z.boolean().parse(input)
    window?.setAlwaysOnTop(value, 'floating')
    return value
  })
  handle('window:compact', input => {
    const value = z.boolean().parse(input)
    if (!window || value === compact) return
    compact = value
    if (value) {
      // setSize is ignored while maximized/fullscreen: capture the flags, leave those
      // states first, and re-apply them when returning to the full window.
      fullBounds = window.getBounds()
      fullMaximized = window.isMaximized()
      fullFullScreen = window.isFullScreen()
      window.setMinimumSize(430, 500)
      if (fullMaximized) window.unmaximize()
      if (fullFullScreen) window.setFullScreen(false)
      window.setSize(480, 640)
      // setSize keeps the top-left corner; re-center so the compact window lands mid-screen.
      window.center()
    } else {
      window.setMinimumSize(900, 640)
      if (fullBounds) window.setBounds(fullBounds)
      if (fullMaximized) window.maximize()
      if (fullFullScreen) window.setFullScreen(true)
    }
  })
  handle('history:list', () => history.list())
  handle('history:save', input => {
    const value = input as { record: SessionRecord; accountScope?: string }
    if (!value.accountScope || value.accountScope !== accounts.current().id) throw new Error('会话不属于当前登录账户。')
    return history.save(value.record)
  })
  handle('history:remove', id => history.remove(id))
  handle('history:export', async record => {
    if (!window) return false
    // Save validates the public record before it can become an exported document.
    await history.save(record as SessionRecord)
    const result = await dialog.showSaveDialog(window, { title: '导出会话', defaultPath: `面试记录-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, sessionToMarkdown(record as SessionRecord), 'utf8')
    return true
  })
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1220, height: 820, minWidth: 900, minHeight: 640,
    title: 'Interview Copilot', titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 }, backgroundColor: '#F7F6F3', show: false,
    webPreferences: { preload: join(directory, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.on('closed', () => { interviewTimer.dispose(); disposeWork(); window = null; compact = false; fullBounds = null; fullMaximized = false; fullFullScreen = false })
  window.once('ready-to-show', () => window?.show())
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(directory, '../renderer/index.html'))
}

const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) app.quit()
app.on('second-instance', () => {
  if (window?.isMinimized()) window.restore()
  window?.show()
  window?.focus()
})

if (hasInstanceLock) app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = contents === window?.webContents
    const wantsCamera = 'mediaTypes' in details && Boolean(details.mediaTypes?.includes('video'))
    callback(trusted && (permission === 'display-capture' || permission === 'clipboard-sanitized-write' || (permission === 'media' && !wantsCamera)))
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window?.webContents && ['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission))
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void displayCapture.grant(Boolean(window && _request.frame === window.webContents.mainFrame), _request.audioRequested, callback)
  })
  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }]
  // 开发模式加 DevTools 入口(自定义菜单顶掉了默认的 Ctrl+Shift+I 绑定);打包版不暴露
  if (!app.isPackaged) viewSubmenu.push({ type: 'separator' }, { role: 'reload', label: '重新加载' }, { role: 'toggleDevTools', label: '开发者工具' })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Interview Copilot', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: viewSubmenu },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'front' }] }
  ]))
  await authSettings.initializeServices()
  const startupSettings = await authSettings.getSettings()
  if (startupSettings.platform?.baseUrl !== platformBaseUrl) await authSettings.saveSettings({ ...startupSettings, platform: { ...startupSettings.platform, enabled: true, baseUrl: platformBaseUrl } })
  await syncAccount()
  registerHandlers()
  await createWindow()
  globalShortcut.register('CommandOrControl+Shift+Enter', () => emit({ kind: 'shortcut', action: 'answer' }))
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
}).catch(error => { dialog.showErrorBox('启动失败', error instanceof Error ? error.message : '无法启动应用'); app.quit() })

app.on('before-quit', () => { interviewTimer.dispose(); disposeWork(); accounts.dispose(); globalShortcut.unregisterAll() })
app.on('window-all-closed', () => app.quit())
