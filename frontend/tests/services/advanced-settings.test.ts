import { describe, expect, it } from 'vitest'
import { applyDesktopDefaults, assertAllowedSettings, preserveLocalAdvancedSettings, requireAdvancedSettings } from '../../src/main/services/advanced-settings'
import { routeService } from '../../src/main/services/service-routing'
import { platformInfoSchema } from '../../src/main/services/platform-schema'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings, SettingsInput } from '../../src/shared/types'

function configured(advancedSettingsEnabled = false): Settings {
  return { ...structuredClone(defaultSettings),
    customServices: [{ id: 'own', name: 'Own', kind: 'llm', hasApiKey: true, url: 'https://own.example/v1', model: 'custom' }],
    serviceSelections: { llm: { source: 'custom', id: 'own' }, asr: { source: 'custom', id: 'old' } },
    llm: { ...defaultSettings.llm, model: 'custom', temperature: 1.5 },
    platform: { enabled: true, authenticated: true, advancedSettingsEnabled, baseUrl: 'https://platform.example', expiresAt: new Date(Date.now() + 60000).toISOString(),
      capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'platform-model', asr: 'asr', available: [{ id: 'platform-model', name: 'Platform' }] },
      services: { asr: [{ id: 'speech', name: 'Speech' }], knowledge: [{ id: 'knowledge', name: 'Knowledge' }] },
      desktopDefaults: { version: 1, llmModelId: 'platform-model', asrServiceId: 'speech', temperature: 0.3, retrievalMode: 'remote', knowledgeServiceId: 'knowledge' } } }
}
const secrets = { platformAccessToken: 'platform-token', llmApiKey: 'own-key', asrApiKey: 'own-asr-key', remoteKnowledgeApiKey: 'own-rag-key' }

describe('advanced settings authorization', () => {
  it('routes every ordinary capability through platform defaults despite saved custom choices and keys', () => {
    const saved = configured()
    const answer = routeService(saved, secrets, 'llm')
    expect(answer.apiKey).toBe('platform-token')
    expect(answer.settings.llm).toMatchObject({ model: 'platform-model', temperature: 0.3 })
    expect(routeService(saved, secrets, 'asr').settings.asr.url).toBe('wss://platform.example/api/v1/asr?serviceId=speech')
    expect(routeService(saved, secrets, 'knowledge').settings.remoteKnowledge).toMatchObject({ serviceId: 'knowledge', enabled: true })
    expect(saved.serviceSelections?.llm).toEqual({ source: 'custom', id: 'own' })
    expect(saved.llm.temperature).toBe(1.5)
  })
  it('rejects missing defaults instead of falling back to saved custom credentials', () => {
    const saved = configured()
    if (saved.platform) saved.platform.desktopDefaults = undefined
    expect(() => routeService(saved, secrets, 'llm')).toThrow('平台尚未配置默认服务')
    expect(() => routeService(saved, secrets, 'asr')).toThrow('平台尚未配置默认服务')
  })
  it('retains custom values for a later grant and applies local retrieval when configured', () => {
    const saved = configured()
    if (saved.platform?.desktopDefaults) saved.platform.desktopDefaults.retrievalMode = 'local'
    const effective = applyDesktopDefaults(saved)
    expect(effective.remoteKnowledge.enabled).toBe(false)
    const input = { ...effective, answerStyle: 'detailed' } as SettingsInput
    expect(() => assertAllowedSettings(input, effective)).not.toThrow()
    const preserved = preserveLocalAdvancedSettings(input, saved)
    expect(preserved.llm).toEqual(saved.llm)
    expect(preserved.serviceSelections).toEqual(saved.serviceSelections)
    expect(preserved.answerStyle).toBe('detailed')
    const granted = configured(true)
    expect(routeService(granted, secrets, 'llm').apiKey).toBe('own-key')
    expect(() => requireAdvancedSettings(granted)).not.toThrow()
  })
  it('blocks custom service actions and forged advanced settings while allowing ordinary preferences', () => {
    const effective = applyDesktopDefaults(configured())
    expect(() => requireAdvancedSettings(effective)).toThrow('没有高级模型设置权限')
    expect(() => assertAllowedSettings({ ...effective, llm: { ...effective.llm, temperature: 2 } } as SettingsInput, effective)).toThrow('不能修改')
    expect(() => assertAllowedSettings({ ...effective, asr: { ...effective.asr, apiKey: 'injected' } } as SettingsInput, effective)).toThrow('不能修改')
    expect(() => assertAllowedSettings({ ...effective, serviceSelections: { llm: { source: 'custom', id: 'own' } } } as SettingsInput, effective)).toThrow('不能修改')
    expect(() => assertAllowedSettings({ ...effective, answerStyle: 'detailed', asr: { ...effective.asr, silenceMs: 900 } } as SettingsInput, effective)).not.toThrow()
  })
  it('parses permission fail closed and validates default model configuration', () => {
    const info = { ...configured().platform, user: { id: '1', displayName: 'User' }, limits: { maxAsrSessionSeconds: 100 } }
    expect(platformInfoSchema.parse({ ...info, advancedSettingsEnabled: undefined }).advancedSettingsEnabled).toBe(false)
    expect(platformInfoSchema.safeParse({ ...info, desktopDefaults: { ...info.desktopDefaults, temperature: 3 } }).success).toBe(false)
  })
})
