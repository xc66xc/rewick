import type { Settings, SettingsInput } from '../../shared/types'

export function hasAdvancedSettings(settings: Settings): boolean {
  return settings.platform?.advancedSettingsEnabled === true
}

/** Resolve policy without overwriting the account's saved custom services or credentials. */
export function applyDesktopDefaults(settings: Settings): Settings {
  if (!settings.platform?.authenticated || hasAdvancedSettings(settings)) return settings
  const defaults = settings.platform.desktopDefaults
  return { ...settings, unavailablePlatformSelections: {},
    serviceSelections: {
      llm: { source: 'platform', id: defaults?.llmModelId ?? '' },
      asr: { source: 'platform', id: defaults?.asrServiceId ?? '' },
      knowledge: { source: 'platform', id: defaults?.knowledgeServiceId ?? '' },
    },
    llm: { ...settings.llm, temperature: defaults?.temperature ?? 0 },
    remoteKnowledge: { ...settings.remoteKnowledge, enabled: defaults?.retrievalMode === 'remote' },
  }
}

export function requireAdvancedSettings(settings: Settings): void {
  if (!hasAdvancedSettings(settings)) throw new Error('当前账号没有高级模型设置权限，请联系管理员。')
}

export function assertAllowedSettings(input: SettingsInput, current: Settings): void {
  if (hasAdvancedSettings(current)) return
  const keys = (value: SettingsInput | Settings) => JSON.stringify({ selections: value.serviceSelections,
    llm: { baseUrl: value.llm.baseUrl, model: value.llm.model, temperature: value.llm.temperature },
    asr: { url: value.asr.url, model: value.asr.model }, remote: { enabled: value.remoteKnowledge.enabled, url: value.remoteKnowledge.url, agentId: value.remoteKnowledge.agentId },
    selectedModelId: value.platform?.selectedModelId,
  })
  if (keys(input) !== keys(current) || input.llm.apiKey || input.asr.apiKey || input.remoteKnowledge.apiKey) {
    throw new Error('当前账号不能修改高级模型设置，请重新读取设置。')
  }
}

export function preserveLocalAdvancedSettings(input: SettingsInput, saved: Settings): SettingsInput {
  return { ...input, serviceSelections: saved.serviceSelections, llm: { ...saved.llm },
    asr: { ...saved.asr, silenceMs: input.asr.silenceMs }, remoteKnowledge: { ...saved.remoteKnowledge } }
}
