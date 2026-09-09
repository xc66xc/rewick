import type { Settings } from '../../shared/types'
import { selectedPlatformModel } from '../../shared/platform-models'
import type { ServiceSecrets } from './settings-store'
import { isLoopback } from './validation'

export type PlatformCapability = 'llm' | 'asr' | 'knowledge'
export function assertEmbeddingSelection(settings: Settings): void {
  const selected = settings.serviceSelections?.embedding
  if (selected?.source === 'platform') throw new Error('平台暂未提供向量服务，请选择自定义向量模型。')
  if (selected?.source === 'custom' && !settings.customServices?.some(value => value.id === selected.id && value.kind === 'embedding')) {
    throw new Error('所选自定义向量服务已移除，请重新选择。')
  }
}
export function needsPlatform(settings: Settings, secrets: ServiceSecrets, capability: PlatformCapability): boolean {
  const selected = settings.serviceSelections?.[capability]
  if (selected) return selected.source === 'platform'
  const ownKey = capability === 'llm' ? secrets.llmApiKey : capability === 'asr' ? secrets.asrApiKey : secrets.remoteKnowledgeApiKey
  if (ownKey.trim() || !settings.platform?.enabled) return false
  if (capability === 'llm' && isLoopback(new URL(settings.llm.baseUrl).hostname)) return false
  return true
}
export function routeService(settings: Settings, secrets: ServiceSecrets, capability: PlatformCapability): { settings: Settings; apiKey: string; platform?: true } {
  const selected = settings.serviceSelections?.[capability]
  if (selected?.source === 'custom' && !settings.customServices?.some(value => value.id === selected.id && value.kind === capability)) {
    throw new Error('所选自定义服务已移除，请在模型与设置中重新选择。')
  }
  const apiKey = capability === 'llm' ? secrets.llmApiKey : capability === 'asr' ? secrets.asrApiKey : secrets.remoteKnowledgeApiKey
  if (!needsPlatform(settings, secrets, capability)) return { settings, apiKey }
  const platform = settings.platform
  if (!platform?.authenticated || !secrets.platformAccessToken || !platform.expiresAt || Date.parse(platform.expiresAt) <= Date.now()) throw new Error('请先登录平台账号后再使用平台服务。')
  const names = { llm: '回答模型', asr: '实时转写', knowledge: '远程知识库' }
  if (!platform.capabilities[capability]) throw new Error(`平台尚未启用${names[capability]}，请联系管理员或填写自己的 API Key。`)
  if (capability === 'llm') {
    const model = selectedPlatformModel(selected?.source === 'platform' ? { ...platform, selectedModelId: selected.id } : platform)
    if (!model) throw new Error('所选平台模型已下架或不可用，请在模型与设置中刷新列表并重新选择。')
    return { platform: true, settings: { ...settings, llm: { ...settings.llm, baseUrl: `${platform.baseUrl}/api/v1/llm`, model: model.id, hasApiKey: true } }, apiKey: secrets.platformAccessToken }
  }
  if (capability === 'asr') {
    const url = new URL(`${platform.baseUrl}/api/v1/asr`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    if (selected?.id) {
      if (!platform.services?.asr.some(value => value.id === selected.id)) throw new Error('所选平台转写服务已下架，请重新选择。')
      url.searchParams.set('serviceId', selected.id)
    }
    return { platform: true, settings: { ...settings, asr: { ...settings.asr, url: url.toString(), model: platform.models.asr, hasApiKey: true } }, apiKey: secrets.platformAccessToken }
  }
  if (selected?.id && !platform.services?.knowledge.some(value => value.id === selected.id)) throw new Error('所选平台知识库已下架，请重新选择。')
  return { platform: true, settings: { ...settings, remoteKnowledge: { enabled: settings.remoteKnowledge.enabled, url: `${platform.baseUrl}/api/v1/knowledge/search`, agentId: 'platform', hasApiKey: true, ...(selected?.id ? { serviceId: selected.id } : {}) } }, apiKey: secrets.platformAccessToken }
}
