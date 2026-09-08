import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '../../src/shared/defaults'
import type { EnvironmentInput, InterviewLibrary, Settings } from '../../src/shared/types'
import { InterviewStore } from '../../src/main/services/interview-store'
import { environmentInputSchema, environmentSnapshotSchema } from '../../src/main/services/interview-validation'
import * as storage from '../../src/main/services/storage'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'copilot-interviews-')) })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

function setup(settings: Settings = structuredClone(defaultSettings), referenceIds: string[] = []) {
  const seed = vi.fn(async () => ({ settings, referenceIds }))
  return { store: new InterviewStore(directory, seed), seed, settings }
}
function emptyEnvironment(name: string): EnvironmentInput { return { name, resumeId: null, targetId: null, referenceIds: [] } }
function fixture(): InterviewLibrary {
  const timestamp = '2026-09-07T10:00:00.000Z'
  return { resumes: [], targets: [], environments: [{ ...emptyEnvironment('默认环境'), id: 'default', createdAt: timestamp, updatedAt: timestamp }], activeEnvironmentId: 'default' }
}
async function saveFixture(library: InterviewLibrary): Promise<void> {
  await writeFile(join(directory, 'interviews.json'), JSON.stringify({ version: 1, library }, null, 2))
}

describe('InterviewStore', () => {
  it('migrates the old background, target and selected references exactly once without changing other files', async () => {
    const settings = structuredClone(defaultSettings)
    settings.context = { name: '原有简历.pdf', text: '  原有背景正文\n' }
    settings.interviewTarget = { companyName: '示例公司', roleName: '后端工程师', jobDescription: '原有 JD\n' }
    await writeFile(join(directory, 'settings.json'), 'untouched-settings-and-secrets')
    await writeFile(join(directory, 'history.json'), 'untouched-history')
    const { store, seed } = setup(settings, ['ref-one', 'ref-two', 'ref-one'])
    const [first, second, third] = await Promise.all([store.list(), store.list(), store.list()])
    expect(seed).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(first.resumes).toHaveLength(1)
    expect(first.resumes[0]).toMatchObject(settings.context)
    expect(first.targets[0]).toMatchObject(settings.interviewTarget)
    expect(first.environments).toHaveLength(1)
    expect(first.environments[0]).toMatchObject({ id: first.activeEnvironmentId, name: '默认环境', resumeId: first.resumes[0].id, targetId: first.targets[0].id, referenceIds: ['ref-one', 'ref-two'] })
    const mustNotSeed = vi.fn(async () => { throw new Error('must not migrate twice') })
    expect(await new InterviewStore(directory, mustNotSeed).list()).toEqual(first)
    expect(mustNotSeed).not.toHaveBeenCalled()
    expect((await stat(join(directory, 'interviews.json'))).mode & 0o777).toBe(0o600)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe('untouched-settings-and-secrets')
    expect(await readFile(join(directory, 'history.json'), 'utf8')).toBe('untouched-history')
    expect((await readdir(directory)).sort()).toEqual(['history.json', 'interviews.json', 'settings.json'])
  })

  it('creates an empty default environment without inventing resume or target data', async () => {
    const { store } = setup()
    const library = await store.list()
    expect(library.resumes).toEqual([])
    expect(library.targets).toEqual([])
    expect(library.environments[0]).toMatchObject({ ...emptyEnvironment('默认环境'), id: library.activeEnvironmentId })
  })

  it.each([
    { name: '仅保存过名称', text: '', expectedName: '仅保存过名称' },
    { name: '', text: '仅保存过正文', expectedName: '原有简历' },
  ])('preserves a legacy resume with only a name or only text: $expectedName', async ({ name, text, expectedName }) => {
    const settings = structuredClone(defaultSettings)
    settings.context = { name, text }
    const { store } = setup(settings)
    expect((await store.list()).resumes[0]).toMatchObject({ name: expectedName, text })
  })

  it('serializes concurrent edits without losing records and retains stable ids when updating', async () => {
    const { store, seed } = setup()
    await Promise.all([
      store.saveResume({ name: '简历 A', text: '背景 A' }),
      store.saveResume({ name: '简历 B', text: '背景 B' }),
      store.saveTarget({ name: '岗位 A', companyName: '公司 A', roleName: '开发', jobDescription: 'JD A' }),
    ])
    expect(seed).toHaveBeenCalledTimes(1)
    const initial = await store.list()
    expect(initial.resumes.map(resume => resume.name)).toEqual(['简历 A', '简历 B'])
    const original = initial.resumes[0]
    const updated = await store.saveResume({ id: original.id, name: '简历 A 修订', text: '' })
    expect(updated.resumes).toHaveLength(2)
    expect(updated.resumes[0]).toMatchObject({ id: original.id, createdAt: original.createdAt, name: '简历 A 修订', text: '' })
    expect(Date.parse(updated.resumes[0].updatedAt)).toBeGreaterThanOrEqual(Date.parse(original.updatedAt))
    const target = updated.targets[0]
    const afterTarget = await store.saveTarget({ ...target, name: '修订岗位', jobDescription: '修订 JD' })
    expect(afterTarget.targets[0]).toMatchObject({ id: target.id, createdAt: target.createdAt, name: '修订岗位', jobDescription: '修订 JD' })
    const environment = afterTarget.environments[0]
    const afterEnvironment = await store.saveEnvironment({ ...environment, name: '修订环境', resumeId: original.id, targetId: target.id })
    expect(afterEnvironment.environments[0]).toMatchObject({ id: environment.id, createdAt: environment.createdAt, name: '修订环境' })
  })

  it('resolves only the active selections and clears empty choices instead of falling back to old settings', async () => {
    const settings = structuredClone(defaultSettings)
    settings.context = { name: '旧简历', text: '不得回退的背景' }
    settings.interviewTarget = { companyName: '旧公司', roleName: '旧岗位', jobDescription: '不得回退的 JD' }
    const { store } = setup(settings, ['old-reference'])
    const first = await store.list()
    const resumeLibrary = await store.saveResume({ name: '第二份简历', text: '仅第二份背景' })
    const resume = resumeLibrary.resumes[1]
    const targetLibrary = await store.saveTarget({ name: '第二个岗位', companyName: '第二家公司', roleName: '架构师', jobDescription: '仅第二份 JD' })
    const target = targetLibrary.targets[1]
    const added = await store.saveEnvironment({ name: '第二场', resumeId: resume.id, targetId: target.id, referenceIds: ['selected-only', 'selected-only'] })
    const second = added.environments[1]
    await store.activate(second.id)
    const resolved = await store.resolve(settings)
    expect(resolved.context).toEqual({ name: resume.name, text: resume.text })
    expect(resolved.interviewTarget).toEqual({ companyName: target.companyName, roleName: target.roleName, jobDescription: target.jobDescription })
    expect(resolved.interviewEnvironment).toEqual({ id: second.id, name: '第二场', resumeId: resume.id, resumeName: resume.name, targetId: target.id, targetName: target.name, referenceIds: ['selected-only'] })
    expect(resolved.llm).toEqual(settings.llm)
    await store.saveResume({ id: resume.id, name: '后来修订', text: '后来的正文' })
    expect(resolved.context.text).toBe('仅第二份背景')
    expect((await store.resolve(settings)).context.text).toBe('后来的正文')
    const empty = await store.saveEnvironment(emptyEnvironment('空选择'))
    await store.activate(empty.environments[2].id)
    const cleared = await store.resolve(settings)
    expect(cleared.context).toEqual({ name: '', text: '' })
    expect(cleared.interviewTarget).toEqual({ companyName: '', roleName: '', jobDescription: '' })
    expect(cleared.interviewEnvironment).toMatchObject({ resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [] })
    expect(settings.context.text).toBe('不得回退的背景')
    await store.activate(first.activeEnvironmentId)
    expect((await store.resolve(settings)).context).toEqual(settings.context)
  })

  it('rejects deleting profiles used by any environment and names the dependent environments', async () => {
    const settings = structuredClone(defaultSettings)
    settings.context = { name: '简历', text: '正文' }
    settings.interviewTarget = { companyName: '公司', roleName: '岗位', jobDescription: '' }
    const { store } = setup(settings)
    const initial = await store.list()
    const resumeId = initial.resumes[0].id
    const targetId = initial.targets[0].id
    const withSecond = await store.saveEnvironment({ name: '未激活的环境', resumeId, targetId, referenceIds: [] })
    await expect(store.removeResume(resumeId)).rejects.toThrow('未激活的环境')
    await expect(store.removeTarget(targetId)).rejects.toThrow('默认环境')
    await store.saveEnvironment({ ...withSecond.environments[0], resumeId: null, targetId: null })
    await expect(store.removeResume(resumeId)).rejects.toThrow('未激活的环境')
    await store.removeEnvironment(withSecond.environments[1].id)
    expect((await store.removeResume(resumeId)).resumes).toEqual([])
    expect((await store.removeTarget(targetId)).targets).toEqual([])
  })

  it('refuses active-environment deletion and persists an explicit activation across restart', async () => {
    const { store, seed } = setup()
    const initial = await store.list()
    await expect(store.removeEnvironment(initial.activeEnvironmentId)).rejects.toThrow('当前面试环境')
    const next = await store.saveEnvironment(emptyEnvironment('第二场'))
    const secondId = next.environments[1].id
    expect((await store.activate(secondId)).activeEnvironmentId).toBe(secondId)
    const afterDelete = await store.removeEnvironment(initial.activeEnvironmentId)
    expect(afterDelete.environments.map(environment => environment.id)).toEqual([secondId])
    expect((await new InterviewStore(directory, seed).list()).activeEnvironmentId).toBe(secondId)
    await expect(store.activate('missing')).rejects.toThrow('不存在')
    expect((await store.list()).activeEnvironmentId).toBe(secondId)
  })

  it('rejects unknown profile references and update ids without changing saved data', async () => {
    const { store } = setup()
    const initial = await store.list()
    await expect(store.saveEnvironment({ ...emptyEnvironment('无效'), resumeId: 'missing' })).rejects.toThrow('简历已不存在')
    await expect(store.saveEnvironment({ ...emptyEnvironment('无效'), targetId: 'missing' })).rejects.toThrow('目标岗位已不存在')
    await expect(store.saveResume({ id: 'missing', name: '简历', text: '' })).rejects.toThrow('不存在')
    await expect(store.saveTarget({ id: 'missing', name: '岗位', companyName: '', roleName: '', jobDescription: '' })).rejects.toThrow('不存在')
    await expect(store.saveEnvironment({ ...emptyEnvironment('环境'), id: 'missing' })).rejects.toThrow('不存在')
    await expect(store.removeResume('missing')).rejects.toThrow('不存在')
    await expect(store.removeTarget('missing')).rejects.toThrow('不存在')
    await expect(store.removeEnvironment('missing')).rejects.toThrow('不存在')
    expect(await store.list()).toEqual(initial)
  })

  it('allows stale reference ids to remain visible and deduplicates selections without resolving global documents', async () => {
    const { store } = setup()
    const saved = await store.saveEnvironment({ ...emptyEnvironment('待清理的环境'), referenceIds: ['removed-document', 'removed-document', 'available-document'] })
    const environment = saved.environments[1]
    expect(environment.referenceIds).toEqual(['removed-document', 'available-document'])
    await store.activate(environment.id)
    expect((await store.resolve(defaultSettings)).interviewEnvironment?.referenceIds).toEqual(environment.referenceIds)
  })

  it('returns detached libraries and settings that callers cannot mutate on disk', async () => {
    const { store } = setup()
    const library = await store.list()
    const original = structuredClone(library)
    library.environments[0].name = '外部修改'
    library.environments[0].referenceIds.push('injected')
    expect(await store.list()).toEqual(original)
    const resolved = await store.resolve(defaultSettings)
    resolved.llm.model = 'externally-mutated'
    resolved.interviewEnvironment?.referenceIds.push('injected')
    expect((await store.resolve(defaultSettings)).llm.model).toBe(defaultSettings.llm.model)
    expect((await store.resolve(defaultSettings)).interviewEnvironment?.referenceIds).toEqual([])
  })

  it('retries failed initialization and write operations without losing the previous library', async () => {
    const { store, seed } = setup()
    seed.mockRejectedValueOnce(new Error('迁移来源读取失败'))
    await expect(store.list()).rejects.toThrow('迁移来源读取失败')
    expect(await readdir(directory)).toEqual([])
    const initial = await store.list()
    vi.spyOn(storage, 'writeJsonAtomic').mockRejectedValueOnce(new Error('磁盘写入失败'))
    await expect(store.saveResume({ name: '未保存的简历', text: '正文' })).rejects.toThrow('磁盘写入失败')
    expect(await store.list()).toEqual(initial)
    expect((await store.saveResume({ name: '重试成功', text: '正文' })).resumes[0].name).toBe('重试成功')
  })

  it.each(['{broken-json', JSON.stringify({ version: 2, library: fixture() }), JSON.stringify({ version: 1, library: { ...fixture(), activeEnvironmentId: 'missing' } })])('reports a malformed existing file without re-seeding or overwriting it %#', async (contents) => {
    await writeFile(join(directory, 'interviews.json'), contents)
    const { store, seed } = setup()
    await expect(store.list()).rejects.toThrow(/无法解析|格式无效/)
    expect(seed).not.toHaveBeenCalled()
    expect(await readFile(join(directory, 'interviews.json'), 'utf8')).toBe(contents)
  })

  it('rejects dangling persisted profile references and duplicate entity ids', async () => {
    const library = fixture()
    library.environments[0].resumeId = 'missing'
    await saveFixture(library)
    const { store, seed } = setup()
    await expect(store.list()).rejects.toThrow('格式无效')
    library.environments[0].resumeId = null
    library.environments.push({ ...library.environments[0] })
    await saveFixture(library)
    await expect(store.list()).rejects.toThrow('格式无效')
    expect(seed).not.toHaveBeenCalled()
  })

  it('checks the read byte limit before trying to parse an oversized file', async () => {
    const file = await open(join(directory, 'interviews.json'), 'w')
    try { await file.truncate(32 * 1_048_576 + 1) } finally { await file.close() }
    const { store, seed } = setup()
    await expect(store.list()).rejects.toThrow('容量限制')
    expect(seed).not.toHaveBeenCalled()
  })

  it('enforces profile and environment counts without truncating existing lists', async () => {
    const library = fixture()
    const metadata = { createdAt: library.environments[0].createdAt, updatedAt: library.environments[0].updatedAt }
    library.resumes = Array.from({ length: 50 }, (_, index) => ({ ...metadata, id: `resume-${index}`, name: `简历 ${index}`, text: '' }))
    library.targets = Array.from({ length: 50 }, (_, index) => ({ ...metadata, id: `target-${index}`, name: `岗位 ${index}`, companyName: '', roleName: '', jobDescription: '' }))
    library.environments.push(...Array.from({ length: 99 }, (_, index) => ({ ...metadata, ...emptyEnvironment(`环境 ${index}`), id: `env-${index}` })))
    await saveFixture(library)
    const { store } = setup()
    await expect(store.saveResume({ name: '第 51 份', text: '' })).rejects.toThrow('50')
    await expect(store.saveTarget({ name: '第 51 个', companyName: '', roleName: '', jobDescription: '' })).rejects.toThrow('50')
    await expect(store.saveEnvironment(emptyEnvironment('第 101 个'))).rejects.toThrow('100')
    expect(await store.list()).toEqual(library)
  })

  it('validates names, texts and reference counts while retaining the last valid data', async () => {
    const { store } = setup()
    const saved = await store.saveResume({ name: 'a'.repeat(255), text: 'a'.repeat(100_000) })
    await expect(store.saveResume({ name: ' ', text: '' })).rejects.toThrow('名称')
    await expect(store.saveResume({ name: 'a'.repeat(256), text: '' })).rejects.toThrow()
    await expect(store.saveResume({ name: '简历', text: 'a'.repeat(100_001) })).rejects.toThrow()
    await expect(store.saveTarget({ name: '岗位', companyName: '', roleName: '', jobDescription: 'a'.repeat(12_001) })).rejects.toThrow()
    await expect(store.saveEnvironment(emptyEnvironment('a'.repeat(101)))).rejects.toThrow()
    await expect(store.saveEnvironment({ ...emptyEnvironment('过多资料'), referenceIds: Array.from({ length: 31 }, (_, index) => `doc-${index}`) })).rejects.toThrow('30')
    expect(await store.list()).toEqual(saved)
  })

  it('refuses a write above 32 MiB and preserves the complete previous file', async () => {
    const limit = 32 * 1_048_576
    const library = fixture()
    const metadata = { createdAt: library.environments[0].createdAt, updatedAt: library.environments[0].updatedAt }
    library.resumes = Array.from({ length: 50 }, (_, index) => ({ ...metadata, id: `resume-${index}`, name: `简历 ${index}`, text: '\u0000'.repeat(100_000) }))
    library.targets = Array.from({ length: 50 }, (_, index) => ({ ...metadata, id: `target-${index}`, name: `岗位 ${index}`, companyName: '', roleName: '', jobDescription: '\u0000'.repeat(12_000) }))
    const excess = Buffer.byteLength(JSON.stringify({ version: 1, library }, null, 2)) - limit
    library.resumes[0].text = library.resumes[0].text.slice(Math.ceil((excess + 1000) / 6))
    await saveFixture(library)
    const before = await readFile(join(directory, 'interviews.json'), 'utf8')
    expect(Buffer.byteLength(before)).toBeLessThan(limit)
    const { store } = setup()
    await expect(store.saveResume({ ...library.resumes[0], text: '\u0000'.repeat(100_000) })).rejects.toThrow('32 MB')
    expect(await readFile(join(directory, 'interviews.json'), 'utf8')).toBe(before)
  })
})

describe('interview boundary schemas', () => {
  it('deduplicates environment references and accepts historical snapshots of removed profiles', () => {
    const environment = environmentInputSchema.parse({ ...emptyEnvironment('环境'), referenceIds: Array.from({ length: 40 }, () => 'one-document') })
    expect(environment.referenceIds).toEqual(['one-document'])
    const snapshot = { id: 'removed-environment', name: '历史环境', resumeId: 'removed-resume', resumeName: '当时的简历', targetId: 'removed-target', targetName: '当时的岗位', referenceIds: ['removed-document'] }
    expect(environmentSnapshotSchema.parse(snapshot)).toEqual(snapshot)
  })
})
