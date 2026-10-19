import type { Settings } from '../../shared/types'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { selectedPlatformModel } from '../../shared/platform-models'
import type { ServiceSecrets } from './settings-store'
import { isLoopback } from './validation'
import { applyDesktopDefaults, hasAdvancedSettings } from './advanced-settings'

export type PlatformCapability = 'llm' | 'asr'
export function needsPlatform(settings: Settings, secrets: ServiceSecrets, capability: PlatformCapability): boolean {
  settings = applyDesktopDefaults(settings)
  const selected = settings.serviceSelections?.[capability]
  if (selected) return selected.source === 'platform'
  const ownKey = capability === 'llm' ? secrets.llmApiKey : secrets.asrApiKey
  if (ownKey.trim() || !settings.platform?.enabled) return false
  if (capability === 'llm' && isLoopback(new URL(settings.llm.baseUrl).hostname)) return false
  return true
}
export function routeService(settings: Settings, secrets: ServiceSecrets, capability: PlatformCapability): { settings: Settings; apiKey: string; platform?: true } {
  settings = applyDesktopDefaults(settings)
  const selected = settings.serviceSelections?.[capability]
  if (selected?.source === 'custom' && !settings.customServices?.some(value => value.id === selected.id && value.kind === capability)) {
    throw new Error('所选自定义服务已移除，请在模型与设置中重新选择。')
  }
  const apiKey = capability === 'llm' ? secrets.llmApiKey : secrets.asrApiKey
  if (!needsPlatform(settings, secrets, capability)) return { settings, apiKey }
  const platform = settings.platform
  if (platform?.authenticated && !hasAdvancedSettings(settings) && !selected?.id) throw new Error('平台尚未配置默认服务，请联系管理员。')
  if (!platform?.authenticated || !secrets.platformAccessToken || !platform.expiresAt || Date.parse(platform.expiresAt) <= Date.now()) throw new Error('请先登录平台账号后再使用平台服务。')
  assertPlatformTransport(platform.baseUrl)
  const names = { llm: '回答模型', asr: '实时转写' }
  if (!platform.capabilities[capability]) throw new Error(`平台尚未启用${names[capability]}，请联系管理员。`)
  if (capability === 'llm') {
    const model = selectedPlatformModel(selected?.source === 'platform' ? { ...platform, selectedModelId: selected.id } : platform)
    if (!model) throw new Error('所选平台模型已下架或不可用，请在模型与设置中刷新列表并重新选择。')
    return { platform: true, settings: { ...settings, llm: { ...settings.llm, baseUrl: `${platform.baseUrl}/api/v1/llm`, model: model.id, hasApiKey: true } }, apiKey: secrets.platformAccessToken }
  }
  const url = new URL(`${platform.baseUrl}/api/v1/asr`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (selected?.id) {
    if (!platform.services?.asr.some(value => value.id === selected.id)) throw new Error('所选平台转写服务已下架，请重新选择。')
    url.searchParams.set('serviceId', selected.id)
  }
  return { platform: true, settings: { ...settings, asr: { ...settings.asr, url: url.toString(), model: platform.models.asr, hasApiKey: true } }, apiKey: secrets.platformAccessToken }
}
