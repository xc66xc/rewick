import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '../../src/shared/defaults'
import type { SessionRecord, SettingsInput } from '../../src/shared/types'
import { SettingsStore } from '../../src/main/services/settings-store'
import { sessionToMarkdown } from '../../src/main/services/history-store'

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
    expect(persisted).not.toContain('test-remote-secret')
    expect(visible.remoteKnowledge).toEqual({ enabled: true, url: config.remoteKnowledge.url, agentId: 'aid-test', hasApiKey: true })
    expect(await new SettingsStore(directory, crypto).getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'test-asr-secret', llmApiKey: 'test-llm-secret', remoteKnowledgeApiKey: 'test-remote-secret' })
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
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'first-secret', llmApiKey: '', remoteKnowledgeApiKey: '' })
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
    const { interviewTarget: _target, retrieval: _retrieval, remoteKnowledge: _remote, ...legacy } = input()
    legacy.context.text = '旧版个人背景保持原样'
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ version: 1, settings: legacy,
      secrets: { asr: crypto.encryptString('legacy-asr').toString('base64'), llm: crypto.encryptString('legacy-llm').toString('base64') } }))
    const store = new SettingsStore(directory, crypto)
    const loaded = await store.getSettings()
    expect(loaded.context.text).toBe(legacy.context.text)
    expect(loaded.interviewTarget).toEqual(defaultSettings.interviewTarget)
    expect(loaded.retrieval.enabled).toBe(false)
    expect(loaded.remoteKnowledge).toEqual(defaultSettings.remoteKnowledge)
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'legacy-asr', llmApiKey: 'legacy-llm', remoteKnowledgeApiKey: '' })
  })

  it('migrates 0.3.0 settings read-only with the remote service off and existing data untouched', async () => {
    const { remoteKnowledge: _remote, ...legacy } = input()
    const content = JSON.stringify({ version: 1, settings: legacy, secrets: { asr: '', llm: '' } })
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
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ version: 1, settings: config, secrets: { asr: '', llm: '', remoteKnowledge: '' } }))
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

  it('rejects an oversized JD without overwriting a saved target', async () => {
    const store = new SettingsStore(directory, crypto)
    const saved = input()
    saved.interviewTarget = { companyName: '原公司', roleName: '原岗位', jobDescription: '原 JD' }
    await store.saveSettings(saved)
    await expect(store.saveSettings({ ...saved, interviewTarget: { ...saved.interviewTarget, jobDescription: '字'.repeat(12001) } })).rejects.toThrow('配置或输入无效')
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

describe('Markdown export', () => {
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

})
