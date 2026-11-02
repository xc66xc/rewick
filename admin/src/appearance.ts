export type Theme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'standard' | 'compact'
export interface Appearance { theme: Theme; density: Density; motion: boolean }
export const appearanceKey = 'rewick.admin.appearance'
export const defaultAppearance: Appearance = { theme: 'system', density: 'standard', motion: true }
export function readAppearance(): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaultAppearance
    const value = saved as Record<string, unknown>
    return {
      theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'system',
      density: value.density === 'comfortable' || value.density === 'compact' ? value.density : 'standard',
      motion: typeof value.motion === 'boolean' ? value.motion : true
    }
  } catch { return defaultAppearance } // Appearance storage is optional; malformed preferences cannot block login.
}
export function applyAppearance(value: Appearance) {
  const root = document.documentElement
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  root.dataset.theme = value.theme === 'system' ? (dark ? 'dark' : 'light') : value.theme
  root.dataset.density = value.density
  root.dataset.motion = !value.motion || reduced ? 'reduced' : 'full'
}
