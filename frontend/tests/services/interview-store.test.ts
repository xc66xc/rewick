import { afterEach, describe, expect, it, vi } from 'vitest'
import { InterviewStore } from '../../src/main/services/interview-store'
import { defaultSettings } from '../../src/shared/defaults'
import type { SettingsStore } from '../../src/main/services/settings-store'
import { environmentInputSchema } from '../../src/main/services/interview-validation'

const environment = { id: '11111111-1111-4111-8111-111111111111', name: '默认环境', interviewType: 'technical', resumeId: null, targetId: null, referenceIds: [], version: 1, createdAt: '2026-09-13T12:00:00+08:00', updatedAt: '2026-09-13T12:00:00+08:00' }
const library = { resumes: [], targets: [], environments: [environment], activeEnvironmentId: environment.id }
function setup() {
  const auth = vi.fn(async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, baseUrl: 'http://localhost:8080', authenticated: true } }, secrets: { platformAccessToken: 'session', asrApiKey: '', llmApiKey: '', remoteKnowledgeApiKey: '' } }))
  return { auth, store: new InterviewStore(auth as unknown as () => ReturnType<SettingsStore['getConnectionSnapshot']>) }
}
afterEach(() => vi.unstubAllGlobals())
describe('server background', () => {
  it.each([undefined, null, 'three_to_five_years'] as const)('preserves omission/clear/value %s in the server payload', async level => {
    const saved = { ...environment, jobExperienceLevel: level, version: 2 }
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        const content = JSON.parse(String(init.body)).content
        if (level === undefined) expect(content).not.toHaveProperty('jobExperienceLevel')
        else expect(content.jobExperienceLevel).toBe(level)
        return Response.json(saved)
      }
      return Response.json({ ...library, environments: [saved] })
    }))
    const { store } = setup()
    const result = await store.saveEnvironment({ ...environment, interviewType: 'technical', ...(level !== undefined ? { jobExperienceLevel: level } : {}) })
    expect(result.environments[0].jobExperienceLevel).toBe(level)
    expect((await store.resolve(defaultSettings)).interviewEnvironment?.jobExperienceLevel).toBe(level)
  })

  it.each([undefined, '', 'hr', null])('rejects invalid interview type %s before save', interviewType => {
    expect(environmentInputSchema.safeParse({ ...environment, interviewType }).success).toBe(false)
  })
  it('saves general interview type and resolves it into the answer context', async () => {
    const saved = { ...environment, interviewType: 'general', version: 2 }
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body)).content.interviewType).toBe('general')
        return Response.json(saved)
      }
      return Response.json({ ...library, environments: [saved] })
    })
    vi.stubGlobal('fetch', fetcher)
    const { store } = setup()
    await store.saveEnvironment({ id: environment.id, version: 1, name: environment.name, interviewType: 'general', resumeId: null, targetId: null, referenceIds: [] })
    expect((await store.resolve(defaultSettings)).interviewEnvironment?.interviewType).toBe('general')
  })
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

describe('environment hotwords', () => {
  it('preserves saved terms through the server library', async () => {
    const saved = { ...environment, hotwords: ['虚拟量测', 'Agent'] }
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body)).content.hotwords).toEqual(saved.hotwords)
        return Response.json(saved)
      }
      return Response.json({ ...library, environments: [saved] })
    }))
    const result = await setup().store.saveEnvironment({ ...saved, interviewType: 'technical' })
    expect(result.environments[0].hotwords).toEqual(saved.hotwords)
  })

  it('extracts terms for an unsaved unnamed draft without sending unrelated fields', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ resumeId: 'resume', targetId: null, referenceIds: [] })
      return Response.json({ hotwords: ['Agent'] })
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await setup().store.extractEnvironmentHotwords({ resumeId: 'resume', targetId: null, referenceIds: [] })
    expect(result).toEqual(['Agent'])
    expect(fetcher.mock.calls[0][0]).toContain('/background/hotwords/extract')
  })

  it('rejects oversized or invalid terms before saving', () => {
    for (const hotwords of [['a'.repeat(81)], ['Agent\nignore'], Array.from({ length: 201 }, (_, index) => String(index))]) {
      expect(environmentInputSchema.safeParse({ ...environment, hotwords }).success).toBe(false)
    }
  })

  it('rejects a term extraction result after an account change', async () => {
    const { store, auth } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => {
      auth.mockRejectedValue(new Error('账户已切换'))
      return Response.json({ hotwords: ['Agent'] })
    }))
    await expect(store.extractEnvironmentHotwords({ resumeId: 'resume', targetId: null, referenceIds: [] })).rejects.toThrow('账户已切换')
  })
})

describe('independent environment stamp mutation', () => {
  const stamp = { text: '一面中', color: 'blue' as const }
  const input = { id: environment.id, version: 1, stamp }
  it('preserves missing/null stamps and never sends stamps through ordinary save', async () => {
    const { store } = setup()
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') { expect(JSON.parse(String(init.body)).content).not.toHaveProperty('stamp'); return Response.json({ ...environment, stamp }) }
      return Response.json({ ...library, environments: [{ ...environment, stamp }] })
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await store.saveEnvironment({ ...environment, stamp } as unknown as Parameters<typeof store.saveEnvironment>[0])
    expect(result.environments[0].stamp).toEqual(stamp)
    expect((await store.resolve(defaultSettings)).interviewEnvironment).not.toHaveProperty('stamp')
  })
  it('retries normalized stamp mutations with the same mutation ID after commit/network failure', async () => {
    const { store } = setup(), bodies: unknown[] = []
    let failed = false
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'GET') return Response.json({ ...library, environments: [{ ...environment, stamp, version: 2 }] })
      expect(url).toMatch(/\/environments\/.+\/stamp$/)
      bodies.push(JSON.parse(String(init.body)))
      if (!failed) { failed = true; throw new Error('network failed after commit') }
      return Response.json({ ...environment, stamp, version: 2 })
    }))
    await expect(store.saveEnvironmentStamp({ ...input, stamp: { ...stamp, text: ' 一面中 ' } })).rejects.toThrow('network failed')
    expect((await store.saveEnvironmentStamp(input)).environments[0].stamp).toEqual(stamp)
    expect(bodies[0]).toEqual(bodies[1])
    expect(bodies[0]).toEqual({ version: 1, mutationId: expect.any(String), stamp })
  })
  it('keeps a fresher library version instead of overwriting with an earlier POST response', async () => {
    const { store } = setup()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => Response.json(init.method === 'GET'
      ? { ...library, environments: [{ ...environment, stamp: { text: '已挂', color: 'red' }, version: 3 }] }
      : { ...environment, stamp, version: 2 })))
    expect((await store.saveEnvironmentStamp(input)).environments[0]).toMatchObject({ version: 3, stamp: { text: '已挂', color: 'red' } })
  })
  it('reports version conflicts and rejects invalid stamp inputs before HTTP', async () => {
    const { store } = setup()
    const fetcher = vi.fn(async () => Response.json({ message: '环境版本冲突' }, { status: 409 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(store.saveEnvironmentStamp({ ...input, version: 0 })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    await expect(store.saveEnvironmentStamp(input)).rejects.toThrow('刷新环境')
  })
  it('does not reuse another account mutation or accept switched-account responses', async () => {
    const { store, auth } = setup(), bodies: { mutationId: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') { bodies.push(JSON.parse(String(init.body))); throw new Error('offline') }
      return Response.json(library)
    }))
    await expect(store.saveEnvironmentStamp(input)).rejects.toThrow('offline')
    const old = await auth()
    auth.mockResolvedValue({ ...old, secrets: { ...old.secrets, platformAccessToken: 'other-token' } })
    await expect(store.saveEnvironmentStamp(input)).rejects.toThrow('offline')
    expect(bodies[0].mutationId).not.toBe(bodies[1].mutationId)
    vi.stubGlobal('fetch', vi.fn(async () => { auth.mockResolvedValue(old); return Response.json({ ...environment, stamp, version: 2 }) }))
    await expect(store.saveEnvironmentStamp(input)).rejects.toThrow('登录状态已变化')
  })
})
