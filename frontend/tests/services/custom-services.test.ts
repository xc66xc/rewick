import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultSettings } from '../../src/shared/defaults'
import type { PlatformInfo } from '../../src/shared/types'
import { SettingsStore } from '../../src/main/services/settings-store'
import { assertEmbeddingSelection, routeService } from '../../src/main/services/service-routing'
import { PlatformClient, PlatformService } from '../../src/main/services/platform-client'
import { testCustomService } from '../../src/main/services/custom-service-test'

const crypto = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') }
const draft = { name: '我的回答', kind: 'llm' as const, url: 'https://models.example/v1', model: 'own-model', apiKey: 'private-api-key' }
const info: PlatformInfo = { user: { id: '1', displayName: 'u_demo', email: 'demo@example.com' }, capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'fast', asr: 'asr-model', available: [{ id: 'fast', name: '平台快速' }] }, services: { asr: [{ id: 'asr-one', name: '平台语音' }], knowledge: [{ id: 'knowledge-one', name: '平台知识库' }], embedding: [] }, limits: { dailyAnswers: 10, dailyKnowledgeQueries: 10, maxAsrSessionSeconds: 600 } }
let directory: string
let store: SettingsStore
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'copilot-custom-')); store = new SettingsStore(directory, crypto) })
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })

describe('custom service library', () => {
  it('migrates existing keys once and preserves working credentials without exposing them', async () => {
    await store.saveSettings({ ...defaultSettings, llm: { ...defaultSettings.llm, apiKey: 'old-private-key' } })
    await store.initializeServices()
    await store.initializeServices()
    const value = await store.getSettings()
    expect(value.customServices).toHaveLength(1)
    expect(value.serviceSelections?.llm).toEqual({ source: 'custom', id: 'legacy-llm' })
    expect((await store.getSecrets()).llmApiKey).toBe('old-private-key')
    expect(JSON.stringify(value)).not.toContain('old-private-key')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('old-private-key')
  })
  it('migrates keyless local embeddings and removes the legacy secret copy with its profile', async () => {
    await store.saveSettings({ ...defaultSettings, embedding: { ...defaultSettings.embedding, baseUrl: 'http://localhost:11434/v1' }, llm: { ...defaultSettings.llm, apiKey: 'legacy-secret' } })
    await store.initializeServices()
    expect((await store.getSettings()).serviceSelections?.embedding).toEqual({ source: 'custom', id: 'legacy-embedding' })
    await store.removeCustomService('legacy-llm')
    const persisted = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))
    expect(persisted.secrets.llm).toBe('')
    expect(persisted.customServices.some((profile: { id: string }) => profile.id === 'legacy-llm')).toBe(false)
  })
  it('rejects missing or unsupported embedding selections before contacting a legacy endpoint', () => {
    expect(() => assertEmbeddingSelection({ ...defaultSettings, serviceSelections: { embedding: { source: 'custom', id: 'removed' } } })).toThrow('已移除')
    expect(() => assertEmbeddingSelection({ ...defaultSettings, serviceSelections: { embedding: { source: 'platform', id: 'unsupported' } } })).toThrow('已下架')
  })
  it('does not start a draft request after its authentication scope is cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('signed out'))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(testCustomService(store, draft, controller.signal)).rejects.toThrow('signed out')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('saves multiple profiles and selects the matching endpoint and key across restart', async () => {
    await store.saveCustomService(draft)
    const value = await store.saveCustomService({ ...draft, name: '另一模型', model: 'other', apiKey: 'other-private-key' })
    const restarted = new SettingsStore(directory, crypto)
    expect(value.customServices).toHaveLength(2)
    expect((await restarted.getConnectionSnapshot()).settings.llm.model).toBe('other')
    expect((await restarted.getSecrets()).llmApiKey).toBe('other-private-key')
    expect(JSON.stringify(value)).not.toContain('private-key')
  })
  it('tests an unsaved draft without changing files, selection or credentials', async () => {
    await store.saveCustomService(draft)
    const before = await readFile(join(directory, 'settings.json'), 'utf8')
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetcher)
    await testCustomService(store, { ...draft, model: 'draft-model', apiKey: 'draft-key' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('draft-model')
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer draft-key')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(before)
  })
  it('requires reentering the key when editing a profile URL, including for tests', async () => {
    const saved = await store.saveCustomService(draft)
    const profile = saved.customServices?.[0]
    const changed = { ...draft, id: profile?.id, url: 'https://different.example/v1', apiKey: undefined }
    await expect(store.saveCustomService(changed)).rejects.toThrow('重新填写')
    await expect(store.customServiceConnection(changed)).rejects.toThrow('重新填写')
    expect((await store.getSecrets()).llmApiKey).toBe(draft.apiKey)
  })
  it('never falls back to a platform when the selected custom profile is removed', async () => {
    const saved = await store.saveCustomService(draft)
    const id = saved.customServices?.[0].id ?? ''
    await store.removeCustomService(id)
    const snapshot = await store.getConnectionSnapshot()
    expect(snapshot.secrets.llmApiKey).toBe('')
    expect(() => routeService(snapshot.settings, snapshot.secrets, 'llm')).toThrow('已移除')
  })
  it('honors explicit platform choices even with an existing custom key and binds service IDs', async () => {
    await store.initializeServices()
    await store.saveCustomService(draft)
    await store.savePlatformSession('http://127.0.0.1:8080', 'business-token', new Date(Date.now() + 60000).toISOString(), info)
    await store.saveSettings({ ...await store.getSettings(), serviceSelections: { llm: { source: 'platform', id: 'fast' }, asr: { source: 'platform', id: 'asr-one' }, knowledge: { source: 'platform', id: 'knowledge-one' } } })
    const { settings, secrets } = await store.getConnectionSnapshot()
    expect(routeService(settings, secrets, 'llm')).toMatchObject({ platform: true, apiKey: 'business-token', settings: { llm: { model: 'fast' } } })
    expect(routeService(settings, secrets, 'asr').settings.asr.url).toContain('serviceId=asr-one')
    expect(routeService(settings, secrets, 'knowledge').settings.remoteKnowledge.serviceId).toBe('knowledge-one')
    expect(secrets.llmApiKey).toBe('')
  })
  it('rejects stale platform service selection instead of using a newly published binding', async () => {
    await store.initializeServices()
    await store.savePlatformSession('http://127.0.0.1:8080', 'business-token', new Date(Date.now() + 60000).toISOString(), info)
    await store.saveSettings({ ...await store.getSettings(), serviceSelections: { asr: { source: 'platform', id: 'retired' } } })
    const snapshot = await store.getConnectionSnapshot()
    expect(() => routeService(snapshot.settings, snapshot.secrets, 'asr')).toThrow('已下架')
  })
})

describe('email client', () => {
  it('normalizes email, registers, then fetches public account info without persisting password or code', async () => {
    await store.initializeServices()
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'new-token', expiresAt: new Date(Date.now() + 60000).toISOString(), user: info.user })).mockResolvedValueOnce(Response.json(info))
    vi.stubGlobal('fetch', fetcher)
    const saved = await new PlatformService(store).register({ email: 'Demo@Example.com ', password: 'a-private-password', code: '123456' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body).email).toBe('demo@example.com')
    expect(saved.platform?.user?.email).toBe('demo@example.com')
    const raw = await readFile(join(directory, 'settings.json'), 'utf8')
    expect(raw).not.toContain('a-private-password')
    expect(raw).not.toContain('123456')
  })
  it('returns resend timing and reports unconfigured mail without leaking supplier errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ retryAfterSeconds: 60, expiresInSeconds: 600 })).mockResolvedValueOnce(Response.json({ message: 'smtp-password-secret' }, { status: 503 })))
    const client = new PlatformClient('https://platform.example')
    expect(await client.emailCode({ email: 'demo@example.com' })).toEqual({ retryAfterSeconds: 60, expiresInSeconds: 600 })
    await expect(client.emailCode({ email: 'demo@example.com' })).rejects.toThrow('邮件服务配置')
  })
})
