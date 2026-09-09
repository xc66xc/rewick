import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '../../src/shared/defaults'
import type { ModelInputSnapshot, SessionRecord, SettingsInput } from '../../src/shared/types'
import { SettingsStore } from '../../src/main/services/settings-store'
import { HistoryStore, sessionToMarkdown } from '../../src/main/services/history-store'
import * as storage from '../../src/main/services/storage'

const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value.split('').reverse().join('')}`),
  decryptString: (value: Buffer) => value.toString().slice('encrypted:'.length).split('').reverse().join(''),
}
function input(): SettingsInput { return structuredClone(defaultSettings) }
function record(index = 0): SessionRecord {
  return { id: `session-${index}`, title: `面试 ${index}`, createdAt: new Date(1_700_000_000_000 + index * 1000).toISOString(), segments: [], answers: [] }
}
let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'copilot-stores-')) })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

describe('SettingsStore', () => {
  it('persists encrypted keys across restarts without returning secrets to the renderer', async () => {
    const store = new SettingsStore(directory, crypto)
    expect(await store.getSettings()).toEqual(defaultSettings)
    const config = input()
    config.asr.apiKey = 'test-asr-secret'
    config.llm.apiKey = 'test-llm-secret'
    config.embedding.apiKey = 'test-embedding-secret'
    config.remoteKnowledge = { enabled: true, url: 'https://workspace.example/api/v1/indices/knowledge/search', agentId: 'aid-test', apiKey: 'test-remote-secret' }
    config.interviewTarget = { companyName: '示例公司', roleName: '开发工程师', jobDescription: '需要 Redis 经验' }
    config.autoAnswer = { enabled: false, pauseMs: 2500 }
    const visible = await store.saveSettings(config)
    expect(visible.asr.hasApiKey).toBe(true)
    expect(JSON.stringify(visible)).not.toContain('test-asr-secret')
    expect(JSON.stringify(visible)).not.toContain('apiKey')
    const persisted = await readFile(join(directory, 'settings.json'), 'utf8')
    expect(persisted).not.toContain('test-asr-secret')
    expect(persisted).not.toContain('test-llm-secret')
    expect(persisted).not.toContain('test-embedding-secret')
    expect(persisted).not.toContain('test-remote-secret')
    expect(visible.remoteKnowledge).toEqual({ enabled: true, url: config.remoteKnowledge.url, agentId: 'aid-test', hasApiKey: true })
    expect(await new SettingsStore(directory, crypto).getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'test-asr-secret', llmApiKey: 'test-llm-secret', embeddingApiKey: 'test-embedding-secret', remoteKnowledgeApiKey: 'test-remote-secret' })
    expect((await new SettingsStore(directory, crypto).getSettings()).interviewTarget).toEqual(config.interviewTarget)
    expect((await new SettingsStore(directory, crypto).getSettings()).autoAnswer).toEqual({ enabled: false, pauseMs: 2500 })
    expect((await stat(join(directory, 'settings.json'))).mode & 0o777).toBe(0o600)
    expect(await readdir(directory)).toEqual(['settings.json'])
  })

  it('retains omitted keys and clears explicitly empty keys', async () => {
    const store = new SettingsStore(directory, crypto)
    const config = input()
    config.asr.apiKey = 'first-secret'
    config.llm.apiKey = 'second-secret'
    await store.saveSettings(config)
    const update = input()
    update.context.text = '后端工程师'
    update.llm.apiKey = ''
    await store.saveSettings(update)
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'first-secret', llmApiKey: '', embeddingApiKey: '', remoteKnowledgeApiKey: '' })
    expect((await store.getSettings()).context.text).toBe('后端工程师')
  })

  it('serializes concurrent changes without losing an omitted secret', async () => {
    const store = new SettingsStore(directory, crypto)
    const first = input()
    first.asr.apiKey = 'retained-secret'
    await Promise.all([store.saveSettings(first), ...Array.from({ length: 8 }, (_, i) => {
      const next = input()
      next.context.text = String(i)
      return store.saveSettings(next)
    })])
    expect((await store.getSecrets()).asrApiKey).toBe('retained-secret')
    expect((await store.getSettings()).context.text).toBe('7')
  })

  it('loads legacy settings without losing the resume or encrypted credentials', async () => {
    const { interviewTarget: _target, embedding: _embedding, retrieval: _retrieval, remoteKnowledge: _remote, ...legacy } = input()
    legacy.context.text = '旧版个人背景保持原样'
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ version: 1, settings: legacy,
      secrets: { asr: crypto.encryptString('legacy-asr').toString('base64'), llm: crypto.encryptString('legacy-llm').toString('base64') } }))
    const store = new SettingsStore(directory, crypto)
    const loaded = await store.getSettings()
    expect(loaded.context.text).toBe(legacy.context.text)
    expect(loaded.interviewTarget).toEqual(defaultSettings.interviewTarget)
    expect(loaded.retrieval.enabled).toBe(false)
    expect(loaded.embedding.hasApiKey).toBe(false)
    expect(loaded.remoteKnowledge).toEqual(defaultSettings.remoteKnowledge)
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'legacy-asr', llmApiKey: 'legacy-llm', embeddingApiKey: '', remoteKnowledgeApiKey: '' })
  })

  it('migrates 0.3.0 settings read-only with the remote service off and existing data untouched', async () => {
    const { remoteKnowledge: _remote, ...legacy } = input()
    const content = JSON.stringify({ version: 1, settings: legacy, secrets: { asr: '', llm: '', embedding: '' } })
    await writeFile(join(directory, 'settings.json'), content)
    const loaded = await new SettingsStore(directory, crypto).getSettings()
    expect(loaded.remoteKnowledge).toEqual(defaultSettings.remoteKnowledge)
    expect(loaded.interviewTarget).toEqual(legacy.interviewTarget)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(content)
  })

  it('retains a remote key across edits and allows explicit clearing only after the service is off', async () => {
    const store = new SettingsStore(directory, crypto)
    await store.saveSettings({ ...input(), remoteKnowledge: { enabled: true, url: 'https://workspace.example/search', agentId: 'aid-one', apiKey: 'independent-key' } })
    const update = await store.getSettings()
    update.remoteKnowledge.agentId = 'aid-two'
    await store.saveSettings(update)
    expect((await store.getSecrets()).remoteKnowledgeApiKey).toBe('independent-key')
    await expect(store.saveSettings({ ...update, remoteKnowledge: { ...update.remoteKnowledge, apiKey: '' } })).rejects.toThrow('API Key')
    expect((await store.getSettings()).remoteKnowledge.enabled).toBe(true)
    await store.saveSettings({ ...update, remoteKnowledge: { ...update.remoteKnowledge, enabled: false, apiKey: '' } })
    expect((await store.getSecrets()).remoteKnowledgeApiKey).toBe('')
    expect((await store.getSettings()).remoteKnowledge.hasApiKey).toBe(false)
  })

  it.each([
    { enabled: true, url: '', agentId: 'aid-one' },
    { enabled: true, url: 'https://workspace.example/search', agentId: '' },
    { enabled: true, url: 'https://workspace.example/search', agentId: 'aid-one' },
    { enabled: false, url: 'ftp://workspace.example/search', agentId: '' },
    { enabled: false, url: 'https://user:secret@workspace.example/search', agentId: '' },
    { enabled: false, url: 'https://{workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search', agentId: '' },
  ])('rejects incomplete or unsafe remote settings without replacing existing data %#', async remoteKnowledge => {
    const store = new SettingsStore(directory, crypto)
    await store.saveSettings(input())
    const before = await readFile(join(directory, 'settings.json'), 'utf8')
    await expect(store.saveSettings({ ...input(), remoteKnowledge })).rejects.toThrow()
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(before)
  })

  it('does not expose a plaintext remote key injected into the settings file', async () => {
    const config = input()
    config.remoteKnowledge.apiKey = 'injected-plaintext-secret'
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ version: 1, settings: config, secrets: { asr: '', llm: '', embedding: '', remoteKnowledge: '' } }))
    const store = new SettingsStore(directory, crypto)
    expect(JSON.stringify(await store.getSettings())).not.toContain('injected-plaintext-secret')
    expect((await store.getSecrets()).remoteKnowledgeApiKey).toBe('')
  })

  it('keeps an in-flight endpoint paired with its original key while settings change', async () => {
    const store = new SettingsStore(directory, crypto)
    const first = { ...input(), remoteKnowledge: { enabled: true, url: 'https://first.example/search', agentId: 'aid-first', apiKey: 'first-remote-key' } }
    const second = { ...input(), remoteKnowledge: { enabled: true, url: 'https://second.example/search', agentId: 'aid-second', apiKey: 'second-remote-key' } }
    await store.saveSettings(first)
    const pendingSnapshot = store.getConnectionSnapshot()
    const pendingSave = store.saveSettings(second)
    const [snapshot] = await Promise.all([pendingSnapshot, pendingSave])
    expect(snapshot.settings.remoteKnowledge.url).toBe(first.remoteKnowledge.url)
    expect(snapshot.secrets.remoteKnowledgeApiKey).toBe(first.remoteKnowledge.apiKey)
    expect((await store.getConnectionSnapshot()).secrets.remoteKnowledgeApiKey).toBe(second.remoteKnowledge.apiKey)
    expect((await store.getSettings()).remoteKnowledge.url).toBe(second.remoteKnowledge.url)
  })

  it('rejects an oversized JD and unsafe embedding endpoint without overwriting a saved target', async () => {
    const store = new SettingsStore(directory, crypto)
    const saved = input()
    saved.interviewTarget = { companyName: '原公司', roleName: '原岗位', jobDescription: '原 JD' }
    await store.saveSettings(saved)
    await expect(store.saveSettings({ ...saved, interviewTarget: { ...saved.interviewTarget, jobDescription: '字'.repeat(12001) } })).rejects.toThrow('配置或输入无效')
    await expect(store.saveSettings({ ...saved, embedding: { ...saved.embedding, baseUrl: 'ftp://remote.example/v1' } })).rejects.toThrow('HTTPS')
    expect((await store.getSettings()).interviewTarget).toEqual(saved.interviewTarget)
  })

  it('does not write a key when secure storage is unavailable', async () => {
    const store = new SettingsStore(directory, { ...crypto, isEncryptionAvailable: () => false })
    const config = input()
    config.asr.apiKey = 'should-not-save'
    await expect(store.saveSettings(config)).rejects.toThrow('系统安全存储不可用')
    expect(await readdir(directory)).toEqual([])
    await expect(store.saveSettings(input())).resolves.toEqual(defaultSettings)
  })

  it.each(['ftp://api.example.com/v1', 'https://user:secret@example.com/v1', 'file:///tmp/model'])('rejects unsafe model endpoint %s without changing saved settings', async (baseUrl) => {
    const store = new SettingsStore(directory, crypto)
    await store.saveSettings(input())
    const config = input()
    config.llm.baseUrl = baseUrl
    await expect(store.saveSettings(config)).rejects.toThrow('配置或输入无效')
    expect(await store.getSettings()).toEqual(defaultSettings)
  })

  it.each(['http://api.example.com/v1', 'http://localhost.evil.example/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:8080/v1', 'http://[::1]:8000/v1'])('allows HTTP endpoint %s', async (baseUrl) => {
    const store = new SettingsStore(directory, crypto)
    const config = input()
    config.llm.baseUrl = baseUrl
    expect((await store.saveSettings(config)).llm.baseUrl).toBe(baseUrl)
  })
})

describe('HistoryStore', () => {
  it('preserves history on a failed deletion write and does not suppress later saves or retries', async () => {
    const store = new HistoryStore(directory)
    const session = record(1)
    await store.save(session)
    const write = vi.spyOn(storage, 'writeJsonAtomic').mockRejectedValueOnce(new Error('模拟磁盘错误'))
    await expect(store.remove(session.id)).rejects.toThrow('模拟磁盘错误')
    expect(await store.list()).toEqual([session])
    write.mockRestore()
    const changed = { ...session, title: '删除失败后继续保存' }
    await store.save(changed)
    expect(await store.list()).toEqual([changed])
    await store.remove(session.id)
    expect(await store.list()).toEqual([])
  })

  it('removes only the selected session and keeps that deletion after restart', async () => {
    const store = new HistoryStore(directory)
    await store.save(record(1))
    await store.save(record(2))
    await store.remove(record(1).id)
    expect(await store.list()).toEqual([record(2)])
    expect(await new HistoryStore(directory).list()).toEqual([record(2)])
    await store.remove(record(1).id)
    await store.remove(record(2).id)
    expect(await new HistoryStore(directory).list()).toEqual([])
  })

  it('serializes deletion with queued autosaves and ignores late saves of a deleted id', async () => {
    const store = new HistoryStore(directory)
    const deleted = record(1)
    await store.save(deleted)
    await Promise.all([store.save({ ...deleted, title: '排队中的自动保存' }), store.remove(deleted.id),
      store.save({ ...deleted, title: '迟到的自动保存' }), store.save(record(2))])
    expect(await store.list()).toEqual([record(2)])
    await store.save(deleted)
    expect(await new HistoryStore(directory).list()).toEqual([record(2)])
  })

  it.each(['', 'x'.repeat(129), null, { id: 'session-1' }])('rejects invalid deletion identifiers without changing saved history %#', async id => {
    const store = new HistoryStore(directory)
    await store.save(record(1))
    await expect(store.remove(id)).rejects.toThrow()
    expect(await store.list()).toEqual([record(1)])
    await store.remove(record(1).id)
    expect(await store.list()).toEqual([])
  })

  it('keeps the newest 50 records and replaces an existing session', async () => {
    const store = new HistoryStore(directory)
    await Promise.all(Array.from({ length: 53 }, (_, i) => store.save(record(i))))
    const records = await store.list()
    expect(records).toHaveLength(50)
    expect(records[0].id).toBe('session-52')
    expect(records.at(-1)?.id).toBe('session-3')
    await store.save({ ...record(52), title: '更新后' })
    expect((await new HistoryStore(directory).list())[0].title).toBe('更新后')
    expect(await readdir(directory)).toEqual(['history.json'])
  })

  it('rejects invalid timeline and oversized sessions', async () => {
    const store = new HistoryStore(directory)
    const session = record()
    session.segments = [{ id: 's1', text: '你好', startMs: 100, endMs: 50, isFinal: true }]
    await expect(store.save(session)).rejects.toThrow('结束时间')
    session.segments = Array.from({ length: 150 }, (_, index) => ({ id: String(index), text: '字'.repeat(10_000), startMs: 0, isFinal: true }))
    await expect(store.save(session)).rejects.toThrow('4 MB')
    expect(await store.list()).toEqual([])
  })

  it('exports readable timestamps and preserves incomplete response state', () => {
    const session = record()
    session.segments = [{ id: 's1', text: '介绍一下缓存', startMs: 65_000, isFinal: false }]
    session.answers = [{ id: 'a1', question: '如何设计缓存？', text: '- 考虑一致性', createdAt: session.createdAt, status: 'cancelled' }]
    const markdown = sessionToMarkdown(session)
    expect(markdown).toContain('[01:05]（未定稿）')
    expect(markdown).toContain('### 如何设计缓存？')
    expect(markdown).toContain('- 考虑一致性')
    expect(markdown).toContain('状态：已停止')
  })

  it('preserves manually edited text and its flag across restart and Markdown export', async () => {
    const store = new HistoryStore(directory)
    const session = record()
    session.segments = [
      { id: 'edited', text: '如何使用 Redis？', startMs: 0, endMs: 1500, isFinal: true, isEdited: true },
      { id: 'cleared', text: '', startMs: 1600, endMs: 1700, isFinal: true, isEdited: true },
      { id: 'original', text: '下一道问题', startMs: 1800, isFinal: false },
    ]
    await store.save(session)
    const reloaded = (await new HistoryStore(directory).list())[0]
    expect(reloaded.segments).toEqual(session.segments)
    expect(reloaded.segments[1]).toMatchObject({ text: '', isEdited: true })
    const exported = sessionToMarkdown(reloaded)
    expect(exported).toContain('如何使用 Redis？')
    expect(exported).toContain('下一道问题')
    expect(exported).not.toContain('undefined')
    expect(exported).not.toContain('null')
  })

  it('retains target and reference snapshots across restart and export', async () => {
    const session = record()
    session.answers = [{ id: 'answer', question: '缓存？', text: '我会先考虑一致性。', createdAt: session.createdAt, status: 'complete',
      interviewTarget: { companyName: '历史公司', roleName: '后端', jobDescription: '关注高并发' },
      retrieval: { status: 'ready', excerpts: [{ documentId: 'removed-file', revision: 2, name: '缓存.pdf', kind: 'technical', chunkId: 'chunk-2', text: '先更新数据库，再删除缓存。', pageStart: 2, pageEnd: 3 }] } }]
    await new HistoryStore(directory).save(session)
    const loaded = (await new HistoryStore(directory).list())[0]
    expect(loaded.answers).toEqual(session.answers)
    const markdown = sessionToMarkdown(loaded)
    expect(markdown).toContain('历史公司')
    expect(markdown).toContain('关注高并发')
    expect(markdown).toContain('第 2–3 页')
    expect(markdown).toContain('先更新数据库，再删除缓存。')
  })

  it('preserves remote source and agent snapshots across restart and exports without inventing document versions', async () => {
    const session = record()
    session.answers = [{ id: 'remote-answer', question: '如何设置缓存？', text: '我会先明确一致性要求。', createdAt: session.createdAt, status: 'complete',
      retrieval: { status: 'ready', remote: { agentId: 'aid-historical', status: 'ready' }, excerpts: [
        { source: 'bailian', documentId: 'bailian-doc', chunkId: 'bailian-chunk', revision: 1, kind: 'technical', name: '远程缓存资料', text: '历史远程片段', pageStart: 210 },
        { documentId: 'local-doc', chunkId: 'local-chunk', revision: 3, kind: 'personal', name: '本地项目', text: '历史项目片段' },
      ] }, modelInput: { model: 'test', messages: [{ role: 'user', content: '实际发送的历史远程片段' }] } }]
    await new HistoryStore(directory).save(session)
    const restored = (await new HistoryStore(directory).list())[0]
    expect(restored.answers).toEqual(session.answers)
    const exported = sessionToMarkdown(restored)
    expect(exported).toContain('百炼远程知识库 · Agent ID：aid-historical')
    expect(exported).toContain('远程缓存资料 · 百炼远程知识库 · 第 210 页')
    expect(exported).not.toContain('远程缓存资料 · 版本 1')
    expect(exported).toContain('本地项目 · 版本 3')
  })

  it('round-trips actual model input alongside legacy answers without inventing old snapshots', async () => {
    const session = record()
    const legacy = { id: 'legacy-answer', question: '旧问题', text: '旧回答', createdAt: session.createdAt, status: 'complete' as const }
    await writeFile(join(directory, 'history.json'), JSON.stringify([{ ...session, answers: [legacy] }]))
    const store = new HistoryStore(directory)
    const loadedLegacy = (await store.list())[0]
    expect(loadedLegacy.answers).toEqual([legacy])
    expect(loadedLegacy.answers[0]).not.toHaveProperty('modelInput')

    const modelInput: ModelInputSnapshot = { model: 'custom-model', messages: [
      { role: 'system', content: '只输出回答正文。\n保留换行和 Unicode。' },
      { role: 'user', content: JSON.stringify({ question: '如何处理 "引号" 和 \\ ？', personalContext: '生成时的简历', interviewTarget: { jobDescription: '生成时的 JD' }, referenceContext: [{ text: '生成时的参考资料' }] }) },
    ] }
    loadedLegacy.answers.push({ id: 'new-answer', question: '新问题', text: '部分回答', createdAt: session.createdAt, status: 'cancelled', modelInput })
    await store.save(loadedLegacy)
    const reloaded = (await new HistoryStore(directory).list())[0]
    expect(reloaded.answers).toEqual(loadedLegacy.answers)
    expect(reloaded.answers[0]).not.toHaveProperty('modelInput')
    expect(reloaded.answers[1].modelInput).toEqual(modelInput)
  })

  it('preserves the full allowed message length without truncating model input', async () => {
    const session = record()
    const content = `${'a'.repeat(1_499_997)}END`
    session.answers = [{ id: 'answer', question: '问题', text: '', createdAt: session.createdAt, status: 'error',
      modelInput: { model: 'custom-model', messages: [{ role: 'system', content: '回答问题' }, { role: 'user', content }] } }]
    await new HistoryStore(directory).save(session)
    const loaded = (await new HistoryStore(directory).list())[0]
    expect(loaded.answers[0].modelInput?.messages[1].content).toBe(content)
  })

  it.each([
    { model: 'm'.repeat(201), messages: [{ role: 'user' as const, content: '问题' }] },
    { model: 'model', messages: Array.from({ length: 3 }, () => ({ role: 'user' as const, content: '问题' })) },
    { model: 'model', messages: [{ role: 'user' as const, content: 'a'.repeat(1_500_001) }] },
  ])('rejects an out-of-bounds model input without changing saved history %#', async (modelInput) => {
    const store = new HistoryStore(directory)
    const saved = record()
    await store.save(saved)
    const invalid = record(1)
    invalid.answers = [{ id: 'answer', question: '问题', text: '', createdAt: invalid.createdAt, status: 'complete', modelInput }]
    await expect(store.save(invalid)).rejects.toThrow()
    expect(await new HistoryStore(directory).list()).toEqual([saved])
  })

  it('rejects model input that exceeds the session byte budget instead of truncating or overwriting history', async () => {
    const store = new HistoryStore(directory)
    const saved = record()
    await store.save(saved)
    const before = await readFile(join(directory, 'history.json'), 'utf8')
    const oversized = { ...saved, answers: [{ id: 'answer', question: '问题', text: '', createdAt: saved.createdAt, status: 'complete' as const,
      modelInput: { model: 'model', messages: [{ role: 'user' as const, content: '字'.repeat(1_450_000) }] } }] }
    await expect(store.save(oversized)).rejects.toThrow('4 MB')
    expect(await readFile(join(directory, 'history.json'), 'utf8')).toBe(before)
    expect(await new HistoryStore(directory).list()).toEqual([saved])
  })
})
