import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { defaultSettings } from '../../shared/defaults'
import { settingsInputSchema, sessionRecordSchema } from './validation'
import { platformSessionSchema } from './platform-schema'
import { storedCustomServiceSchema } from './custom-service-profiles'
import { writeJsonAtomic } from './storage'

interface CryptoStorage { encryptString(value: string): Buffer; decryptString(value: Buffer): string; isEncryptionAvailable(): boolean }
export interface LegacyStorageStatus { available: boolean; canImport: boolean; reason?: string }
const journalFile = 'legacy-migration.json'
const MAX_TOTAL = 300 * 1024 * 1024
const ciphertext = z.string().max(16_384)
const storedSettings = z.object({
  version: z.literal(1), settings: z.record(z.string(), z.unknown()),
  secrets: z.object({ asr: ciphertext, llm: ciphertext, platformAccessToken: ciphertext.default('') }),
  customServices: z.array(storedCustomServiceSchema).max(100).default([]),
  rememberedLogin: ciphertext.optional(), platformSession: platformSessionSchema.optional(),
}).passthrough()
const draftSchema = z.object({ record: sessionRecordSchema, version: z.number().int().nonnegative(), mutationId: z.string().uuid(), next: sessionRecordSchema.optional(), blocked: z.enum(['record_changed', 'record_deleted', 'retry_limit']).optional(), attempts: z.number().int().nonnegative().optional(), retryAt: z.number().optional(), recoveryId: z.string().uuid().optional(), sourceId: z.string().optional(), sourceHash: z.string().optional() })
const historyJournal = z.object({ drafts: z.record(z.string(), draftSchema), versions: z.record(z.string(), z.number()), removed: z.array(z.string()) })
const migrationJournal = z.object({
  version: z.literal(1), id: z.string().uuid(), hadData: z.boolean(),
  stage: z.string(), backup: z.string(),
}).strict().refine(value => value.stage === `data.import-${value.id}` && value.backup === `data.before-import-${value.id}`)
interface LegacyFile { relative: string; kind: 'settings' | 'drafts'; maxBytes: number }

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}
async function directory(path: string): Promise<boolean> {
  if (!await exists(path)) return false
  const value = await lstat(path)
  if (!value.isDirectory() || value.isSymbolicLink()) throw new Error('本机迁移目录无效或包含符号链接，请先检查备份。')
  return true
}
async function read(path: string, maximum: number): Promise<Buffer> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('旧数据文件无效、过大或包含符号链接，迁移未执行。')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maximum) throw new Error('旧数据文件超出迁移容量。')
    const value = await file.readFile()
    if (value.byteLength > maximum) throw new Error('旧数据文件超出迁移容量。')
    return value
  } finally { await file.close() }
}
async function sourceFiles(userData: string): Promise<LegacyFile[]> {
  if (!await directory(userData)) return []
  const files: LegacyFile[] = []
  if (await directory(join(userData, 'authentication-v3')) && await exists(join(userData, 'authentication-v3/settings.json'))) files.push({ relative: 'authentication-v3/settings.json', kind: 'settings', maxBytes: 1024 * 1024 })
  if (await directory(join(userData, 'accounts'))) {
    const accounts = await readdir(join(userData, 'accounts'))
    if (accounts.length > 200) throw new Error('旧账号目录过多，请先备份后分批处理。')
    for (const account of accounts) {
      if (!/^[a-f0-9]{64}$/.test(account)) throw new Error('旧账号目录名称无效，迁移未执行。')
      await directory(join(userData, 'accounts', account))
      for (const [name, kind, maxBytes] of [['settings.json', 'settings', 1024 * 1024], ['history-outbox.enc.json', 'drafts', 220 * 1024 * 1024]] as const) {
        if (await exists(join(userData, 'accounts', account, name))) files.push({ relative: `accounts/${account}/${name}`, kind, maxBytes })
      }
    }
  }
  return files
}
function settings(buffer: Buffer) {
  const parsed = storedSettings.parse(JSON.parse(buffer.toString('utf8')))
  const normalized = { ...defaultSettings, ...parsed.settings, asr: { ...defaultSettings.asr, ...parsed.settings.asr as object }, llm: { ...defaultSettings.llm, ...parsed.settings.llm as object } }
  settingsInputSchema.parse(normalized)
  return parsed
}
async function freshData(vaultRoot: string): Promise<void> {
  const root = join(vaultRoot, 'data')
  if (!await directory(root)) return
  const entries = await readdir(root)
  if (entries.some(entry => !['authentication-v3', 'accounts'].includes(entry))) throw new Error('新存储已有本机数据，不能覆盖。')
  if (await directory(join(root, 'accounts')) && (await readdir(join(root, 'accounts'))).length) throw new Error('新存储已有账号数据或草稿，不能覆盖。')
  if (await directory(join(root, 'authentication-v3'))) {
    const files = await readdir(join(root, 'authentication-v3'))
    if (files.some(name => name !== 'settings.json')) throw new Error('新存储已有登录数据，不能覆盖。')
    if (files.length) {
      const saved = settings(await read(join(root, 'authentication-v3/settings.json'), 1024 * 1024))
      if (Object.values(saved.secrets).some(Boolean) || saved.rememberedLogin || saved.platformSession || saved.customServices.length) throw new Error('新存储已有登录凭据或自定义服务，请保留当前数据，不要重复导入。')
    }
  }
}
async function freshFingerprint(vaultRoot: string): Promise<string> {
  await freshData(vaultRoot)
  const root = join(vaultRoot, 'data')
  if (!await directory(root)) return 'absent'
  const entries = (await readdir(root)).sort()
  const auth = join(root, 'authentication-v3/settings.json')
  return createHash('sha256').update(JSON.stringify(entries)).update(await exists(auth) ? await read(auth, 1024 * 1024) : Buffer.alloc(0)).digest('hex')
}
async function syncTree(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) if (entry.isDirectory()) await syncTree(join(path, entry.name))
  await syncDirectory(path)
}
async function syncDirectory(path: string) {
  if (process.platform === 'win32') return
  const file = await open(path, 'r')
  try { await file.sync() } finally { await file.close() }
}

/** Metadata only: this method never contacts Electron safeStorage or reads secret values. */
export async function getLegacyStorageStatus(userData: string, vaultRoot: string): Promise<LegacyStorageStatus> {
  try {
    await directory(vaultRoot)
    const files = await sourceFiles(userData)
    if (!files.length) return { available: false, canImport: false }
    if (await exists(join(vaultRoot, journalFile))) return { available: true, canImport: false, reason: '上次迁移尚未收敛，请重新启动应用后再试。' }
    try { await freshData(vaultRoot) } catch (error) { return { available: true, canImport: false, reason: error instanceof Error ? error.message : '当前存储不可导入。' } }
    return { available: true, canImport: true }
  } catch { return { available: true, canImport: false, reason: '旧数据路径无效，已保留原文件，请先检查备份。' } }
}

/** Run before creating stores. Recover a directory swap without decrypting any legacy data. */
export async function recoverLegacyMigration(vaultRoot: string): Promise<void> {
  if (!await directory(vaultRoot) || !await exists(join(vaultRoot, journalFile))) return
  const journal = migrationJournal.parse(JSON.parse((await read(join(vaultRoot, journalFile), 4096)).toString('utf8')))
  const data = join(vaultRoot, 'data'), stage = join(vaultRoot, journal.stage), backup = join(vaultRoot, journal.backup)
  const [hasData, hasStage, hasBackup] = await Promise.all([directory(data), directory(stage), directory(backup)])
  if (!hasData && hasBackup && hasStage) await rename(backup, data)
  else if (hasData && !hasStage && (hasBackup || !journal.hadData)) { /* Installed; preserve backup. */ }
  else if (!hasBackup && hasStage && hasData === journal.hadData) { /* Not committed; preserve current data and encrypted staging files. */ }
  else throw new Error('本机迁移状态不明确，已停止恢复以避免覆盖数据。请保留本地备份。')
  await syncDirectory(vaultRoot)
  await rm(join(vaultRoot, journalFile))
  await syncDirectory(vaultRoot)
}

/** Explicit opt-in only. Caller must hold the account/work mutation gate and be logged out. */
export async function migrateLegacyStorage(userData: string, vaultRoot: string, oldCrypto: CryptoStorage, newCrypto: CryptoStorage): Promise<{ settings: number; drafts: number }> {
  await directory(userData)
  if (!await directory(vaultRoot)) throw new Error('本机加密存储尚未初始化。')
  const status = await getLegacyStorageStatus(userData, vaultRoot)
  if (!status.available || !status.canImport) throw new Error(status.reason ?? '没有可导入的旧本机数据。')
  if (!newCrypto.isEncryptionAvailable()) throw new Error('本机加密密钥不可用，迁移未执行。')
  const initialFingerprint = await freshFingerprint(vaultRoot)
  const files = await sourceFiles(userData), id = randomUUID()
  const stageName = `data.import-${id}`, backupName = `data.before-import-${id}`
  const stage = join(vaultRoot, stageName), data = join(vaultRoot, 'data'), backup = join(vaultRoot, backupName)
  await mkdir(stage, { mode: 0o700 })
  let prepared = false, total = 0
  const result = { settings: 0, drafts: 0 }
  try {
    for (const file of files) {
      const source = await read(join(userData, file.relative), file.maxBytes)
      total += source.byteLength
      if (total > MAX_TOTAL) throw new Error('旧数据总量超过迁移容量，原文件已保留。')
      if (file.kind === 'settings') {
        const saved = settings(source)
        const convert = (value: string, login = false) => {
          if (!value) return ''
          if (!oldCrypto.isEncryptionAvailable()) throw new Error('旧钥匙串不可用，迁移未执行。')
          const decoded = Buffer.from(value, 'base64')
          if (!decoded.length || decoded.toString('base64') !== value) throw new Error('旧凭据密文无效。')
          const clear = oldCrypto.decryptString(decoded)
          if (login) z.object({ identifier: z.string(), password: z.string() }).parse(JSON.parse(clear))
          return newCrypto.encryptString(clear).toString('base64')
        }
        saved.secrets = { asr: convert(saved.secrets.asr), llm: convert(saved.secrets.llm), platformAccessToken: convert(saved.secrets.platformAccessToken) }
        if (saved.rememberedLogin) saved.rememberedLogin = convert(saved.rememberedLogin, true)
        saved.customServices = saved.customServices.map(profile => ({ ...profile, secret: convert(profile.secret) }))
        for (const kind of ['asr', 'llm']) if (saved.settings[kind] && typeof saved.settings[kind] === 'object') delete (saved.settings[kind] as Record<string, unknown>).apiKey
        storedSettings.parse(saved)
        await writeJsonAtomic(join(stage, file.relative), saved)
        result.settings++
      } else {
        const encoded = z.string().parse(JSON.parse(source.toString('utf8')))
        const decoded = Buffer.from(encoded, 'base64')
        if (!decoded.length || decoded.toString('base64') !== encoded || !oldCrypto.isEncryptionAvailable()) throw new Error('旧草稿加密数据不可用。')
        const clear = oldCrypto.decryptString(decoded)
        const parsed = historyJournal.parse(JSON.parse(clear))
        await writeJsonAtomic(join(stage, file.relative), newCrypto.encryptString(JSON.stringify(parsed)).toString('base64'))
        result.drafts += Object.keys(parsed.drafts).length
      }
    }
    await syncTree(stage)
    if (await freshFingerprint(vaultRoot) !== initialFingerprint) throw new Error('当前本机设置已改变，迁移已停止。')
    const hadData = await directory(data)
    await writeJsonAtomic(join(vaultRoot, journalFile), { version: 1, id, hadData, stage: stageName, backup: backupName })
    await syncDirectory(vaultRoot)
    prepared = true
    if (hadData) { await rename(data, backup); await syncDirectory(vaultRoot) }
    await rename(stage, data)
    await syncDirectory(vaultRoot)
    await rm(join(vaultRoot, journalFile))
    await syncDirectory(vaultRoot)
    return result
  } catch {
    if (prepared) await recoverLegacyMigration(vaultRoot)
    else await rm(stage, { recursive: true, force: true })
    throw new Error('旧数据迁移未完成，原文件与备份已保留。请检查旧钥匙串授权后重试；也可以重新登录并重新填写自定义密钥。')
  }
}
