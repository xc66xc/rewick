import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../src/shared/defaults'
import { customServiceSchema } from '../../src/main/services/custom-service-profiles'
import { referenceExcerptSchema, settingsInputSchema } from '../../src/main/services/validation'
import { applyDesktopDefaults } from '../../src/main/services/advanced-settings'

describe('retrieval contracts after retiring remote knowledge', () => {
  it('does not expose retired settings and rejects retired service/source types', () => {
    expect(defaultSettings).not.toHaveProperty('remoteKnowledge')
    expect(settingsInputSchema.parse(defaultSettings)).not.toHaveProperty('remoteKnowledge')
    expect(customServiceSchema.safeParse({ kind: 'knowledge', name: 'retired', url: 'https://example.test/search', agentId: 'aid-retired' }).success).toBe(false)
    expect(referenceExcerptSchema.safeParse({ source: 'bailian', documentId: 'old', revision: 1, name: 'old', kind: 'technical', chunkId: 'old', text: 'old' }).success).toBe(false)
  })
  it.each([false, true])('keeps explicit reference enablement unchanged for ordinary users (%s)', enabled => {
    if (!defaultSettings.platform) throw new Error('Missing platform defaults in fixture')
    const settings = { ...structuredClone(defaultSettings), retrieval: { enabled }, platform: { ...defaultSettings.platform, enabled: true, authenticated: true, advancedSettingsEnabled: false, desktopDefaults: { version: 1, llmModelId: 'model', temperature: 0, asrServiceId: 'speech' } } }
    const effective = applyDesktopDefaults(settings)
    expect(effective.retrieval.enabled).toBe(enabled)
    expect(effective.serviceSelections).toEqual({ llm: { source: 'platform', id: 'model' }, asr: { source: 'platform', id: 'speech' } })
  })
})
