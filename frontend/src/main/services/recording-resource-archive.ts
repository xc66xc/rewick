import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, posix, relative, sep } from 'node:path'
import { list, extract } from 'tar'

export interface RecordingResourceSpec {
  resourceId: string
  kind: 'runtime' | 'model'
  url: string
  sha256: string
  archiveBytes: number
  unpackedBytes: number
  maxEntries: number
  criticalFiles: { path: string; sha256: string; size: number }[]
}
export async function resourceHash(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk)
  return hash.digest('hex')
}
function archivePath(value: string): string {
  if (!value || value.length > 4096 || value.split('/').length > 64 || value.includes('\\') || value.includes('\0') || value.includes(':') || posix.isAbsolute(value)) throw new Error('语音资源包含不安全的归档路径。')
  const normalized = posix.normalize(value).replace(/\/$/, '')
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('语音资源包含越界归档路径。')
  return normalized
}
export async function extractResource(archive: string, destination: string, spec: RecordingResourceSpec, signal: AbortSignal): Promise<void> {
  const entries = new Map<string, string>()
  let bytes = 0
  let count = 0
  let invalid: Error | undefined
  await list({ file: archive, strict: true, onReadEntry: entry => {
    try {
      signal.throwIfAborted()
      const path = archivePath(entry.path)
      if (!['File', 'OldFile', 'Directory', 'SymbolicLink', 'Link'].includes(entry.type)) throw new Error('语音资源归档类型不受支持。')
      if (++count > spec.maxEntries || !Number.isSafeInteger(entry.size) || entry.size < 0 || (bytes += entry.size) > spec.unpackedBytes) throw new Error('语音资源解压大小超过限制。')
      if (entries.has(path.toLowerCase()) && !(entry.type === 'Directory' && entries.get(path.toLowerCase()) === 'Directory')) throw new Error('语音资源包含重复的归档路径。')
      entries.set(path.toLowerCase(), entry.type)
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
        const target = entry.linkpath
        if (!target || target.includes('\\') || target.includes(':') || posix.isAbsolute(target)) throw new Error('语音资源包含不安全的归档链接。')
        archivePath(entry.type === 'SymbolicLink' ? posix.join(posix.dirname(path), target) : target)
      }
    } catch (error) { invalid ??= error instanceof Error ? error : new Error('语音资源归档无效。') }
  } })
  if (invalid) throw invalid
  for (const path of entries.keys()) {
    let parent = posix.dirname(path)
    while (parent !== '.') {
      const type = entries.get(parent)
      if (type && type !== 'Directory') throw new Error('语音资源归档链接不能作为其他文件的父目录。')
      parent = posix.dirname(parent)
    }
  }
  signal.throwIfAborted()
  // All names/links were inspected before extracting; tar also rejects symlink traversal.
  await extract({ file: archive, cwd: destination, strict: true, preservePaths: false, noMtime: true,
    filter: () => !signal.aborted })
  signal.throwIfAborted()
}
export async function checkResourceFiles(root: string, spec: RecordingResourceSpec, full: boolean, signal?: AbortSignal): Promise<boolean> {
  try {
    const actualRoot = await realpath(root)
    for (const file of spec.criticalFiles) {
      signal?.throwIfAborted()
      const path = join(root, archivePath(file.path))
      const actual = await realpath(path)
      const within = relative(actualRoot, actual)
      if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return false
      const info = await lstat(actual)
      if (!info.isFile() || info.size === 0 || (file.size !== undefined && info.size !== file.size)) return false
      if (full && await resourceHash(actual, signal) !== file.sha256) return false
    }
    return spec.criticalFiles.length > 0
  } catch (error) { if (signal?.aborted) throw error; return false }
}
export async function makePythonExecutable(path: string): Promise<void> {
  if (process.platform !== 'win32') await chmod(path, 0o755)
}
