import type { ServiceKind, ServiceSelection, Settings } from '../../../shared/types'
import { platformModels } from '../../../shared/platform-models'

export const serviceLabels: Record<ServiceKind, string> = { llm: '回答模型', asr: '实时语音转写', knowledge: '远程知识库' }
export function platformChoices(settings: Settings, kind: ServiceKind): { id: string; name: string }[] {
  const platform = settings.platform
  if (!platform?.authenticated) return []
  const unavailable = settings.unavailablePlatformSelections?.[kind]
  if (kind === 'llm') return platform.capabilities.llm ? platformModels(platform).filter(item => item.id !== unavailable) : []
  if (!platform.capabilities[kind]) return []
  return (platform.services?.[kind] ?? []).filter(item => item.id !== unavailable)
}
export function selectionFor(settings: Settings, kind: ServiceKind): ServiceSelection | undefined {
  const explicit = settings.serviceSelections?.[kind]
  if (explicit) return explicit
  if (settings.preferencesVersion !== undefined) return undefined
  const id = kind === 'llm' ? settings.platform?.selectedModelId || settings.platform?.models.llm : platformChoices(settings, kind)[0]?.id
  return id ? { source: 'platform', id } : undefined
}
export function selectedCustom(settings: Settings, kind: ServiceKind) {
  const selection = settings.serviceSelections?.[kind]
  return selection?.source === 'custom' ? settings.customServices?.find(profile => profile.kind === kind && profile.id === selection.id) : undefined
}
export function localService(url: string): boolean {
  try { const { hostname } = new URL(url); return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname) }
  catch { return false }
}
export function explicitServiceReady(settings: Settings, kind: ServiceKind): boolean | undefined {
  const selection = settings.serviceSelections?.[kind]
  if (!selection) return settings.preferencesVersion !== undefined ? false : undefined
  if (selection.source === 'platform') return platformChoices(settings, kind).some(service => service.id === selection.id)
  const profile = selectedCustom(settings, kind)
  return Boolean(profile && (profile.hasApiKey || (kind !== 'knowledge' && localService(profile.url))))
}
export function answerModelLabel(settings: Settings): string {
  const selection = selectionFor(settings, 'llm')
  if (selection?.source === 'custom') return selectedCustom(settings, 'llm')?.name ?? '请选择回答模型'
  if (selection?.source === 'platform') return platformChoices(settings, 'llm').find(model => model.id === selection.id)?.name ?? '请选择回答模型'
  return settings.llm.model
}
