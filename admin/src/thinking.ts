export type ThinkingMode = 'default' | 'disabled' | 'enabled'
export type ThinkingProtocol = 'none' | 'bailian' | 'deepseek'
export const thinkingModeNames: Record<ThinkingMode, string> = { default: '跟随模型默认', disabled: '关闭', enabled: '开启' }
export const thinkingProtocolNames: Record<ThinkingProtocol, string> = { none: '未指定', bailian: '阿里云百炼', deepseek: 'DeepSeek' }
export function suggestThinkingProtocol(address: string): ThinkingProtocol {
  try {
    const host = new URL(address).hostname
    if (host === 'api.deepseek.com') return 'deepseek'
    if (['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(host) || host.endsWith('.maas.aliyuncs.com')) return 'bailian'
  } catch { /* Incomplete URL while editing: let required field validation report it. */ }
  return 'none'
}
