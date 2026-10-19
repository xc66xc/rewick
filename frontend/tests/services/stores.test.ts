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
  it('stores only local configuration for a cloud-managed account', async () => {
    const store = new SettingsStore(directory, crypto, true)
    await store.saveSettings({ ...input(), preferencesVersion: 7, answerStyle: 'detailed', serviceSelections: { llm: { source: 'platform', id: 'platform-model' } } })
    const disk = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))
    expect(disk.settings).not.toHaveProperty('answerStyle')
    expect(disk.settings).not.toHaveProperty('autoAnswer')
    expect(disk.settings).not.toHaveProperty('retrieval')
    expect(disk.settings).not.toHaveProperty('preferencesVersion')
    expect(disk.settings.asr).not.toHaveProperty('silenceMs')
    expect(disk.settings.llm).not.toHaveProperty('temperature')
    expect(disk.settings.serviceSelections).toEqual({})
    await store.saveCustomService({ name: '我的模型', kind: 'llm', url: 'https://my-model.example/v1', model: 'test', apiKey: 'local-secret' })
    const restarted = new SettingsStore(directory, crypto, true)
    expect((await restarted.getSecrets()).llmApiKey).toBe('local-secret')
    expect((await restarted.getSettings()).serviceSelections?.llm?.source).toBe('custom')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('local-secret')
  })

  it('drops undefined service selections submitted by the settings dialog before cloud sync', async () => {
    const store = new SettingsStore(directory, crypto, true)
    const saved = await store.saveSettings({ ...input(), serviceSelections: { llm: { source: 'platform', id: 'platform-model' }, asr: undefined } })
    expect(saved.serviceSelections?.llm?.id).toBe('platform-model')
    expect(saved.serviceSelections).not.toHaveProperty('asr')
    expect(JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')).settings.serviceSelections).toEqual({})
  })

  it('persists encrypted keys across restarts without returning secrets to the renderer', async () => {
    const store = new SettingsStore(directory, crypto)
    expect(await store.getSettings()).toEqual(defaultSettings)
    const config = input()
    config.asr.apiKey = 'test-asr-secret'
    config.llm.apiKey = 'test-llm-secret'
    config.interviewTarget = { companyName: '示例公司', roleName: '开发工程师', jobDescription: '需要 Redis 经验' }
    config.autoAnswer = { enabled: false, pauseMs: 2500 }
    const visible = await store.saveSettings(config)
    expect(visible.asr.hasApiKey).toBe(true)
    expect(JSON.stringify(visible)).not.toContain('test-asr-secret')
    expect(JSON.stringify(visible)).not.toContain('apiKey')
    const persisted = await readFile(join(directory, 'settings.json'), 'utf8')
    expect(persisted).not.toContain('test-asr-secret')
    expect(persisted).not.toContain('test-llm-secret')
    expect(await new SettingsStore(directory, crypto).getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'test-asr-secret', llmApiKey: 'test-llm-secret', })
    expect((await new SettingsStore(directory, crypto).getSettings()).interviewTarget).toEqual(defaultSettings.interviewTarget)
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
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'first-secret', llmApiKey: '', })
    expect((await store.getSettings()).context.text).toBe('')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('后端工程师')
  })

  it('serializes concurrent changes without losing an omitted secret', async () => {
    const store = new SettingsStore(directory, crypto)
    const first = input()
    first.asr.apiKey = 'retained-secret'
    await Promise.all([store.saveSettings(first), ...Array.from({ length: 8 }, (_, i) => {
      const next = input()
      next.autoAnswer.pauseMs = 2000 + i
      return store.saveSettings(next)
    })])
    expect((await store.getSecrets()).asrApiKey).toBe('retained-secret')
    expect((await store.getSettings()).autoAnswer.pauseMs).toBe(2007)
  })

  it('does not reuse local resume text while preserving encrypted service credentials', async () => {
    const { interviewTarget: _target, retrieval: _retrieval, ...legacy } = input()
    legacy.context.text = '旧版个人背景保持原样'
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ version: 1, settings: legacy,
      secrets: { asr: crypto.encryptString('legacy-asr').toString('base64'), llm: crypto.encryptString('legacy-llm').toString('base64') } }))
    const store = new SettingsStore(directory, crypto)
    const loaded = await store.getSettings()
    expect(loaded.context.text).toBe('')
    expect(loaded.interviewTarget).toEqual(defaultSettings.interviewTarget)
    expect(loaded.retrieval.enabled).toBe(false)
    expect(await store.getSecrets()).toEqual({ platformAccessToken: '', asrApiKey: 'legacy-asr', llmApiKey: 'legacy-llm', })
  })

  it('keeps an in-flight endpoint paired with its original key while settings change', async () => {
    const store = new SettingsStore(directory, crypto)
    const first = { ...input(), llm: { ...input().llm, baseUrl: 'https://first.example/v1', apiKey: 'first-key' } }
    const second = { ...input(), llm: { ...input().llm, baseUrl: 'https://second.example/v1', apiKey: 'second-key' } }
    await store.saveSettings(first)
    const pendingSnapshot = store.getConnectionSnapshot()
    const pendingSave = store.saveSettings(second)
    const [snapshot] = await Promise.all([pendingSnapshot, pendingSave])
    expect(snapshot.settings.llm.baseUrl).toBe(first.llm.baseUrl)
    expect(snapshot.secrets.llmApiKey).toBe(first.llm.apiKey)
    expect((await store.getConnectionSnapshot()).secrets.llmApiKey).toBe(second.llm.apiKey)
    expect((await store.getSettings()).llm.baseUrl).toBe(second.llm.baseUrl)
  })

  it('validates incoming JD but never persists server background in local settings', async () => {
    const store = new SettingsStore(directory, crypto)
    const saved = input()
    saved.interviewTarget = { companyName: '原公司', roleName: '原岗位', jobDescription: '原 JD' }
    await store.saveSettings(saved)
    await expect(store.saveSettings({ ...saved, interviewTarget: { ...saved.interviewTarget, jobDescription: '字'.repeat(12001) } })).rejects.toThrow('配置或输入无效')
    expect((await store.getSettings()).interviewTarget).toEqual(defaultSettings.interviewTarget)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('原 JD')
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
    const questions = sessionToMarkdown(session, { includeAiAnswers: false, includeTranscript: true, includeInterviewInfo: true })
    expect(questions).toContain('### 如何设计缓存？')
    expect(questions).toContain('[01:05]（未定稿）')
    expect(questions).not.toContain('- 考虑一致性')
    expect(questions).not.toContain('状态：已停止')
    expect(session.answers[0].text).toBe('- 考虑一致性')
    const onlyQuestions = sessionToMarkdown(session, { includeAiAnswers: false, includeTranscript: false, includeInterviewInfo: false })
    expect(onlyQuestions).toContain('### 如何设计缓存？')
    expect(onlyQuestions).not.toContain('## 转写')
    expect(onlyQuestions).not.toContain('## 面试信息')
    expect(onlyQuestions).not.toContain('开始时间：')
    expect(onlyQuestions).not.toContain('介绍一下缓存')
  })

})
