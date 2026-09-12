import { afterEach, describe, expect, it, vi } from 'vitest'
import { InterviewStore } from '../../src/main/services/interview-store'
import { defaultSettings } from '../../src/shared/defaults'
import type { SettingsStore } from '../../src/main/services/settings-store'

const environment = { id: '11111111-1111-4111-8111-111111111111', name: '默认环境', resumeId: null, targetId: null, referenceIds: [], version: 1, createdAt: '2026-09-13T12:00:00+08:00', updatedAt: '2026-09-13T12:00:00+08:00' }
const library = { resumes: [], targets: [], environments: [environment], activeEnvironmentId: environment.id }
function setup() {
  const auth = vi.fn(async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, baseUrl: 'http://localhost:8080', authenticated: true } }, secrets: { platformAccessToken: 'session', asrApiKey: '', llmApiKey: '', remoteKnowledgeApiKey: '' } }))
  return { auth, store: new InterviewStore(auth as unknown as () => ReturnType<SettingsStore['getConnectionSnapshot']>) }
}
afterEach(() => vi.unstubAllGlobals())
describe('server background', () => {
  it('reads the authenticated server library without creating or seeding local records', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(library)); vi.stubGlobal('fetch', fetcher)
    expect(await setup().store.list()).toEqual(library)
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer session')
  })
  it('retries a failed creation with the same ID and mutation and preserves the draft', async () => {
    const { store } = setup()
    const bodies: unknown[] = []
    let saved: Record<string, unknown> | undefined
    let failed = false
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'GET') return Response.json({ ...library, resumes: saved ? [saved] : [] })
      const body = JSON.parse(options.body as string); bodies.push(body)
      saved = { ...body.content, id: url.split('/').at(-1), version: 1, createdAt: environment.createdAt, updatedAt: environment.updatedAt }
      if (!failed) { failed = true; throw new Error('network lost after commit') }
      return Response.json(saved)
    })
    vi.stubGlobal('fetch', fetcher)
    const input = { name: 'Java 简历', text: '我负责后端开发' }
    await expect(store.saveResume(input)).rejects.toThrow('network lost')
    expect((await store.saveResume(input)).resumes[0].text).toBe(input.text)
    expect(bodies[0]).toEqual(bodies[1]); expect(input).not.toHaveProperty('id')
  })
  it('retains version conflicts as explicit errors instead of overwriting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: '资料已被其他设备修改' }, { status: 409 })))
    await expect(setup().store.saveResume({ id: environment.id, version: 1, name: '简历', text: '草稿' })).rejects.toThrow('其他设备')
  })
  it('rejects a response after the account is switched', async () => {
    const { store, auth } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => { auth.mockRejectedValue(new Error('账户已切换')); return Response.json(library) }))
    await expect(store.list()).rejects.toThrow('账户已切换')
  })
})
