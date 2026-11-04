import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalSecretStorage } from '../../src/main/services/local-secret-storage'
import { SettingsStore } from '../../src/main/services/settings-store'
import { AccountWorkspaces, accountDirectory } from '../../src/main/services/account-workspace'
import { defaultSettings } from '../../src/shared/defaults'
import { InterviewRecordingStore } from '../../src/main/services/interview-recording-store'
import { ServerHistory } from '../../src/main/services/server-history'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })
describe('local AES credentials and pending history', () => {
  it('uses a separate namespace, preserves inaccessible legacy bytes and restores encrypted credentials/drafts after restart', async () => {
    root = await mkdtemp(join(tmpdir(), 'rewick-aes-integration-'))
    const original = join(root, 'authentication-v3/settings.json')
    await mkdir(join(root, 'authentication-v3'))
    await writeFile(original, 'legacy-keychain-ciphertext-not-readable')
    const vault = join(root, 'local-vault-v1'), crypto = new LocalSecretStorage(vault)
    await crypto.initialize()
    const settingsPath = join(vault, 'data/authentication-v3')
    const store = new SettingsStore(settingsPath, crypto)
    await store.initializeServices()
    await store.saveRememberedLogin({ identifier: 'test@example.invalid', password: 'synthetic-test-password' })
    const draftRoot = join(vault, 'data/accounts/test')
    const history = new ServerHistory(draftRoot, crypto, async () => { throw new Error('No network in this fixture') })
    const record = { id: 'pending', title: '未同步示例', createdAt: '2026-11-04T10:00:00+08:00', segments: [], answers: [] }
    await history.saveDraft(record)
    expect(await readFile(original, 'utf8')).toBe('legacy-keychain-ciphertext-not-readable')
    expect(await readFile(join(settingsPath, 'settings.json'), 'utf8')).not.toContain('synthetic-test-password')
    expect(await readFile(join(draftRoot, 'history-outbox.enc.json'), 'utf8')).not.toContain('未同步示例')
    crypto.dispose()
    const restarted = new LocalSecretStorage(vault)
    await restarted.initialize()
    expect(await new SettingsStore(settingsPath, restarted).getRememberedLogin()).toEqual({ identifier: 'test@example.invalid', password: 'synthetic-test-password' })
    const restored = new ServerHistory(draftRoot, restarted, async () => { throw new Error('No network in this fixture') })
    expect(await restored.localDraft('pending')).toEqual(record)
    restarted.dispose()
  })
  it('keeps recording ownership stable while moving account credentials and drafts', async () => {
    root = await mkdtemp(join(tmpdir(), 'rewick-aes-ownership-'))
    const vault = join(root, 'local-vault-v1'), crypto = new LocalSecretStorage(vault)
    await crypto.initialize()
    const accounts = new AccountWorkspaces(root, crypto, () => undefined, undefined, undefined, join(vault, 'data'))
    const authenticated = { ...structuredClone(defaultSettings), platform: { ...defaultSettings.platform, enabled: true, baseUrl: 'http://127.0.0.1:8080', authenticated: true, capabilities: { llm: true, asr: true }, models: { llm: 'test', asr: 'test' }, limits: { maxAsrSessionSeconds: 3600 }, user: { id: 'user-1', displayName: '合成用户' } } }
    const account = accounts.activate(authenticated)!
    try {
      const legacyOwner = accountDirectory(root, 'user-1')
      expect(account.id).toBe(legacyOwner)
      const recordings = new InterviewRecordingStore(join(root, 'interview-recordings'))
      await recordings.start(legacyOwner, 'test-session')
      await recordings.stop(legacyOwner, 'test-session')
      expect(await recordings.info(account.id, 'test-session')).not.toBeNull()
      await account.settings.saveRememberedLogin({ identifier: 'example@test.invalid', password: 'synthetic' })
      const contents = await readFile(join(accountDirectory(join(vault, 'data'), 'user-1'), 'settings.json'), 'utf8')
      expect(contents).not.toContain('synthetic')
    } finally { accounts.dispose(); crypto.dispose() }
  })

})
