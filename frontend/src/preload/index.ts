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
  getPackageCatalog: () => invoke('payments:catalog'),
  getPaymentOrders: () => invoke('payments:list'),
  createPaymentOrder: input => invoke('payments:create', input),
  refreshPaymentOrder: id => invoke('payments:refresh', id),
  cancelPaymentOrder: id => invoke('payments:cancel', id),
  getWallet: () => invoke('wallet:get'),
  startInterview: (requestId, environmentId) => invoke('interview:start', { requestId, environmentId }),
  endInterview: () => invoke('interview:end'),
  getCaptureError: () => invoke('audio:capture-error'),
  getSettings: () => invoke('settings:get'),
  getRememberedLogin: () => invoke('platform:remembered-login'),
  platformLogin: input => invoke('platform:login', input),
  platformRegister: input => invoke('platform:register', input),
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
  saveEnvironment: input => invoke('environments:save', input),
  removeEnvironment: id => invoke('environments:remove', id),
  activateEnvironment: id => invoke('environments:activate', id),
  testRemoteKnowledge: () => invoke('remote-knowledge:test'),
  listReferences: () => invoke('references:list'),
  importReferences: () => invoke('references:import'),
  previewReference: id => invoke('references:preview', id),
  updateReference: (id, patch) => invoke('references:update', { id, patch }),
  removeReference: id => invoke('references:remove', id),
  reindexReference: id => invoke('references:reindex', id),
  startAsr: () => invoke('asr:start'),
  sendAudio: (sessionId, audio) => ipcRenderer.send('asr:audio', sessionId, audio, accountScope ?? latestScope),
  stopAsr: () => invoke('asr:stop'),
  generateAnswer: request => invoke('answer:generate', request),
  cancelAnswer: () => invoke('answer:cancel'),
  setAlwaysOnTop: value => invoke('window:pin', value),
  setCompact: value => invoke('window:compact', value),
  getHistoryPage: cursor => invoke('history:page', cursor),
  getHistoryDetail: id => invoke('history:detail', id),
  getHistorySyncStatus: () => invoke('history:status'),
  getHistory: () => invoke('history:list'),
  saveSession: (record, owner) => invoke('history:save', { record, accountScope: owner ?? accountScope ?? latestScope }),
  removeSession: id => invoke('history:remove', id),
  exportSession: record => invoke('history:export', record),
  onEvent: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppEvent): void => callback(data)
    ipcRenderer.on('copilot:event', listener)
    return () => ipcRenderer.removeListener('copilot:event', listener)
  }
}
}
contextBridge.exposeInMainWorld('copilot', createBridge())
