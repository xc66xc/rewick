import { constants } from 'node:fs'
import { chmod, link, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'

const magic = Buffer.from('RWKSEC01', 'ascii')
const keyBytes = 32, keyIdBytes = 16, nonceBytes = 12, tagBytes = 16
const headerBytes = magic.length + keyIdBytes + nonceBytes
// Base64 envelope remains below ServerHistory's existing 220 MiB JSON read bound.
const maximumPlaintextBytes = 160 * 1024 * 1024
const temporaryPrefix = '.key-v1-'
const missingKeyMessage = '本机加密密钥缺失，已有数据未修改。请恢复原 key.json 和数据备份，不能自动生成新密钥。'
const invalidKeyMessage = '本机加密密钥文件无效，已有数据未修改。请恢复原 key.json 备份。'

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Versioned ciphertext only; never invokes an OS credential store or legacy fallback. */
export function isLocalSecretCiphertext(value: Buffer): boolean {
  return value.length >= magic.length && value.subarray(0, magic.length).equals(magic)
}

/** A device-local key protects file contents, not against another process running as this user. */
export class LocalSecretStorage {
  private key: Buffer | undefined
  private initialization: Promise<void> | undefined
  private disposed = false
  private readonly keyPath: string

  constructor(private readonly root: string) { this.keyPath = join(root, 'key.json') }

  initialize(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('本机加密存储已关闭。'))
    if (!this.initialization) {
      this.initialization = this.load().catch(error => { this.initialization = undefined; throw error })
    }
    return this.initialization
  }

  isEncryptionAvailable(): boolean { return Boolean(this.key) && !this.disposed }

  encryptString(value: string): Buffer {
    const key = this.requireKey()
    if (typeof value !== 'string' || value.length > maximumPlaintextBytes || Buffer.byteLength(value, 'utf8') > maximumPlaintextBytes) {
      throw new Error('待加密数据超过本机存储容量限制。')
    }
    const nonce = randomBytes(nonceBytes)
    const header = Buffer.concat([magic, this.keyId(key), nonce])
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: tagBytes })
    cipher.setAAD(header)
    return Buffer.concat([header, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
  }

  decryptString(value: Buffer): string {
    const key = this.requireKey()
    if (!Buffer.isBuffer(value) || !isLocalSecretCiphertext(value)) throw new Error('这是旧版或未知格式的加密数据，需要主动迁移；原数据未修改。')
    if (value.length < headerBytes + tagBytes || value.length > headerBytes + tagBytes + maximumPlaintextBytes) throw new Error('本机加密数据格式或长度无效，原数据未修改。')
    const header = value.subarray(0, headerBytes)
    if (!timingSafeEqual(header.subarray(magic.length, magic.length + keyIdBytes), this.keyId(key))) {
      throw new Error('本机加密密钥与数据不匹配，请恢复对应密钥；原数据未修改。')
    }
    const nonce = header.subarray(magic.length + keyIdBytes)
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: tagBytes })
      decipher.setAAD(header)
      decipher.setAuthTag(value.subarray(value.length - tagBytes))
      return Buffer.concat([decipher.update(value.subarray(headerBytes, value.length - tagBytes)), decipher.final()]).toString('utf8')
    } catch { throw new Error('本机加密数据校验失败，可能已损坏；原数据未修改。') }
  }

  dispose(): void { this.disposed = true; this.key?.fill(0); this.key = undefined }

  private requireKey(): Buffer {
    if (!this.key || this.disposed) throw new Error('本机加密存储尚未初始化或已关闭。')
    return this.key
  }

  private keyId(key: Buffer): Buffer { return createHash('sha256').update(key).digest().subarray(0, keyIdBytes) }

  private async load(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const directory = await lstat(this.root)
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('本机加密存储目录必须是实际目录，不能是符号链接。')
    if (process.platform !== 'win32') await chmod(this.root, 0o700)
    let key = await this.readKey()
    if (!key) {
      const entries = await readdir(this.root)
      // Interrupted, unpublished temporary keys are not evidence of initialized data.
      if (entries.some(name => !/^\.key-v1-[0-9a-f-]{36}\.tmp$/.test(name))) {
        key = await this.readKey()
        if (!key) throw new Error(missingKeyMessage)
      } else {
        await this.createKey()
        key = await this.readKey()
        if (!key) throw new Error(missingKeyMessage)
      }
    }
    try {
      await this.markInitialized()
      if (this.disposed) throw new Error('本机加密存储已关闭。')
      this.key = key
    } catch (error) { key.fill(0); throw error }
  }

  private async readKey(): Promise<Buffer | undefined> {
    try {
      const entry = await lstat(this.keyPath)
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 1 || entry.size > 4096) throw new Error(invalidKeyMessage)
      const file = await open(this.keyPath, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW))
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size < 1 || info.size > 4096) throw new Error(invalidKeyMessage)
        if (process.platform !== 'win32') await file.chmod(0o600)
        // Keep the read bounded even if a same-user process grows the file after stat.
        const bytes = Buffer.alloc(4097)
        let length = 0
        while (length < bytes.length) {
          const { bytesRead } = await file.read(bytes, length, bytes.length - length, length)
          if (!bytesRead) break
          length += bytesRead
        }
        if (length > 4096) throw new Error(invalidKeyMessage)
        const raw: unknown = JSON.parse(bytes.subarray(0, length).toString('utf8'))
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'key,version') throw new Error(invalidKeyMessage)
        const value = raw as { key: unknown; version: unknown }
        if (value.version !== 1 || typeof value.key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value.key)) throw new Error(invalidKeyMessage)
        const key = Buffer.from(value.key, 'base64')
        if (key.length !== keyBytes || key.toString('base64') !== value.key) { key.fill(0); throw new Error(invalidKeyMessage) }
        return key
      } finally { await file.close() }
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return undefined
      if (error instanceof SyntaxError || hasCode(error, 'ELOOP')) throw new Error(invalidKeyMessage)
      throw error
    }
  }

  private async createKey(): Promise<void> {
    const temporary = join(this.root, `${temporaryPrefix}${randomUUID()}.tmp`)
    const candidate = randomBytes(keyBytes)
    try {
      const file = await open(temporary, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify({ version: 1, key: candidate.toString('base64') }), 'utf8'); await file.sync() }
      finally { await file.close() }
      try { await link(temporary, this.keyPath); await this.syncDirectory() }
      catch (error) { if (!hasCode(error, 'EEXIST')) throw error }
    } finally { candidate.fill(0); await unlink(temporary).catch(error => { if (!hasCode(error, 'ENOENT')) throw error }) }
  }

  private async markInitialized(): Promise<void> {
    const marker = join(this.root, 'initialized.json')
    try {
      const file = await open(marker, 'wx', 0o600)
      try { await file.writeFile('{"version":1}', 'utf8'); await file.sync() }
      finally { await file.close() }
      await this.syncDirectory()
    } catch (error) { if (!hasCode(error, 'EEXIST')) throw error }
  }

  private async syncDirectory(): Promise<void> {
    if (process.platform === 'win32') return
    const directory = await open(this.root, constants.O_RDONLY | constants.O_DIRECTORY)
    try { await directory.sync() } finally { await directory.close() }
  }
}
