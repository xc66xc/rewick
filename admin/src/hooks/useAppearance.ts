import { useEffect, useState } from 'react'
import { appearanceKey, applyAppearance, readAppearance, type Appearance } from '../appearance'
export function useAppearance() {
  const [appearance, setAppearance] = useState(readAppearance)
  const [error, setError] = useState('')
  useEffect(() => {
    const apply = () => applyAppearance(appearance)
    apply()
    const queries = ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)'].map(query => window.matchMedia?.(query))
    queries.forEach(query => query?.addEventListener('change', apply))
    return () => queries.forEach(query => query?.removeEventListener('change', apply))
  }, [appearance])
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === appearanceKey || event.key === null) setAppearance(readAppearance())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, []) // Synchronize only appearance preferences across tabs; auth stays session-scoped.
  function update(patch: Partial<Appearance>) {
    const next = { ...appearance, ...patch }
    setAppearance(next)
    applyAppearance(next)
    try { localStorage.setItem(appearanceKey, JSON.stringify(next)); setError('') }
    catch { setError('浏览器未允许保存外观偏好，本次设置仍然有效。') }
  }
  return { appearance, update, error }
}
