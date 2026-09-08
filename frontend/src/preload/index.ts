import { contextBridge, ipcRenderer } from 'electron'
import type { AppEvent, DesktopBridge } from '../shared/types'

const bridge: DesktopBridge = {
  getCaptureError: () => ipcRenderer.invoke('audio:capture-error'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  platformLogin: input => ipcRenderer.invoke('platform:login', input),
  platformLogout: () => ipcRenderer.invoke('platform:logout'),
  refreshPlatform: () => ipcRenderer.invoke('platform:refresh'),
  saveSettings: input => ipcRenderer.invoke('settings:save', input),
  testModel: () => ipcRenderer.invoke('model:test'),
  importContext: () => ipcRenderer.invoke('context:import'),
  importTarget: () => ipcRenderer.invoke('target:import'),
  getInterviewLibrary: () => ipcRenderer.invoke('interviews:list'),
  saveResume: input => ipcRenderer.invoke('resumes:save', input),
  removeResume: id => ipcRenderer.invoke('resumes:remove', id),
  saveTarget: input => ipcRenderer.invoke('targets:save', input),
  removeTarget: id => ipcRenderer.invoke('targets:remove', id),
  saveEnvironment: input => ipcRenderer.invoke('environments:save', input),
  removeEnvironment: id => ipcRenderer.invoke('environments:remove', id),
  activateEnvironment: id => ipcRenderer.invoke('environments:activate', id),
  testEmbedding: () => ipcRenderer.invoke('embedding:test'),
  testRemoteKnowledge: () => ipcRenderer.invoke('remote-knowledge:test'),
  listReferences: () => ipcRenderer.invoke('references:list'),
  importReferences: () => ipcRenderer.invoke('references:import'),
  previewReference: id => ipcRenderer.invoke('references:preview', id),
  updateReference: (id, patch) => ipcRenderer.invoke('references:update', { id, patch }),
  removeReference: id => ipcRenderer.invoke('references:remove', id),
  reindexReference: id => ipcRenderer.invoke('references:reindex', id),
  startAsr: () => ipcRenderer.invoke('asr:start'),
  sendAudio: (sessionId, audio) => ipcRenderer.send('asr:audio', sessionId, audio),
  stopAsr: () => ipcRenderer.invoke('asr:stop'),
  generateAnswer: request => ipcRenderer.invoke('answer:generate', request),
  cancelAnswer: () => ipcRenderer.invoke('answer:cancel'),
  setAlwaysOnTop: value => ipcRenderer.invoke('window:pin', value),
  setCompact: value => ipcRenderer.invoke('window:compact', value),
  getHistory: () => ipcRenderer.invoke('history:list'),
  saveSession: record => ipcRenderer.invoke('history:save', record),
  removeSession: id => ipcRenderer.invoke('history:remove', id),
  exportSession: record => ipcRenderer.invoke('history:export', record),
  onEvent: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: AppEvent): void => callback(data)
    ipcRenderer.on('copilot:event', listener)
    return () => ipcRenderer.removeListener('copilot:event', listener)
  }
}
contextBridge.exposeInMainWorld('copilot', bridge)
