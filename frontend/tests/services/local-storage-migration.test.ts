import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { defaultSettings } from '../../src/shared/defaults'
import { getLegacyStorageStatus, migrateLegacyStorage, recoverLegacyMigration } from '../../src/main/services/local-storage-migration'

let root: string, userData: string, vault: string
const account = 'a'.repeat(64)
const oldCrypto = { isEncryptionAvailable: vi.fn(() => true), encryptString: (value: string) => Buffer.from(`old:${value}`), decryptString: vi.fn((value: Buffer) => { if (!value.toString().startsWith('old:')) throw Error('bad old data'); return value.toString().slice(4) }) }
const newCrypto = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`new:${value}`), decryptString: (value: Buffer) => value.toString().slice(4) }
const encrypt = (value: string) => oldCrypto.encryptString(value).toString('base64')
const record = { id: 'one', createdAt: '2026-11-04T10:00:00+08:00', title: '合成草稿', segments: [], answers: [] }
function settings(secret = '') { return { version: 1, settings: structuredClone(defaultSettings), secrets: { asr: '', llm: secret, platformAccessToken: '' }, customServices: [], serviceProfilesInitialized: true } }
async function put(path: string, value: unknown) { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)) }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'rewick-migration-')); userData = join(root, 'app'); vault = join(userData, 'local-vault-v1'); await mkdir(vault, { recursive: true }); vi.clearAllMocks() })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('explicit legacy data migration', () => {
  it('only inspects metadata until the user explicitly requests import', async () => {
    await put(join(userData, 'authentication-v3/settings.json'), settings(encrypt('test-api-key')))
    expect(await getLegacyStorageStatus(userData, vault)).toEqual({ available: true, canImport: true })
    expect(oldCrypto.decryptString).not.toHaveBeenCalled()
    expect(oldCrypto.isEncryptionAvailable).not.toHaveBeenCalled()
  })
  it('reencrypts credentials and draft journal with metadata preserved, keeping original bytes', async () => {
    const auth = settings(encrypt('test-api-key'))
    const authPath = join(userData, 'authentication-v3/settings.json')
    const draftPath = join(userData, 'accounts', account, 'history-outbox.enc.json')
    const mutationId = randomUUID(), journal = { drafts: { one: { record, version: 7, mutationId, attempts: 2 } }, versions: { two: 3 }, removed: ['deleted'] }
    await put(authPath, auth); await put(join(userData, 'accounts', account, 'settings.json'), settings(encrypt('account-key')))
    await put(draftPath, encrypt(JSON.stringify(journal)))
    await put(join(vault, 'data/authentication-v3/settings.json'), settings())
    const original = await readFile(authPath), originalDraft = await readFile(draftPath)
    expect(await migrateLegacyStorage(userData, vault, oldCrypto, newCrypto)).toEqual({ settings: 2, drafts: 1 })
    const imported = JSON.parse(await readFile(join(vault, 'data/authentication-v3/settings.json'), 'utf8'))
    expect(newCrypto.decryptString(Buffer.from(imported.secrets.llm, 'base64'))).toBe('test-api-key')
    const outbox = JSON.parse(await readFile(join(vault, 'data/accounts', account, 'history-outbox.enc.json'), 'utf8'))
    expect(JSON.parse(newCrypto.decryptString(Buffer.from(outbox, 'base64')))).toEqual(journal)
    expect(await readFile(authPath)).toEqual(original)
    expect(await readFile(draftPath)).toEqual(originalDraft)
    expect((await readdir(vault)).some(name => name.startsWith('data.before-import-'))).toBe(true)
    expect(await getLegacyStorageStatus(userData, vault)).toMatchObject({ available: true, canImport: false })
  })
  it('keeps current and old bytes unchanged when the old keychain refuses decryption', async () => {
    const source = join(userData, 'authentication-v3/settings.json'), current = join(vault, 'data/authentication-v3/settings.json')
    await put(source, settings(encrypt('legacy-key'))); await put(current, settings())
    const before = await readFile(current), original = await readFile(source)
    const denied = { ...oldCrypto, decryptString: () => { throw Error('access denied') } }
    await expect(migrateLegacyStorage(userData, vault, denied, newCrypto)).rejects.toThrow('原文件与备份已保留')
    expect(await readFile(current)).toEqual(before)
    expect(await readFile(source)).toEqual(original)
    expect((await readdir(vault)).filter(name => name.startsWith('data.import-'))).toEqual([])
  })
  it('does not overwrite newly saved login credentials or account drafts', async () => {
    await put(join(userData, 'authentication-v3/settings.json'), settings(encrypt('legacy-key')))
    await put(join(vault, 'data/authentication-v3/settings.json'), settings('new-ciphertext'))
    expect(await getLegacyStorageStatus(userData, vault)).toMatchObject({ canImport: false })
    await expect(migrateLegacyStorage(userData, vault, oldCrypto, newCrypto)).rejects.toThrow('不能重复导入'.replace('不能', '不要'))
    expect(oldCrypto.decryptString).not.toHaveBeenCalled()
    await rm(join(vault, 'data/authentication-v3'), { recursive: true })
    await put(join(vault, 'data/accounts', account, 'history-outbox.enc.json'), 'new-ciphertext')
    await expect(migrateLegacyStorage(userData, vault, oldCrypto, newCrypto)).rejects.toThrow('草稿')
  })
  it('rejects symlink sources without reading or decrypting the target', async () => {
    if (process.platform === 'win32') return
    await put(join(root, 'outside.json'), settings(encrypt('outside-key')))
    await mkdir(join(userData, 'authentication-v3'))
    await symlink(join(root, 'outside.json'), join(userData, 'authentication-v3/settings.json'))
    await expect(migrateLegacyStorage(userData, vault, oldCrypto, newCrypto)).rejects.toThrow('原文件')
    expect(oldCrypto.decryptString).not.toHaveBeenCalled()
  })
})

describe('migration crash recovery', () => {
  it('restores the pre-import data directory when interrupted between directory moves', async () => {
    const id = randomUUID(), stage = `data.import-${id}`, backup = `data.before-import-${id}`
    await put(join(vault, backup, 'authentication-v3/settings.json'), settings())
    await put(join(vault, stage, 'authentication-v3/settings.json'), settings('imported-key'))
    await put(join(vault, 'legacy-migration.json'), { version: 1, id, stage, backup, hadData: true })
    await recoverLegacyMigration(vault)
    const current = JSON.parse(await readFile(join(vault, 'data/authentication-v3/settings.json'), 'utf8'))
    expect(current.secrets.llm).toBe('')
    expect(await readdir(vault)).toContain(stage)
    expect(oldCrypto.decryptString).not.toHaveBeenCalled()
  })
  it('keeps a completed import and its backup after a crash before journal cleanup', async () => {
    const id = randomUUID(), stage = `data.import-${id}`, backup = `data.before-import-${id}`
    await put(join(vault, backup, 'authentication-v3/settings.json'), settings())
    await put(join(vault, 'data/authentication-v3/settings.json'), settings('imported-key'))
    await put(join(vault, 'legacy-migration.json'), { version: 1, id, stage, backup, hadData: true })
    await recoverLegacyMigration(vault)
    expect(JSON.parse(await readFile(join(vault, 'data/authentication-v3/settings.json'), 'utf8')).secrets.llm).toBe('imported-key')
    expect(await readdir(vault)).toContain(backup)
    expect(await readdir(vault)).not.toContain('legacy-migration.json')
  })
  it('refuses path traversal and ambiguous states instead of choosing data to overwrite', async () => {
    await put(join(vault, 'legacy-migration.json'), { version: 1, id: randomUUID(), stage: '../outside', backup: 'data', hadData: true })
    await expect(recoverLegacyMigration(vault)).rejects.toThrow()
    const id = randomUUID(), stage = `data.import-${id}`, backup = `data.before-import-${id}`
    for (const path of ['data', stage, backup]) await mkdir(join(vault, path))
    await put(join(vault, 'legacy-migration.json'), { version: 1, id, stage, backup, hadData: true })
    await expect(recoverLegacyMigration(vault)).rejects.toThrow('状态不明确')
    expect(await readdir(vault)).toEqual(expect.arrayContaining(['data', stage, backup]))
  })
})
