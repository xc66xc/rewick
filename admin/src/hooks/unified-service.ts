import { defaultWebSearch, type Capability, type Config } from '../types'
export interface ServiceForm {
  id: string; providerId: string; kind: Capability; name: string; url: string; model: string
  topK: number; searchDepth: Config['webSearch']['searchDepth']; timeoutMs: number; includeAnswer: 'none' | 'basic' | 'advanced'
  enabled: boolean; hasApiKey?: boolean; apiKey?: string; maxOutputTokens: number; dimensions: number
}
export function allowsBlankServiceKey(form: Pick<ServiceForm, 'kind' | 'url'>): boolean {
  if (form.kind !== 'embedding') return false
  try {
    const url = new URL(form.url.trim())
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.hash
  } catch { return false }
}
export function serviceForms(config: Config): ServiceForm[] {
  return config.providers.flatMap(provider => {
    const base = { id: provider.id, providerId: provider.id, kind: provider.kind, name: provider.name, url: provider.url, enabled: provider.enabled, hasApiKey: provider.hasApiKey, maxOutputTokens: 2048, dimensions: 1024, model: '', topK: 5, searchDepth: 'advanced' as const, timeoutMs: 8000, includeAnswer: 'none' as const }
    if (provider.kind === 'llm') {
      const models = config.models.filter(model => model.providerId === provider.id)
      return models.length ? models.map(model => ({ ...base, id: model.id, name: model.name, model: model.model, maxOutputTokens: model.maxOutputTokens, enabled: provider.enabled && model.enabled })) : [{ ...base, enabled: false }]
    }
    if (provider.kind === 'web-search') {
      const binding = config.webSearch ?? defaultWebSearch
      return [{ ...base, ...(binding.providerId === provider.id ? { topK: binding.topK, searchDepth: binding.searchDepth, timeoutMs: binding.timeoutMs, includeAnswer: binding.includeAnswer ?? 'none' } : {}), enabled: provider.enabled && binding.enabled && binding.providerId === provider.id }]
    }
    const binding = config[provider.kind]
    return [{ ...base, dimensions: 'dimensions' in binding && binding.providerId === provider.id ? binding.dimensions : 1024, model: binding.providerId === provider.id ? binding.model : '', enabled: provider.enabled && binding.enabled && binding.providerId === provider.id }]
  })
}
export function applyService(config: Config, form: ServiceForm, remove = false): Config {
  const next = structuredClone(config)
  next.webSearch ??= { ...defaultWebSearch }
  const previous = next.providers.find(item => item.id === form.providerId)
  const url = form.url.trim()
  if (previous && (previous.url !== url || previous.kind !== form.kind) && !form.apiKey?.trim() && !remove) throw new Error('更换接口地址后请重新填写 API Key。')
  if (remove) {
    next.models = next.models.filter(model => model.id !== form.id)
    if (!next.models.some(model => model.providerId === form.providerId)) next.providers = next.providers.filter(provider => provider.id !== form.providerId)
    if (next.asr.providerId === form.providerId) next.asr = { enabled: false, providerId: '', model: '' }
    if (next.embedding.providerId === form.providerId) next.embedding = { enabled: false, providerId: '', model: '', dimensions: 1024 }
    if (next.webSearch.providerId === form.providerId) next.webSearch = { ...next.webSearch, enabled: false, providerId: '' }
  } else {
    const provider = { id: form.providerId, kind: form.kind, name: form.name.trim(), url, enabled: form.kind === 'llm' ? true : form.enabled, ...(form.apiKey?.trim() ? { apiKey: form.apiKey.trim() } : {}) }
    next.providers = [...next.providers.filter(item => item.id !== form.providerId), provider]
    if (form.kind === 'llm') {
      if (previous && !previous.enabled) next.models = next.models.map(model => model.providerId === form.providerId ? { ...model, enabled: false } : model)
      const id = config.models.some(model => model.id === form.id) ? form.id : `model-${form.providerId}`
      next.models = [...next.models.filter(item => item.id !== id), { id, name: form.name.trim(), providerId: form.providerId, model: form.model.trim(), enabled: form.enabled, maxOutputTokens: form.maxOutputTokens }]
    } else if (form.kind === 'web-search') {
      if (!form.enabled && next.webSearch.providerId && next.webSearch.providerId !== form.providerId) throw new Error('当前联网搜索使用其他服务，请启用此项以切换服务及搜索参数。')
      next.webSearch = { enabled: form.enabled, providerId: form.providerId, topK: form.topK, searchDepth: form.searchDepth, timeoutMs: form.timeoutMs, includeAnswer: form.includeAnswer }
    } else if (form.enabled || !next[form.kind].providerId || next[form.kind].providerId === form.providerId) {
      if (form.kind === 'asr') next.asr = { enabled: form.enabled, providerId: form.providerId, model: form.model.trim() }
      else if (form.kind === 'embedding') next.embedding = { enabled: form.enabled, providerId: form.providerId, model: form.model.trim(), dimensions: 1024 }
    } else throw new Error('当前该能力已有其他服务配置，请启用此项以切换服务。')
  }
  const available = next.models.filter(model => model.enabled && next.providers.some(provider => provider.id === model.providerId && provider.enabled))
  if (!available.some(model => model.id === next.defaultModelId)) next.defaultModelId = available[0]?.id ?? ''
  return next
}
