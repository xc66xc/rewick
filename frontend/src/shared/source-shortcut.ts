import { z } from 'zod'

/** Device-local shortcut; never part of cloud interview preferences. */
export interface SourceShortcutSettings { accelerator: string; error?: string }
const aliases: Record<string, string> = { ctrl: 'CommandOrControl', cmd: 'CommandOrControl', command: 'CommandOrControl', control: 'CommandOrControl', cmdorctrl: 'CommandOrControl', commandorcontrol: 'CommandOrControl', alt: 'Alt', option: 'Alt', shift: 'Shift' }
export function normalizeSourceShortcut(value: string): string {
  if (!value.trim()) return ''
  const parts = value.split('+').map(part => part.trim())
  const key = parts.pop()?.toUpperCase()
  const modifiers = parts.map(part => aliases[part.toLowerCase()])
  if (!key || !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|SPACE|ENTER)$/.test(key)
    || modifiers.some(part => !part) || new Set(modifiers).size !== modifiers.length
    || !modifiers.some(part => part === 'CommandOrControl' || part === 'Alt')) throw new Error('请使用 Ctrl/Cmd 或 Alt 加字母、数字、功能键的组合。')
  const ordered = ['CommandOrControl', 'Alt', 'Shift'].filter(part => modifiers.includes(part))
  const accelerator = [...ordered, key === 'ENTER' ? 'Enter' : key === 'SPACE' ? 'Space' : key].join('+')
  if (['CommandOrControl+Shift+R', 'CommandOrControl+Shift+Enter'].includes(accelerator)) throw new Error('该组合已用于恢复窗口或生成回答，请换一个快捷键。')
  return accelerator
}
export const sourceShortcutSchema = z.object({ accelerator: z.string().max(80) }).strict()
