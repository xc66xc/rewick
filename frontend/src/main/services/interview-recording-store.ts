import { createHash } from 'node:crypto'
import { copyFile, mkdir, open, stat, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecordingInfo } from '../../shared/recording-types'

const MAX_BYTES = 4 * 60 * 60 * 32_000
const MAX_CHUNK = 320_000
const header = (bytes: number): Buffer => {
  const value = Buffer.alloc(44)
  value.write('RIFF', 0); value.writeUInt32LE(bytes + 36, 4); value.write('WAVEfmt ', 8)
  value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22)
  value.writeUInt32LE(16_000, 24); value.writeUInt32LE(32_000, 28)
  value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34)
  value.write('data', 36); value.writeUInt32LE(bytes, 40)
  return value
}
interface ActiveRecording { file: FileHandle; bytes: number; sessionId: string }

/** PCM is accepted only in bounded acknowledged chunks; no renderer-controlled paths. */
export class InterviewRecordingStore {
  private readonly active = new Map<string, ActiveRecording>()
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly pendingWrites = new Set<string>()
  private starting = false
  private closing: Promise<void> | null = null
  constructor(private readonly root: string) {}

  private path(owner: string, sessionId: string): string {
    if (!owner || !/^[a-zA-Z0-9_-]{1,160}$/.test(sessionId)) throw new Error('录音会话无效。')
    return join(this.root, createHash('sha256').update(owner).digest('hex'), `${sessionId}.wav`)
  }

  private serial<T>(path: string, task: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(path) ?? Promise.resolve()).catch(() => {}).then(task)
    this.queues.set(path, result)
    void result.finally(() => { if (this.queues.get(path) === result) this.queues.delete(path) }).catch(() => {})
    return result
  }

  async start(owner: string, sessionId: string): Promise<void> {
    const path = this.path(owner, sessionId)
    if (this.closing || this.starting || this.active.size) throw new Error('已有录音进行中，请先停止。')
    this.starting = true
    return this.serial(path, async () => {
      if (this.active.has(path)) throw new Error('录音已经开始。')
      await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
      try {
        const existing = await stat(path)
        if (existing.size === 44) {
          await unlink(path)
          await unlink(path + '.interrupted').catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          })
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const file = await open(path, 'wx', 0o600)
      try { await file.write(header(0), 0, 44, 0) } catch (error) { await file.close(); throw error }
      this.active.set(path, { file, bytes: 0, sessionId })
    }).finally(() => { this.starting = false })
  }

  async append(owner: string, sessionId: string, audio: ArrayBuffer): Promise<void> {
    const path = this.path(owner, sessionId)
    if (!(audio instanceof ArrayBuffer) || audio.byteLength === 0 || audio.byteLength > MAX_CHUNK || audio.byteLength % 2) {
      throw new Error('录音数据格式或大小无效。')
    }
    // Reject concurrent writes rather than retaining unbounded buffers from IPC callers.
    if (this.pendingWrites.has(path)) throw new Error('请等待上一段录音保存完成。')
    this.pendingWrites.add(path)
    return this.serial(path, async () => {
      const active = this.active.get(path)
      if (!active) throw new Error('录音尚未开始。')
      if (active.bytes + audio.byteLength > MAX_BYTES) throw new Error('录音已达到 4 小时上限。')
      const data = Buffer.from(audio)
      let offset = 0
      while (offset < data.length) {
        const result = await active.file.write(data, offset, data.length - offset, 44 + active.bytes + offset)
        if (!result.bytesWritten) throw new Error('录音写入失败，请检查磁盘空间。')
        offset += result.bytesWritten
      }
      active.bytes += data.length
    }).finally(() => { this.pendingWrites.delete(path) })
  }

  async stop(owner: string, sessionId: string): Promise<RecordingInfo> {
    const path = this.path(owner, sessionId)
    return this.serial(path, async () => {
      const active = this.active.get(path)
      if (active) {
        try {
          await active.file.write(header(active.bytes), 0, 44, 0)
          await active.file.sync()
        } finally { await active.file.close(); this.active.delete(path) }
      }
      const info = await this.readInfo(path, sessionId)
      if (!info) throw new Error('找不到本机录音。')
      return info
    })
  }

  private async readInfo(path: string, sessionId: string): Promise<RecordingInfo | null> {
    let size: number
    try { size = (await stat(path)).size } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    if (size < 44 || size - 44 > MAX_BYTES) throw new Error('录音文件不完整或超出大小限制。')
    const bytes = size - 44
    const active = this.active.get(path)
    if (active) return { sessionId, status: 'recording', durationSeconds: bytes / 32_000, bytes }
    const file = await open(path, 'r+')
    try {
      const saved = Buffer.alloc(44)
      await file.read(saved, 0, 44, 0)
      if (saved.toString('ascii', 0, 4) !== 'RIFF' || saved.toString('ascii', 8, 16) !== 'WAVEfmt ' || saved.readUInt32LE(16) !== 16 || saved.readUInt16LE(20) !== 1 || saved.readUInt16LE(22) !== 1 || saved.readUInt32LE(24) !== 16000 || saved.readUInt32LE(28) !== 32000 || saved.readUInt16LE(32) !== 2 || saved.readUInt16LE(34) !== 16 || saved.toString('ascii', 36, 40) !== 'data') throw new Error('录音文件格式无效。')
      const interrupted = saved.readUInt32LE(40) !== bytes
      if (interrupted) {
        const aligned = bytes - bytes % 2
        await file.truncate(44 + aligned)
        await file.write(header(aligned), 0, 44, 0)
        await file.sync()
        await open(`${path}.interrupted`, 'a', 0o600).then(handle => handle.close())
      }
      let recovered = interrupted
      try { await stat(`${path}.interrupted`); recovered = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      return { sessionId, status: recovered ? 'interrupted' : 'saved', durationSeconds: Math.floor(bytes / 2) / 16_000, bytes: bytes - bytes % 2 }
    } finally { await file.close() }
  }

  async info(owner: string, sessionId: string): Promise<RecordingInfo | null> {
    const path = this.path(owner, sessionId)
    return this.serial(path, () => this.readInfo(path, sessionId))
  }

  async audioPath(owner: string, sessionId: string): Promise<string> {
    const info = await this.info(owner, sessionId)
    if (!info || info.status === 'recording' || !info.bytes) throw new Error('请先结束并保存录音。')
    return this.path(owner, sessionId)
  }

  async remove(owner: string, sessionId: string): Promise<void> {
    const path = this.path(owner, sessionId)
    return this.serial(path, async () => {
      if (this.active.has(path)) throw new Error('请先停止录音。')
      for (const file of [path, `${path}.interrupted`]) {
        try { await unlink(file) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
    })
  }

  async exportFile(owner: string, sessionId: string, destination: string): Promise<void> {
    const path = this.path(owner, sessionId)
    await this.serial(path, async () => {
      const info = await this.readInfo(path, sessionId)
      if (!info || info.status === 'recording' || !info.bytes) throw new Error('请先结束并保存录音。')
      await copyFile(path, destination)
    })
  }

  async closeAll(): Promise<void> {
    if (this.closing) return this.closing
    this.closing = (async () => {
      await Promise.allSettled([...this.queues.values()])
      await Promise.all([...this.active.keys()].map(path => this.serial(path, async () => {
        const active = this.active.get(path)
        if (!active) return
        try { await active.file.sync() } finally {
          await active.file.close()
          this.active.delete(path)
        }
      })))
    })()
    try { await this.closing } finally { this.closing = null }
  }
}
