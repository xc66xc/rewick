import { contextBridge, ipcRenderer } from 'electron'
import type { AppEvent, DesktopBridge } from '../shared/types'

let latestScope: string | undefined
function createBridge(accountScope?: string): DesktopBridge {
  const invoke = async (channel: string, payload?: unknown) => {
    const value = await ipcRenderer.invoke(channel, { payload, accountScope: accountScope ?? latestScope })
    if (!accountScope && value && typeof value === 'object' && 'platform' in value) latestScope = value.accountScope
    return value
  }
  return {
  withAccountScope: scope => createBridge(scope),
  mock: {
    capabilities: () => invoke('mock:request', { action: 'capabilities' }),
    wallet: () => invoke('mock:request', { action: 'wallet' }),
    ledger: () => invoke('mock:request', { action: 'ledger' }),
    list: () => invoke('mock:request', { action: 'list' }),
    create: input => invoke('mock:request', { action: 'create', input }),
    get: id => invoke('mock:request', { action: 'get', input: { id } }),
    command: (id, command) => invoke('mock:request', { action: 'command', input: { id, command } }),
    report: id => invoke('mock:request', { action: 'report', input: { id } }),
    retryReport: (id, requestId) => invoke('mock:request', { action: 'retryReport', input: { id, requestId } }),
    exportQa: id => invoke('mock:export-qa', id),
    remove: id => invoke('mock:request', { action: 'remove', input: { id } }),
    connect: id => invoke('mock:connect', id),
    disconnect: () => invoke('mock:disconnect'),
    sendAudio: frame => ipcRenderer.send('mock:audio', frame, accountScope ?? latestScope),
    credit: (bytes, speechId, generation) => ipcRenderer.send('mock:credit', { bytes, speechId, generation }, accountScope ?? latestScope),
    onEvent: callback => {
      const listener = (_event: Electron.IpcRendererEvent, scope: string, data: import('../shared/mock-interview').MockMessage) => { if (scope === (accountScope ?? latestScope)) callback(data) }
      ipcRenderer.on('mock:event', listener)
      return () => ipcRenderer.removeListener('mock:event', listener)
    }
  },
  openWebSource: url => invoke('web-search:open-source', url),
  recordings: {
    start: sessionId => invoke('recordings:start', sessionId),
    append: (sessionId, audio) => invoke('recordings:append', { sessionId, audio }),
    stop: sessionId => invoke('recordings:stop', sessionId),
    info: sessionId => invoke('recordings:info', sessionId),
    remove: sessionId => invoke('recordings:remove', sessionId),
    exportReview: sessionId => invoke('recordings:export', sessionId),
    download: sessionId => invoke('recordings:download', sessionId),
    cancelExport: sessionId => invoke('recordings:cancel-export', sessionId)
  },
  getPackageCatalog: () => invoke('payments:catalog'),
  getPaymentOrders: () => invoke('payments:list'),
  createPaymentOrder: input => invoke('payments:create', input),
  refreshPaymentOrder: id => invoke('payments:refresh', id),
  cancelPaymentOrder: id => invoke('payments:cancel', id),
  openPaymentCheckout: id => invoke('payments:openCheckout', id),
  getWallet: () => invoke('wallet:get'),
  startInterview: (requestId, environmentId) => invoke('interview:start', { requestId, environmentId }),
  endInterview: () => invoke('interview:end'),
  getCaptureError: () => invoke('audio:capture-error'),
  getSettings: () => invoke('settings:get'),
  getSourceShortcut: () => invoke('shortcut:source:get'),
  saveSourceShortcut: input => invoke('shortcut:source:save', input),
  getRememberedLogin: () => invoke('platform:remembered-login'),
  platformLogin: input => invoke('platform:login', input),
  platformRegister: input => invoke('platform:register', input),
  invitationSettings: () => invoke('invitation:settings'),
  invitationMine: () => invoke('invitation:mine'),
  invitationCreateCode: () => invoke('invitation:code'),
  requestEmailCode: input => invoke('platform:email-code', input),
  requestPasswordResetCode: input => invoke('platform:password-reset-code', input),
  resetPassword: input => invoke('platform:password-reset', input),
  saveCustomService: input => invoke('services:save', input),
  testCustomService: input => invoke('services:test', input),
  removeCustomService: id => invoke('services:remove', id),
  platformLogout: () => invoke('platform:logout'),
  refreshPlatform: () => invoke('platform:refresh'),
  saveSettings: input => invoke('settings:save', input),
  testModel: () => invoke('model:test'),
  importContext: () => invoke('context:import'),
  importTarget: () => invoke('target:import'),
  getResume: id => invoke('resumes:get', id),
  getTarget: id => invoke('targets:get', id),
  getInterviewLibrary: () => invoke('interviews:list'),
  saveResume: input => invoke('resumes:save', input),
  removeResume: id => invoke('resumes:remove', id),
  saveTarget: input => invoke('targets:save', input),
  removeTarget: id => invoke('targets:remove', id),
  extractEnvironmentHotwords: input => invoke('environments:extract-hotwords', input),
  saveEnvironment: input => invoke('environments:save', input),
  saveEnvironmentStamp: input => invoke('environments:stamp', input),
  removeEnvironment: id => invoke('environments:remove', id),
  activateEnvironment: id => invoke('environments:activate', id),
  listReferences: () => invoke('references:list'),
  importReferences: () => invoke('references:import'),
  previewReference: id => invoke('references:preview', id),
  updateReference: (id, patch) => invoke('references:update', { id, patch }),
  removeReference: id => invoke('references:remove', id),
  reindexReference: id => invoke('references:reindex', id),
  startAsr: () => invoke('asr:start'),
  sendAudio: (sessionId, audio) => ipcRenderer.send('asr:audio', sessionId, audio, accountScope ?? latestScope),
  stopAsr: () => invoke('asr:stop'),
  telemetryEnabled: () => invoke('telemetry:enabled'),
  reportTelemetry: event => ipcRenderer.send('telemetry:event', event, accountScope ?? latestScope),
  generateAnswer: request => invoke('answer:generate', request),
  cancelAnswer: () => invoke('answer:cancel'),
  setAlwaysOnTop: value => invoke('window:pin', value),
  setCompact: value => invoke('window:compact', value),
  setWindowScrim: value => invoke('window:scrim', value),
  getWindowPreferences: () => invoke('window:preferences'),
  saveWindowPreferences: value => invoke('window:preferences-save', value),
  getHistoryPage: cursor => invoke('history:page', cursor),
  getHistoryDetail: id => invoke('history:detail', id),
  getHistorySyncStatus: () => invoke('history:status'),
  getHistory: () => invoke('history:list'),
  stageSessionForLogout: (nonce, record) => invoke('session:stage', { nonce, record }),
  saveSession: (record, owner) => invoke('history:save', { record, accountScope: owner ?? accountScope ?? latestScope }),
  removeSession: id => invoke('history:remove', id),
  exportSession: (record, options) => invoke('history:export', { record, options }),
  ...(import.meta.env.DEV ? { exportAnswersExcel: (id: string) => invoke('history:export-answers-excel', id) } : {}),
  onEvent: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppEvent): void => callback(data)
    ipcRenderer.on('copilot:event', listener)
    return () => ipcRenderer.removeListener('copilot:event', listener)
  }
}
}
contextBridge.exposeInMainWorld('copilot', createBridge())
