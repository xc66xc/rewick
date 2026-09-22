import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ProxyAgent } from 'undici'

// Build-time downloads only. Honor explicit proxy configuration and macOS system proxy.
let proxy = process.env.HTTPS_PROXY || process.env.https_proxy
if (!proxy && process.platform === 'darwin') {
  const state = spawnSync('scutil', ['--proxy'], { encoding: 'utf8' }).stdout ?? ''
  const enabled = /HTTPSEnable\s*:\s*1/.test(state)
  const host = state.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1]
  const port = state.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]
  if (enabled && host && port) proxy = `http://${host}:${port}`
}
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined

export async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function downloadVerified(url, destination, sha256) {
  try { if (await fileHash(destination) === sha256) return } catch {}
  await mkdir(dirname(destination), { recursive: true })
  const partial = `${destination}.part`
  try {
    const response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(900_000) })
    if (!response.ok || !response.body) throw new Error(`Resource download failed: HTTP ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    if (await fileHash(partial) !== sha256) throw new Error(`Resource checksum mismatch: ${destination}`)
    await rename(partial, destination)
  } finally { await rm(partial, { force: true }) }
}
