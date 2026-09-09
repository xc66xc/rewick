import type { Settings } from './types'
declare const __COPILOT_PLATFORM_URL__: string
export const platformBaseUrl = typeof __COPILOT_PLATFORM_URL__ === 'undefined' ? 'http://127.0.0.1:8080' : __COPILOT_PLATFORM_URL__
export const defaultSettings: Settings = {
  customServices: [],
  platform: { enabled: false, baseUrl: platformBaseUrl, authenticated: false, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '' } },
  asr: { url: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', model: 'fun-asr-realtime', hasApiKey: false, silenceMs: 800 },
  llm: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', hasApiKey: false, temperature: 0.5 },
  context: { name: '', text: '' },
  interviewTarget: { companyName: '', roleName: '', jobDescription: '' },
  embedding: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'text-embedding-v4', dimensions: 1024, hasApiKey: false },
  retrieval: { enabled: false },
  remoteKnowledge: { enabled: false, url: '', agentId: '', hasApiKey: false },
  answerStyle: 'concise',
  autoAnswer: { enabled: true, pauseMs: 1500 }
}
