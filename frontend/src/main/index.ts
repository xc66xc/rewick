import { MenuBar } from './services/menu-bar'
import { InterviewRecordingStore } from './services/interview-recording-store'
import { recordingReviewRuntime, runRecordingReview } from './services/interview-recording-review'
import { DesktopWindows, type DesktopHost } from './services/desktop-windows'
import { defaultWindowPreferences, windowPreferencesSchema } from '../shared/window-preferences'
import { randomUUID } from 'node:crypto'
import { invitationSettingsSchema, invitationSummarySchema } from '../shared/invitation'
import { DesktopSessionMonitor } from './services/desktop-session-monitor'
import { onSessionFault } from './services/session-fault'
import { PaymentClient } from './services/payment-client'
import { InterviewTimer } from './services/interview-timer'
import { AccountWorkspaces } from './services/account-workspace'
import { platformBaseUrl } from '../shared/defaults'
import { app, shell, Menu, dialog, globalShortcut, ipcMain, safeStorage, session, powerMonitor, systemPreferences, desktopCapturer } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { basename, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SettingsStore } from './services/settings-store'
import type { ServiceSecrets } from './services/settings-store'
import { PlatformService, PlatformClient } from './services/platform-client'
import { testCustomService } from './services/custom-service-test'
import { customServiceSchema } from './services/custom-service-profiles'
import { PlatformWork } from './services/platform-work'
import { needsPlatform, routeService } from './services/service-routing'
import { applyDesktopDefaults, assertAllowedSettings, hasAdvancedSettings, preserveLocalAdvancedSettings, requireAdvancedSettings } from './services/advanced-settings'
import type { PlatformCapability } from './services/service-routing'
import { InterviewStore } from './services/interview-store'
import { environmentHotwordSourcesSchema, environmentInputSchema } from './services/interview-validation'
import { SerialQueue, readJson, writeJsonAtomic } from './services/storage'
import { sessionToMarkdown } from './services/history-store'
import { AsrClient } from './services/asr-client'
import { LlmClient } from './services/llm-client'
import { DisplayCaptureService } from './services/display-capture'
import { ReferenceService } from './services/reference-service'
import { extractDocument } from './services/document-extractor'
import { RemoteKnowledgeClient } from './services/remote-knowledge-client'
import { answerRequestSchema, parseInput, referencePatchSchema, settingsInputSchema, sessionRecordSchema } from './services/validation'
import type { AppEvent, Settings, SettingsInput, SessionRecord, RetrievalContext } from '../shared/types'
import { resolveInterviewSettings } from '../shared/interview-settings'
import { enforcePackagedStartup } from './services/startup-security'
import { initializeNetworkTransport } from './services/network-transport'

enforcePackagedStartup(app, process.argv)
initializeNetworkTransport()

// IDE/terminal parents may lack NSAudioCaptureUsageDescription required by CoreAudio Tap.
// Use Electron's documented screen-recording capture path during macOS development.
if (process.platform === 'darwin' && !app.isPackaged) {
  const disabled = app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean)
  app.commandLine.appendSwitch('disable-features', [...new Set([...disabled, 'MacCatapLoopbackAudioForScreenShare'])].join(','))
}

const directory = fileURLToPath(new URL('.', import.meta.url))
if (process.env.COPILOT_USER_DATA) app.setPath('userData', process.env.COPILOT_USER_DATA)
else if (!app.isPackaged) {
  const developmentData = join(app.getPath('appData'), 'Interview Copilot Development')
  mkdirSync(developmentData, { recursive: true })
  app.setPath('userData', developmentData)
}
else app.setPath('userData', join(app.getPath('appData'), 'Interview Copilot'))
// Electron binds macOS Safe Storage to this name before ready. Keep the encryption identity stable.
app.setName('Interview Copilot')
const hasInstanceLock = app.requestSingleInstanceLock()
if (!hasInstanceLock) app.exit(0)
let pendingActivation = false
let window: DesktopHost | null = null
let desktopWindows: DesktopWindows | null = null
let menuBar: MenuBar | null = null
const supportsTray = process.platform === 'darwin' || process.platform === 'win32'
const restoreShortcutLabel = process.platform === 'darwin' ? '⌘⇧R' : 'Ctrl+Shift+R'
const trayLocation = process.platform === 'darwin' ? '菜单栏' : '系统托盘'
let closeNoticeShown = false
function revealDesktop(): void {
  menuBar?.restore()
  desktopWindows?.show()
}
function notifyHidden(): void {
  if (closeNoticeShown) return
  closeNoticeShown = true
  void dialog.showMessageBox({ type: 'info', title: '掌灯 Rewick 仍在运行',
    message: '应用仍在后台运行；面试期间会继续计时。',
    detail: `点击${trayLocation}图标或按 ${restoreShortcutLabel} 可恢复窗口。需要结束使用时，请从${trayLocation}选择“退出掌灯 Rewick”。`,
    buttons: ['知道了'] }).catch(() => undefined)
}
let windowPreferences = { ...defaultWindowPreferences }
const windowPreferencesPath = join(app.getPath('userData'), 'window-preferences.json')
const windowPreferencesQueue = new SerialQueue()
const recordings = new InterviewRecordingStore(join(app.getPath('userData'), 'interview-recordings'))
const reviewJobs = new Map<string, AbortController>()
let recordingCleanup: Promise<void> = Promise.resolve()
let asr: AsrClient | null = null
let llm: LlmClient | null = null
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
  await accounts.context.exit(() => finishInvalidSession(token, '登录已失效，请重新登录。', true))
})
const interviewTimer = new InterviewTimer(wallet => emit({ kind: 'wallet-changed', wallet }), () => { desktopWindows?.setCompact(false); disposeWork() })
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
      const merged = applyDesktopDefaults({ ...(own ? await own.preferences.merge(snapshot.settings) : snapshot.settings), platform: auth.settings.platform })
      const secrets = { ...snapshot.secrets }
      if (own) for (const [kind, key] of [['llm', 'llmApiKey'], ['asr', 'asrApiKey'], ['knowledge', 'remoteKnowledgeApiKey']] as const) {
        if (merged.serviceSelections?.[kind]?.source !== 'custom') secrets[key] = ''
      }
      const value = { settings: { ...merged, platform: auth.settings.platform, accountScope: own?.id }, secrets: { ...secrets, platformAccessToken: auth.secrets.platformAccessToken } }
      return property === 'getSettings' ? value.settings : property === 'getSecrets' ? value.secrets : value
    }
    if (property === 'saveSettings') return async (input: SettingsInput) => {
      const own = accounts.context.getStore() ?? accounts.active
      if (own) {
        for (const [kind, selection] of Object.entries(input.serviceSelections ?? {})) {
          if (selection?.source === 'custom' && !(await own.settings.getSettings()).customServices?.some(profile => profile.id === selection.id && profile.kind === kind)) throw new Error('所选自定义服务不存在，请重新选择。')
        }
        await own.preferences.save(input)
        const localInput = hasAdvancedSettings(await authSettings.getSettings()) ? input : preserveLocalAdvancedSettings(input, await own.settings.getSettings())
        return own.settings.saveSettings(localInput)
      }
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
  if (config.preferencesVersion !== undefined && !config.serviceSelections?.[capability]) throw new Error('请先在模型与设置中明确选择服务。')
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
let catalogRefreshTimer: ReturnType<typeof setInterval> | undefined
let catalogRefreshing = false
async function refreshCatalog() {
  if (catalogRefreshing) return
  catalogRefreshing = true
  try {
    const before = await authSettings.getConnectionSnapshot()
    if (!before.settings.platform?.authenticated) return
    await platform.refreshSnapshot(before)
    const after = await authSettings.getConnectionSnapshot()
    if (after.secrets.platformAccessToken === before.secrets.platformAccessToken && JSON.stringify(before.settings.platform) !== JSON.stringify(after.settings.platform)) emit({ kind: 'settings-changed' })
  } catch { /* Session faults are handled centrally; transient catalog failures keep the last verified policy. */ }
  finally { catalogRefreshing = false }
}
async function effectiveSettings() {
  const value = { ...await settings.getSettings(), sessionNotice }
  return interviewTimer.active && interviewTimer.background ? { ...value, ...interviewTimer.background } : accounts.active ? interviews.resolve(value) : value
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
  for (const controller of reviewJobs.values()) controller.abort()
  recordingCleanup = recordingCleanup.then(() => recordings.closeAll()).catch(() => console.error('录音关闭失败，将在下次读取时尝试恢复。'))
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

let sessionNotice = ''
let pendingSignOut: { nonce: string; owner: typeof accounts.active; finish: () => void } | undefined
let signOut: Promise<void> | undefined
const sessionMonitor = new DesktopSessionMonitor({
  connection: async () => {
    const snapshot = await authSettings.getConnectionSnapshot()
    return snapshot.settings.platform?.authenticated && snapshot.secrets.platformAccessToken
      ? { baseUrl: snapshot.settings.platform.baseUrl, token: snapshot.secrets.platformAccessToken } : null
  },
  check: connection => new PlatformClient(connection.baseUrl).session(connection.token),
  invalidated: (token, message) => finishInvalidSession(token, message, true),
  paused: token => finishInvalidSession(token, '暂时无法确认登录状态，面试操作已停止。请检查网络，恢复后重新开始面试。', false),
  restored: () => { sessionNotice = ''; accounts.active?.history.start(); emit({ kind: 'session-restored' }) }
})
const unsubscribeSessionFault = onSessionFault((token, error) => {
  accounts.context.exit(() => { void finishInvalidSession(token, error.message, true).catch(() => console.error('无法完成登录会话清理')) })
})
async function finishInvalidSession(token: string, message: string, revoke: boolean): Promise<void> {
  if (signOut) { await signOut; if (revoke) return finishInvalidSession(token, message, revoke); return }
  const snapshot = await authSettings.getConnectionSnapshot()
  if (snapshot.secrets.platformAccessToken !== token) return
  if (signOut) { await signOut; return finishInvalidSession(token, message, revoke) }
  const operation = async () => {
    const owner = accounts.active
    owner?.history.dispose()
    platformWork.invalidate()
    interviewTimer.invalidate()
    disposeWork()
    const nonce = randomUUID()
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000)
      pendingSignOut = { nonce, owner, finish: () => { clearTimeout(timer); resolve() } }
      emit({ kind: 'session-stopping', nonce })
    })
    pendingSignOut = undefined
    if ((await authSettings.getConnectionSnapshot()).secrets.platformAccessToken !== token) return
    sessionNotice = message
    if (revoke) { await authSettings.clearPlatformSession(token); await syncAccount() }
    emit({ kind: revoke ? 'session-ended' : 'session-paused', message })
    emit({ kind: 'settings-changed' })
  }
  signOut = operation()
  try { await signOut } finally { signOut = undefined }
}

function assertSender(event: IpcMainInvokeEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的应用请求')
}

function registerHandlers(): void {
  const publicChannels = new Set(['invitation:settings', 'settings:get', 'settings:save', 'platform:remembered-login', 'platform:login', 'platform:register', 'platform:email-code', 'platform:password-reset-code', 'platform:password-reset', 'platform:logout', 'platform:refresh', 'asr:stop', 'answer:cancel', 'window:compact', 'window:pin', 'window:scrim'])
  const handle = (channel: string, callback: (arg: unknown) => unknown): void => {
    ipcMain.handle(channel, async (event, envelope: unknown) => {
      assertSender(event)
      if (quitPending && ['interview:start', 'asr:start', 'answer:generate', 'recordings:start', 'recordings:export', 'platform:login', 'platform:register'].includes(channel)) throw new Error('应用正在退出，请重新打开后操作。')
      const { payload: arg, accountScope } = parseInput(z.object({ payload: z.unknown().optional(), accountScope: z.string().optional() }), envelope)
      const dispatch = channel === 'answer:generate' || channel === 'answer:cancel' ? ++answerDispatchEpoch : answerDispatchEpoch
      const asrDispatch = asrEpoch
      if (channel === 'session:stage') {
        const input = parseInput(z.object({ nonce: z.string().uuid(), record: sessionRecordSchema.nullable() }), arg)
        const pending = pendingSignOut
        if (!pending || pending.nonce !== input.nonce || accountScope !== pending.owner?.id) throw new Error('退出会话已变化。')
        if (input.record && pending.owner) await pending.owner.history.saveDraft(input.record)
        pending.finish()
        return
      }
      if (pendingSignOut && !['asr:stop','answer:cancel','settings:get','platform:remembered-login','window:scrim'].includes(channel)) throw new Error('正在结束旧登录会话，请稍后重试。')
      const owner = await syncAccount()
      // window:scrim 是纯窗口外观位(弹窗遮罩着色),true/false 必须对称落地;若按账户作用域拦截,
      // 恢复白底的那次调用会在账户切换瞬间被丢弃,原生标题条将卡在灰色(2026-09-20 Windows 实测)。
      if (accountScope && owner?.id !== accountScope && !channel.startsWith('platform:') && channel !== 'settings:get' && channel !== 'window:scrim') throw new Error('账户已切换，旧操作已取消。')
      if (!publicChannels.has(channel) && (!owner || accountScope !== owner.id)) {
        disposeWork(); emit({ kind: 'settings-changed' })
        throw new Error('请先使用邮箱注册或登录。')
      }
      if (!publicChannels.has(channel) && !['history:save', 'recordings:append', 'recordings:stop', 'recordings:info', 'recordings:cancel-export'].includes(channel)) sessionMonitor.assertVerified((await authSettings.getSecrets()).platformAccessToken)
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
  handle('invitation:settings', async () => {
    const { settings } = await authSettings.getConnectionSnapshot()
    return invitationSettingsSchema.parse(await new PlatformClient(settings.platform?.baseUrl ?? platformBaseUrl).invitationRequest('/api/v1/invitations/settings'))
  })
  const invitationRequest = async (create: boolean) => {
    const revision = platformWork.revision
    const connection = await walletConnection()
    const result = invitationSummarySchema.parse(await new PlatformClient(connection.baseUrl).invitationRequest(create ? '/api/v1/invitations/me/code' : '/api/v1/invitations/me', connection.token, create ? {} : undefined))
    if (platformWork.revision !== revision) throw new Error('账户已切换，邀请信息已丢弃。')
    return result
  }
  handle('invitation:mine', () => invitationRequest(false))
  handle('invitation:code', () => invitationRequest(true))
  handle('session:stage', () => undefined)
  handle('payments:catalog', () => paymentRequest(client => client.catalog()))
  handle('payments:list', () => paymentRequest(client => client.orders()))
  handle('payments:create', input => paymentRequest(client => client.create(input)))
  handle('payments:refresh', id => paymentRequest(client => client.refresh(id)))
  handle('payments:cancel', id => paymentRequest(client => client.cancel(id)))
  handle('payments:openCheckout', async id => {
    const url = await paymentRequest(client => client.checkout(id))
    await shell.openExternal(url)
  })
  handle('wallet:get', async () => interviewTimer.read(await walletConnection()))
  handle('interview:start', input => interviewMutations.run(async () => {
    const { requestId, environmentId } = parseInput(z.object({ requestId: z.string().uuid(), environmentId: z.string().uuid() }), input)
    const state = await interviewTimer.start(await walletConnection(), requestId, environmentId)
    emit({ kind: 'settings-changed' })
    return state
  }))
  handle('interview:end', () => interviewTimer.end())
  handle('settings:get', async () => { await accounts.active?.preferences.load(true); return effectiveSettings() })
  handle('platform:remembered-login', () => authSettings.getRememberedLogin())
  handle('platform:login', input => {
    return mutatePlatform(async () => { disposeWork(); await platform.login(input); sessionNotice = ''; await sessionMonitor.ensureVerified(); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:email-code', input => platform.emailCode(input))
  handle('platform:password-reset-code', input => platform.passwordResetCode(input))
  handle('platform:password-reset', input => platform.resetPassword(input))
  handle('platform:register', input => mutatePlatform(async () => {
    disposeWork(); await platform.register(input); sessionNotice = ''; await sessionMonitor.ensureVerified(); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings()
  }))
  handle('platform:logout', () => {
    return mutatePlatform(async () => { await interviewTimer.end().catch(() => undefined); disposeWork(); await platform.logout(); await syncAccount(); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:refresh', () => {
    const controller = new AbortController()
    const release = platformWork.track(platformWork.revision, () => controller.abort(new Error('平台连接已更改，状态刷新已取消。')))
    return platformMutations.run(async () => {
      try { await platform.refresh(controller.signal); await sessionMonitor.ensureVerified(); await syncAccount(); await accounts.active?.preferences.load(true); return await effectiveSettings() }
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
    if (previous.platform?.authenticated) assertAllowedSettings(parsed, previous)
    if (interviewTimer.active) {
      const before = parseInput(settingsInputSchema, previous)
      if (JSON.stringify({ ...parsed, preferencesVersion: before.preferencesVersion, context: before.context, interviewTarget: before.interviewTarget, autoAnswer: before.autoAnswer }) !== JSON.stringify(before)) throw new Error('请先结束面试，再修改模型与设置。')
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
    requireAdvancedSettings(await settings.getSettings())
    const controller = new AbortController()
    serviceTests.add(controller)
    try { return await testCustomService(settings, parseInput(customServiceSchema, input), controller.signal) }
    finally { serviceTests.delete(controller) }
  })
  handle('services:save', async input => {
    requireAdvancedSettings(await settings.getSettings())
    assertInterviewIdle()
    const profile = parseInput(customServiceSchema, input)
    await settings.saveCustomService(profile)
    emit({ kind: 'settings-changed' })
    return effectiveSettings()
  })
  handle('services:remove', async input => {
    requireAdvancedSettings(await settings.getSettings())
    assertInterviewIdle()
    await settings.removeCustomService(parseInput(z.string().min(1).max(128), input))
    emit({ kind: 'settings-changed' })
    return effectiveSettings()
  })
  handle('model:test', async () => { requireAdvancedSettings(await settings.getSettings()); return testService('llm') })
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
  handle('resumes:get', input => interviews.resume(parseInput(profileId, input)))
  handle('targets:get', input => interviews.target(parseInput(profileId, input)))
  handle('interviews:list', () => interviews.list())
  handle('resumes:save', input => mutateInterviews(() => interviews.saveResume(input as Parameters<InterviewStore['saveResume']>[0])))
  handle('resumes:remove', input => mutateInterviews(() => interviews.removeResume(parseInput(profileId, input))))
  handle('targets:save', input => mutateInterviews(() => interviews.saveTarget(input as Parameters<InterviewStore['saveTarget']>[0])))
  handle('targets:remove', input => mutateInterviews(() => interviews.removeTarget(parseInput(profileId, input))))
  handle('environments:extract-hotwords', input => interviews.extractEnvironmentHotwords(parseInput(environmentHotwordSourcesSchema, input)))
  handle('environments:save', input => mutateInterviews(() => interviews.saveEnvironment(parseInput(environmentInputSchema, input))))
  handle('environments:remove', input => mutateInterviews(() => interviews.removeEnvironment(parseInput(profileId, input))))
  handle('environments:activate', input => mutateInterviews(async () => {
    assertInterviewIdle()
    const config = await settings.getSettings()
    const library = await interviews.activate(parseInput(profileId, input))
    return resolveInterviewSettings(config, library)
  }))
  handle('remote-knowledge:test', async () => { requireAdvancedSettings(await settings.getSettings()); return testService('knowledge') })
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
      const config = interviewTimer.background ? { ...snapshot.settings, ...interviewTimer.background } : await interviews.resolve(snapshot.settings)
      if (request.environmentId && request.environmentId !== config.interviewEnvironment?.id) throw new Error('面试环境已切换，请重新生成回答。')
      const secrets = snapshot.secrets
      if (epoch !== answerEpoch) return
      if (needsPlatform(config, secrets, 'llm')) {
        releasePlatformAnswer = platformWork.track(platformRevision, () => { if (epoch === answerEpoch) cancelAnswerWork() })
      }
      const connection = await serviceConnection({ settings: config, secrets }, 'llm', controller.signal)
      if (epoch !== answerEpoch || controller.signal.aborted) return
      const resolved = connection.settings
      const retrieval = resolved.remoteKnowledge.enabled
        ? await retrieveRemote({ settings: resolved, secrets }, request.question, controller.signal, platformRevision)
        : await references.retrieve(request.question, request.transcript, resolved, controller.signal)
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
  handle('window:pin', input => desktopWindows?.setPinned(z.boolean().parse(input)) ?? false)
  handle('window:scrim', input => desktopWindows?.setScrim(z.boolean().parse(input)) ?? false)
  handle('window:compact', input => {
    const value = z.boolean().parse(input)
    if (value) interviewTimer.assertActive()
    desktopWindows?.setCompact(value)
  })
  handle('window:preferences', () => windowPreferences)
  handle('window:preferences-save', input => windowPreferencesQueue.run(async () => {
    const value = windowPreferencesSchema.parse(input)
    await writeJsonAtomic(windowPreferencesPath, value)
    desktopWindows?.setPreferences(value)
    windowPreferences = value
    return value
  }))
  handle('history:page', cursor => history.page(parseInput(z.number().int().positive().optional(), cursor)))
  handle('history:detail', id => history.detail(String(id)))
  handle('history:status', () => history.status())
  handle('history:list', () => history.list())
  handle('history:save', input => {
    const value = input as { record: SessionRecord; accountScope?: string }
    if (!value.accountScope || value.accountScope !== accounts.current().id) throw new Error('会话不属于当前登录账户。')
    return history.save({ ...value.record, interviewSessionId: value.record.interviewSessionId ?? interviewTimer.sessionId })
  })
  handle('history:remove', async id => {
    const sessionId = parseInput(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), id)
    const info = await recordings.info(accounts.current().id, sessionId)
    if (info?.status === 'recording') throw new Error('请先停止录音。')
    if (reviewJobs.has(`${accounts.current().id}:${sessionId}`)) throw new Error('请先取消复盘导出。')
    await history.remove(sessionId)
    await recordings.remove(accounts.current().id, sessionId)
  })
  const recordingId = (value: unknown) => parseInput(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), value)
  handle('recordings:start', async input => {
    await recordingCleanup
    interviewTimer.assertActive()
    const owner = accounts.current()
    const sessionId = recordingId(input)
    await recordings.start(owner.id, sessionId)
    if (accounts.active !== owner || !interviewTimer.active || quitPending) {
      await recordings.stop(owner.id, sessionId)
      throw new Error('面试已结束，录音已停止。')
    }
  })
  handle('recordings:append', input => {
    const value = parseInput(z.object({ sessionId: z.string(), audio: z.instanceof(ArrayBuffer) }), input)
    return recordings.append(accounts.current().id, recordingId(value.sessionId), value.audio)
  })
  handle('recordings:stop', input => recordings.stop(accounts.current().id, recordingId(input)))
  handle('recordings:info', input => recordings.info(accounts.current().id, recordingId(input)))
  handle('recordings:remove', input => {
    const sessionId = recordingId(input)
    if (reviewJobs.has(`${accounts.current().id}:${sessionId}`)) throw new Error('请先取消复盘导出。')
    return recordings.remove(accounts.current().id, sessionId)
  })
  handle('recordings:cancel-export', input => { reviewJobs.get(`${accounts.current().id}:${recordingId(input)}`)?.abort() })
  handle('recordings:download', async input => {
    if (!window) return null
    const owner = accounts.current()
    const sessionId = recordingId(input)
    await recordings.audioPath(owner.id, sessionId)
    const result = await dialog.showSaveDialog(window, {
      title: '下载录音', defaultPath: `面试录音-${sessionId}.wav`,
      filters: [{ name: 'WAV 音频', extensions: ['wav'] }]
    })
    if (result.canceled || !result.filePath) return null
    if (accounts.active !== owner) throw new Error('账户已切换，下载已取消。')
    await recordings.exportFile(owner.id, sessionId, result.filePath)
    return { path: result.filePath }
  })
  handle('recordings:export', async input => {
    if (!window) return null
    const owner = accounts.current()
    const sessionId = recordingId(input)
    const key = `${owner.id}:${sessionId}`
    if (reviewJobs.size) throw new Error('已有复盘正在生成，请完成或取消后重试。')
    const controller = new AbortController()
    reviewJobs.set(key, controller)
    try {
      const audioPath = await recordings.audioPath(owner.id, sessionId)
      const result = await dialog.showSaveDialog(window, { title: '导出面试复盘', defaultPath: `面试复盘-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (result.canceled || !result.filePath) return null
      if (accounts.active !== owner || controller.signal.aborted) throw new Error('账户已切换，导出已取消。')
      const connection = await walletConnection()
      if (accounts.active !== owner || controller.signal.aborted) throw new Error('账户已切换，导出已取消。')
      return await runRecordingReview({
        ...recordingReviewRuntime({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
        ...connection, audioPath, outputPath: result.filePath, sessionId, signal: controller.signal,
        onProgress: progress => emit({ kind: 'recording-progress', ...progress })
      })
    } finally { reviewJobs.delete(key) }
  })
  if (import.meta.env.DEV && !app.isPackaged) handle('history:export-answers-excel', async input => {
    if (!window) return false
    const owner = accounts.current()
    const record = await history.detail(parseInput(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), input))
    const { createAnswerWorkbook } = await import('./services/answer-excel-export')
    const workbook = await createAnswerWorkbook(record)
    if (accounts.active !== owner) throw new Error('登录账户已切换，请重新导出。')
    const result = await dialog.showSaveDialog(window, { title: '导出回答 Excel', defaultPath: `回答评测-${record.id}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
    if (result.canceled || !result.filePath) return false
    if (accounts.active !== owner) throw new Error('登录账户已切换，请重新导出。')
    await writeFile(result.filePath, workbook)
    return true
  })
  handle('history:export', async input => {
    if (!window) return false
    const { record, options } = parseInput(z.object({ record: z.unknown(), options: z.object({ includeAiAnswers: z.boolean(), includeTranscript: z.boolean(), includeInterviewInfo: z.boolean() }) }), input)
    const markdown = sessionToMarkdown(record as SessionRecord, options)
    const result = await dialog.showSaveDialog(window, { title: '导出会话', defaultPath: `面试记录-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, markdown, 'utf8')
    return true
  })
}

async function createWindow(): Promise<void> {
  windowPreferences = windowPreferencesSchema.parse(await readJson(windowPreferencesPath, 4096) ?? defaultWindowPreferences)
  desktopWindows = new DesktopWindows({ preload: join(directory, '../preload/index.cjs'), contextIsolation: true,
    sandbox: true, nodeIntegration: false, devTools: !app.isPackaged, backgroundThrottling: false }, windowPreferences,
    (active, compact) => { window = active; emit({ kind: 'window-mode', compact }) },
    () => { window = null; interviewTimer.dispose(); disposeWork() },
    supportsTray ? notifyHidden : undefined)
  window = desktopWindows.full
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await window.webContents.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.webContents.loadFile(join(directory, '../renderer/index.html'))
  window.show()
  if (pendingActivation) { window.focus(); pendingActivation = false }
}

app.on('second-instance', () => {
  pendingActivation = true
  revealDesktop()
})

if (hasInstanceLock) app.whenReady().then(async () => {
  // Keep the runtime encryption identity stable; expose the brand through UI and About metadata.
  app.setAboutPanelOptions({ applicationName: '掌灯 Rewick' })
  if (process.platform === 'darwin') app.dock?.hide()
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
    { label: '掌灯 Rewick', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: viewSubmenu },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'front' }] }
  ]))
  await authSettings.initializeServices()
  const startupSettings = await authSettings.getSettings()
  if (startupSettings.platform?.baseUrl !== platformBaseUrl) await authSettings.saveSettings({ ...startupSettings, platform: { ...startupSettings.platform, enabled: true, baseUrl: platformBaseUrl } })
  await syncAccount()
  registerHandlers()
  if (supportsTray) {
    menuBar = new MenuBar(() => desktopWindows?.show(), () => desktopWindows?.hide(), () => app.quit())
    menuBar.restore()
  }
  await createWindow()
  if (supportsTray && !globalShortcut.register('CommandOrControl+Shift+R', revealDesktop)) {
    void dialog.showMessageBox({ type: 'warning', title: '恢复快捷键不可用',
      message: `${restoreShortcutLabel} 已被占用，无法注册恢复窗口快捷键。`,
      detail: `仍可点击${trayLocation}图标，或再次打开掌灯 Rewick 来恢复窗口。` }).catch(() => undefined)
  }
  sessionMonitor.start()
  catalogRefreshTimer = setInterval(() => { void refreshCatalog() }, 30_000)
  powerMonitor.on('resume', () => { void sessionMonitor.check().catch(() => console.error('无法读取登录状态')) })
  window?.on('focus', () => { void sessionMonitor.check().catch(() => console.error('无法读取登录状态')) })
  globalShortcut.register('CommandOrControl+Shift+Enter', () => emit({ kind: 'shortcut', action: 'answer' }))
  app.on('activate', revealDesktop)
}).catch(error => { dialog.showErrorBox('启动失败', error instanceof Error ? error.message : '无法启动应用'); app.quit() })

let quitPending = false
let quitReady = false
app.on('before-quit', event => {
  if (quitReady) return
  event.preventDefault()
  if (quitPending) return
  quitPending = true
  clearInterval(catalogRefreshTimer)
  sessionMonitor.dispose()
  unsubscribeSessionFault()
  disposeWork()
  // PlatformClient bounds the settlement request to eight seconds.
  void interviewTimer.end().catch(() => {
    console.error('退出时面试结算未确认，将由服务端心跳超时结算。')
  }).finally(async () => {
    await recordingCleanup
    desktopWindows?.prepareQuit()
    accounts.dispose()
    globalShortcut.unregisterAll()
    menuBar?.hide()
    quitReady = true
    app.quit()
  })
})
app.on('window-all-closed', () => app.quit())
