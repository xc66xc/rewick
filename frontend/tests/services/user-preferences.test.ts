import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings, SettingsInput } from '../../src/shared/types'
import type { SettingsStore } from '../../src/main/services/settings-store'
import { UserPreferencesClient } from '../../src/main/services/user-preferences'
const state = { version: 0, preferences: { answerStyle: 'detailed', temperature: 0.8, silenceMs: 900, autoAnswer: { enabled: false, pauseMs: 2000 }, retrievalEnabled: true, remoteKnowledgeEnabled: false,
  platformSelections: { llm: 'platform-model', asr: 'platform-asr', knowledge: null } }, unavailableSelections: [] }
function setup() {
  const auth = vi.fn(async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, authenticated: true, baseUrl: 'http://localhost:8080' } }, secrets: { platformAccessToken: 'token', asrApiKey: '', llmApiKey: '', remoteKnowledgeApiKey: '' } }))
  const client = new UserPreferencesClient(auth as unknown as () => ReturnType<SettingsStore['getConnectionSnapshot']>)
  return { client, auth }
}
afterEach(() => vi.unstubAllGlobals())
describe('cloud user preferences', () => {
  it('shares platform selections across devices while preserving a local custom override', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(state)))
    const local: Settings = { ...defaultSettings, serviceSelections: { llm: { source: 'custom', id: 'my-private-profile' } } }
    const own = await setup().client.merge(local)
    const other = await setup().client.merge(defaultSettings)
    expect(own.serviceSelections?.llm).toEqual(local.serviceSelections?.llm)
    expect(other.serviceSelections?.llm).toEqual({ source: 'platform', id: 'platform-model' })
    expect(other.answerStyle).toBe('detailed')
    expect(other.asr.silenceMs).toBe(900)
  })
  it('uploads only preference fields, never custom identifiers, endpoints or keys', async () => {
    const fetcher = vi.fn(async () => Response.json(state)); vi.stubGlobal('fetch', fetcher)
    const { client } = setup()
    const config = await client.merge({ ...defaultSettings, serviceSelections: { llm: { source: 'custom', id: 'private-profile' } } })
    await client.save({ ...config, llm: { ...config.llm, baseUrl: 'https://private.example', apiKey: 'private-key' } } as SettingsInput)
    const body = String((fetcher.mock.calls as unknown as [string, RequestInit][])[1][1].body)
    expect(body).not.toContain('private')
    expect(JSON.parse(body).preferences.platformSelections.llm).toBe('platform-model')
    expect(JSON.parse(body)).not.toHaveProperty('context')
  })
  it('retains the original mutation on an uncertain response and surfaces version conflicts', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(state)).mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce(Response.json({ ...state, version: 1 })).mockResolvedValueOnce(Response.json({}, { status: 409 }))
    vi.stubGlobal('fetch', fetcher)
    const { client } = setup(); const input = await client.merge(defaultSettings) as SettingsInput
    await expect(client.save(input)).rejects.toThrow('network lost')
    await client.save(input)
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body)
    await expect(client.save({ ...input, answerStyle: 'concise' })).rejects.toThrow('其他设备')
  })
  it('keeps an unavailable service identity so the UI requires explicit reselection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...state, unavailableSelections: ['llm'] })))
    const merged = await setup().client.merge(defaultSettings)
    expect(merged.serviceSelections?.llm?.id).toBe('platform-model')
    expect(merged.unavailablePlatformSelections?.llm).toBe('platform-model')
  })
  it('rejects responses received after switching accounts', async () => {
    const { client, auth } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => { auth.mockRejectedValue(new Error('账户已切换')); return Response.json(state) }))
    await expect(client.load()).rejects.toThrow('账户已切换')
  })
})
