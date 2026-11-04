import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isLocalSecretCiphertext, LocalSecretStorage } from '../../src/main/services/local-secret-storage'

const directories: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'rewick-local-crypto-')); directories.push(directory)
  const root = join(directory, 'vault')
  return { directory, root, store: new LocalSecretStorage(root) }
}

describe('local-file secret storage', () => {
  it('has no available key before initialization and refuses operations after disposal', async () => {
    const { store } = await setup()
    expect(store.isEncryptionAvailable()).toBe(false)
    expect(() => store.encryptString('test')).toThrow('初始化')
    await store.initialize()
    const encrypted = store.encryptString('test')
    store.dispose()
    expect(store.isEncryptionAvailable()).toBe(false)
    expect(() => store.decryptString(encrypted)).toThrow('关闭')
    await expect(store.initialize()).rejects.toThrow('关闭')
  })

  it('round-trips Unicode and empty strings with random nonces, and reopens the same persisted key', async () => {
    const { store, root } = await setup()
    await store.initialize()
    const ciphertext = store.encryptString('synthetic-token-你好\n')
    const another = store.encryptString('synthetic-token-你好\n')
    expect(ciphertext.equals(another)).toBe(false)
    expect(isLocalSecretCiphertext(ciphertext)).toBe(true)
    expect(ciphertext.includes(Buffer.from('synthetic-token'))).toBe(false)
    expect(store.decryptString(store.encryptString(''))).toBe('')
    const reopened = new LocalSecretStorage(root)
    await reopened.initialize()
    expect(reopened.decryptString(ciphertext)).toBe('synthetic-token-你好\n')
    expect(reopened.decryptString(another)).toBe('synthetic-token-你好\n')
  })

  it('authenticates the version, key identity, nonce, ciphertext and tag without accepting legacy bytes', async () => {
    const { store } = await setup()
    await store.initialize()
    const ciphertext = store.encryptString('synthetic API credential')
    for (const index of [0, 8, 24, 36, ciphertext.length - 1]) {
      const changed = Buffer.from(ciphertext)
      changed[index] ^= 1
      expect(() => store.decryptString(changed)).toThrow()
    }
    for (const truncated of [Buffer.alloc(0), Buffer.from('v10-legacy'), ciphertext.subarray(0, 8), ciphertext.subarray(0, ciphertext.length - 1)]) {
      expect(() => store.decryptString(truncated)).toThrow()
    }
  })

  it('rejects UTF-8 plaintext exceeding 160 MiB before allocating an encryption buffer', async () => {
    const { store } = await setup()
    await store.initialize()
    // Simulate an oversized UTF-8 length without allocating a 160 MiB test fixture.
    vi.spyOn(Buffer, 'byteLength').mockReturnValueOnce(160 * 1024 * 1024 + 1)
    expect(() => store.encryptString('synthetic oversized input')).toThrow('容量限制')
  })

  it('rejects a ciphertext from another installation', async () => {
    const first = await setup(), second = await setup()
    await Promise.all([first.store.initialize(), second.store.initialize()])
    const ciphertext = first.store.encryptString('synthetic credential')
    expect(() => second.store.decryptString(ciphertext)).toThrow('不匹配')
  })

  it('converges on one atomic key during simultaneous first initialization', async () => {
    const { root } = await setup()
    const stores = Array.from({ length: 20 }, () => new LocalSecretStorage(root))
    await Promise.all(stores.map(store => store.initialize()))
    const ciphertext = stores[0].encryptString('concurrent synthetic credential')
    for (const store of stores) expect(store.decryptString(ciphertext)).toBe('concurrent synthetic credential')
    expect((await readdir(root)).sort()).toEqual(['initialized.json', 'key.json'])
    const persisted = JSON.parse(await readFile(join(root, 'key.json'), 'utf8'))
    expect(persisted.version).toBe(1)
    expect(Buffer.from(persisted.key, 'base64').length).toBe(32)
  })

  it('never creates a replacement key if an initialized key is removed, even without data files', async () => {
    const { store, root } = await setup()
    await store.initialize()
    await unlink(join(root, 'key.json'))
    await expect(new LocalSecretStorage(root).initialize()).rejects.toThrow('密钥缺失')
    await expect(lstat(join(root, 'key.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never creates a key over an existing data directory or unknown marker', async () => {
    for (const name of ['data', 'unknown-entry']) {
      const { store, root } = await setup()
      await mkdir(join(root, name), { recursive: true })
      await expect(store.initialize()).rejects.toThrow('密钥缺失')
      await expect(lstat(join(root, 'key.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('ignores unpublished temporary files left by an interrupted first creation', async () => {
    const { store, root } = await setup()
    await mkdir(root)
    const temporary = `.key-v1-${randomUUID()}.tmp`
    await writeFile(join(root, temporary), 'incomplete unpublished fixture', { mode: 0o600 })
    await store.initialize()
    expect(store.decryptString(store.encryptString('ready'))).toBe('ready')
    expect(await readFile(join(root, temporary), 'utf8')).toBe('incomplete unpublished fixture')
  })

  it.each(['{', '{}', '{"version":2,"key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}', '{"version":1,"key":"invalid"}', 'x'.repeat(4097)])('rejects a malformed key file without rewriting it (%#)', async value => {
    const { store, root } = await setup()
    await mkdir(root)
    await writeFile(join(root, 'key.json'), value)
    await expect(store.initialize()).rejects.toThrow('密钥文件无效')
    expect(await readFile(join(root, 'key.json'), 'utf8')).toBe(value)
  })

  it('rejects a nonregular key path', async () => {
    const { store, root } = await setup()
    await mkdir(join(root, 'key.json'), { recursive: true })
    await expect(store.initialize()).rejects.toThrow('密钥文件无效')
  })

  it.skipIf(process.platform === 'win32')('rejects symbolic-link key files and vault directories', async () => {
    const { store, root, directory } = await setup()
    await mkdir(root)
    const outside = join(directory, 'outside')
    await writeFile(outside, '{"version":1,"key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}')
    await symlink(outside, join(root, 'key.json'))
    await expect(store.initialize()).rejects.toThrow('密钥文件无效')
    await expect(lstat(join(root, 'initialized.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const linkedRoot = join(directory, 'linked-vault')
    await symlink(root, linkedRoot)
    await expect(new LocalSecretStorage(linkedRoot).initialize()).rejects.toThrow('符号链接')
  })

  it.skipIf(process.platform === 'win32')('restricts existing key and vault POSIX permissions', async () => {
    const { store, root } = await setup()
    await store.initialize()
    await chmod(root, 0o755)
    await chmod(join(root, 'key.json'), 0o644)
    await new LocalSecretStorage(root).initialize()
    expect((await lstat(root)).mode & 0o777).toBe(0o700)
    expect((await lstat(join(root, 'key.json'))).mode & 0o777).toBe(0o600)
  })
})
