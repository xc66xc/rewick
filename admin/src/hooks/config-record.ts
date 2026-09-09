import type { Config } from '../types'
export type ConfigRecord = { kind: 'providers' | 'models'; id: string; remove?: boolean } | { kind: 'defaultModelId' | 'asr' | 'knowledge' }
export function recordPayload(saved: Config, draft: Config, target: ConfigRecord): Config {
  const next = { ...saved }
  if (target.kind === 'providers' || target.kind === 'models') {
    const field = target.kind
    const row = draft[field].find(item => item.id === target.id)
    if (target.remove) Object.assign(next, { [field]: saved[field].filter(item => item.id !== target.id) })
    else {
      if (!row) throw new Error('记录不存在，请重新加载。')
      if (field === 'models' && 'providerId' in row && !saved.providers.some(item => item.id === row.providerId)) throw new Error('请先保存该模型关联的服务。')
      Object.assign(next, { [field]: [...saved[field].filter(item => item.id !== target.id), row] })
      if (field === 'models' && !saved.defaultModelId && row.enabled) next.defaultModelId = row.id
    }
  } else Object.assign(next, { [target.kind]: draft[target.kind] })
  return next
}
export function mergeRecord(draft: Config, saved: Config, previous: Config, target: ConfigRecord): Config {
  const next = { ...draft, version: saved.version }
  if (target.kind === 'providers' || target.kind === 'models') {
    const field = target.kind
    const row = saved[field].find(item => item.id === target.id)
    Object.assign(next, { [field]: draft[field].flatMap(item => item.id !== target.id ? [item] : row ? [row] : []) })
    if (draft.defaultModelId === previous.defaultModelId) next.defaultModelId = saved.defaultModelId
  } else Object.assign(next, { [target.kind]: saved[target.kind] })
  return next
}
