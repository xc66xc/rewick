import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function readJson(path: string, maxBytes: number): Promise<unknown | undefined> {
  try {
    if ((await stat(path)).size > maxBytes) throw new Error('本地文件超过容量限制。')
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) throw new Error('本地数据文件无法解析，请先备份后检查文件。')
    throw error
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(value, null, 2), 'utf8')
      await file.sync()
    } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

export class SerialQueue {
  private pending: Promise<unknown> = Promise.resolve()
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.catch(() => undefined)
    return result
  }
}
