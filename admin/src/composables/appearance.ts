import { reactive, ref, watch } from 'vue'
export type ThemeMode = 'light' | 'dark' | 'auto'
export type Density = 'comfy' | 'regular' | 'compact'
export interface Appearance { theme: ThemeMode; density: Density; railCollapsed: boolean; motion: boolean }
const key = 'rewick.admin.appearance'
const defaults: Appearance = { theme: 'auto', density: 'regular', railCollapsed: false, motion: true }
function load(): Appearance {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null') as Record<string, unknown> | null
    if (!v) return { ...defaults }
    return { theme: v.theme === 'light' || v.theme === 'dark' ? v.theme : 'auto', density: v.density === 'comfy' || v.density === 'comfortable' ? 'comfy' : v.density === 'compact' ? 'compact' : 'regular', railCollapsed: v.railCollapsed === true, motion: v.motion !== false }
  } catch { return { ...defaults } }
}
export const appearance = reactive(load())
export const appearanceError = ref('')
const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
function apply() { document.documentElement.dataset.theme = appearance.theme === 'auto' ? dark?.matches ? 'dark' : 'light' : appearance.theme; document.documentElement.dataset.density = appearance.density; document.documentElement.dataset.motion = !appearance.motion || reduced?.matches ? 'reduced' : 'full' }
watch(appearance, () => { apply(); try { localStorage.setItem(key, JSON.stringify(appearance)); appearanceError.value = '' } catch { appearanceError.value = '浏览器未允许保存外观偏好，本次设置仍然有效。' } }, { deep: true })
apply()
dark?.addEventListener('change', apply); reduced?.addEventListener('change', apply)
window.addEventListener('storage', event => { if (event.key === key) { Object.assign(appearance, load()); apply() } })
