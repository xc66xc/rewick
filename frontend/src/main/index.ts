import { app, BrowserWindow, Menu, dialog, globalShortcut, ipcMain, safeStorage, session, systemPreferences, desktopCapturer } from 'electron'
import type { IpcMainInvokeEvent, Rectangle } from 'electron'
import { basename, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SettingsStore } from './services/settings-store'
import type { ServiceSecrets } from './services/settings-store'
import { PlatformService } from './services/platform-client'
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
import { EmbeddingClient } from './services/embedding-client'
import { RemoteKnowledgeClient } from './services/remote-knowledge-client'
import { answerRequestSchema, parseInput, referencePatchSchema, settingsInputSchema } from './services/validation'
import type { AppEvent, Settings, SettingsInput, SessionRecord, RetrievalContext } from '../shared/types'
import { resolveInterviewSettings } from '../shared/interview-settings'

const directory = fileURLToPath(new URL('.', import.meta.url))
if (process.env.COPILOT_USER_DATA) app.setPath('userData', process.env.COPILOT_USER_DATA)
app.setName('Interview Copilot')
let window: BrowserWindow | null = null
let asr: AsrClient | null = null
let llm: LlmClient | null = null
let fullBounds: Rectangle | null = null
let compact = false
let startingAsr = false
let asrEpoch = 0
let answerEpoch = 0
let pendingAnswerId: string | null = null
let retrievalController: AbortController | null = null
let activeAnswerId: string | null = null
let activeAsrId: string | null = null
let changingEnvironment = false
const interviewMutations = new SerialQueue()
const settings = new SettingsStore(app.getPath('userData'), {
  encryptString: value => safeStorage.encryptString(value),
  decryptString: value => safeStorage.decryptString(value),
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable()
})
const platform = new PlatformService(settings)
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
    finally { emit({ kind: 'settings-changed' }) }
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
const history = new HistoryStore(app.getPath('userData'))
const displayCapture = new DisplayCaptureService({
  getSources: () => desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }),
  screenPermission: () => process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
})
const emit = (event: AppEvent): void => {
  if (event.kind === 'asr-status') {
    if (event.status === 'connecting' || event.status === 'listening' || event.status === 'stopping') activeAsrId = event.sessionId
    else if (activeAsrId === event.sessionId) { activeAsrId = null; releasePlatformAsr?.(); releasePlatformAsr = undefined }
  }
  if ((event.kind === 'answer-done' || event.kind === 'answer-error') && event.requestId === activeAnswerId) { activeAnswerId = null; releasePlatformAnswer?.(); releasePlatformAnswer = undefined }
  if (window && !window.isDestroyed()) window.webContents.send('copilot:event', event)
}
const references = new ReferenceService(app.getPath('userData'), () => emit({ kind: 'documents-changed' }), async () => {
  const config = await settings.getSettings()
  const secrets = await settings.getSecrets()
  return { config: config.embedding, apiKey: secrets.embeddingApiKey }
})
const interviews = new InterviewStore(app.getPath('userData'), async () => ({
  settings: await settings.getSettings(), referenceIds: (await references.list()).filter(document => document.enabled).map(document => document.id),
}))
async function effectiveSettings() { return interviews.resolve(await settings.getSettings()) }
function assertInterviewIdle() {
  if (startingAsr || activeAsrId || pendingAnswerId || activeAnswerId) throw new Error('请先停止转写和回答，再切换或修改当前面试环境。')
}
function mutateInterviews<T>(operation: () => Promise<T>): Promise<T> {
  return interviewMutations.run(async () => {
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

function disposeWork(): void {
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
  const handle = (channel: string, callback: (arg: unknown) => unknown): void => {
    ipcMain.handle(channel, (event, arg: unknown) => { assertSender(event); return callback(arg) })
  }
  handle('settings:get', () => effectiveSettings())
  handle('platform:login', input => {
    return mutatePlatform(async () => { await platform.login(input); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:logout', () => {
    return mutatePlatform(async () => { await platform.logout(); emit({ kind: 'settings-changed' }); return effectiveSettings() })
  })
  handle('platform:refresh', () => {
    const controller = new AbortController()
    const release = platformWork.track(platformWork.revision, () => controller.abort(new Error('平台连接已更改，状态刷新已取消。')))
    return platformMutations.run(async () => {
      try { await platform.refresh(controller.signal); return await effectiveSettings() }
      finally { release(); emit({ kind: 'settings-changed' }) }
    })
  })
  handle('audio:capture-error', () => displayCapture.getFailure())
  handle('settings:save', async input => {
    const parsed = parseInput(settingsInputSchema, input)
    const previous = await settings.getSettings()
    // Backgrounds belong to the interview library; stale settings dialogs cannot overwrite them.
    const platformChanged = parsed.platform.baseUrl !== previous.platform?.baseUrl || (previous.platform?.enabled && !parsed.platform.enabled)
    const finishPlatformChange = platformChanged ? platformWork.beginChange() : undefined
    try { await settings.saveSettings({ ...parsed, context: previous.context, interviewTarget: previous.interviewTarget }) }
    finally { finishPlatformChange?.() }
    // A failed library rebuild must not report that an already-committed target was not saved.
    try { await references.refreshConfiguration() }
    catch { emit({ kind: 'documents-error', message: '设置已保存，但资料索引更新失败。请在参考资料中检查状态并重试。' }) }
    const saved = await effectiveSettings()
    emit({ kind: 'settings-changed' })
    return saved
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
  handle('embedding:test', async () => {
    const config = await settings.getSettings()
    const secrets = await settings.getSecrets()
    return new EmbeddingClient(config.embedding, secrets.embeddingApiKey).test()
  })
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
      ownedAsr = asr = new AsrClient(connection.settings.asr, connection.apiKey, emit)
      return await ownedAsr.start()
    } catch (error) {
      release?.()
      if (releasePlatformAsr === release) releasePlatformAsr = undefined
      throw error
    } finally { if (epoch === asrEpoch) startingAsr = false }
  })
  ipcMain.on('asr:audio', (event, sessionId: unknown, audio: unknown) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    if (typeof sessionId !== 'string' || !(audio instanceof ArrayBuffer) || audio.byteLength > 64000 || audio.byteLength % 2 !== 0) return
    asr?.sendAudio(sessionId, audio)
  })
  handle('asr:stop', () => { asrEpoch++; startingAsr = false; return asr?.stop() })
  handle('answer:generate', async input => {
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
      fullBounds = window.getBounds()
      window.setMinimumSize(430, 500)
      window.setSize(480, 640)
    } else {
      window.setMinimumSize(900, 640)
      if (fullBounds) window.setBounds(fullBounds)
    }
  })
  handle('history:list', () => history.list())
  handle('history:save', record => history.save(record as SessionRecord))
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
  window.on('closed', () => { disposeWork(); window = null; compact = false; fullBounds = null })
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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Interview Copilot', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'front' }] }
  ]))
  registerHandlers()
  await createWindow()
  globalShortcut.register('CommandOrControl+Shift+Enter', () => emit({ kind: 'shortcut', action: 'answer' }))
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
}).catch(error => { dialog.showErrorBox('启动失败', error instanceof Error ? error.message : '无法启动应用'); app.quit() })

app.on('before-quit', () => { disposeWork(); references.dispose(); globalShortcut.unregisterAll() })
app.on('window-all-closed', () => app.quit())
