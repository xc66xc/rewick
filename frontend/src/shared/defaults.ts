import type { Settings } from './types'
import { productionPlatformUrl } from './platform-transport'
declare const __COPILOT_PLATFORM_URL__: string
export const platformBaseUrl = typeof __COPILOT_PLATFORM_URL__ === 'undefined' ? productionPlatformUrl : __COPILOT_PLATFORM_URL__
export const defaultSettings: Settings = {
  customServices: [],
  platform: { advancedSettingsEnabled: false, webSearchAvailable: false, webSearchTimeoutMs: 8000, enabled: false, baseUrl: platformBaseUrl, authenticated: false, capabilities: { llm: false, asr: false }, models: { llm: '', asr: '' } },
  asr: { url: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', model: 'fun-asr-realtime', hasApiKey: false, silenceMs: 800 },
  llm: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', hasApiKey: false, temperature: 0.5 },
  context: { name: '', text: '' },
  interviewTarget: { companyName: '', roleName: '', jobDescription: '' },
  retrieval: { enabled: false },
  webSearch: { enabled: false },
  answerStyle: 'concise',
  autoAnswer: { enabled: true, pauseMs: 1500 }
}
