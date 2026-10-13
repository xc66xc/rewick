import { useMemo, useState } from 'react'
import { toast } from '../components/ui/toast'

const defaults = ['一面中', '等待二面中', '已下 offer', '已挂']
function storageKey(scope: string) { return `environment-stamp-shortcuts:v1:${scope}` }
function read(scope: string | undefined): string[] {
  if (!scope) return defaults
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(scope)) ?? 'null')
    if (Array.isArray(raw) && raw.length <= defaults.length && raw.every(value => typeof value === 'string' && defaults.includes(value)) && new Set(raw).size === raw.length) return raw
  } catch { /* Unavailable or malformed local preferences use the original shortcuts. */ }
  return defaults
}

/** Decorative shortcuts are device-local preferences, isolated by account workspace. */
export default function useStampShortcuts(scope: string | undefined) {
  const initial = useMemo(() => read(scope), [scope])
  const [saved, setSaved] = useState({ scope, values: initial })
  const values = saved.scope === scope ? saved.values : initial
  function persist(next: string[]) {
    if (!scope) return
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(next))
      setSaved({ scope, values: next })
    } catch { toast.show('常用文案偏好保存失败，请重试。', { type: 'error' }) }
  }
  return { values, removable: Boolean(scope), changed: values.length !== defaults.length, remove: (value: string) => persist(values.filter(item => item !== value)), restore: () => persist(defaults) }
}
