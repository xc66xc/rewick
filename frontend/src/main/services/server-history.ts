import { assertPlatformTransport } from '../../shared/platform-transport'
import { sessionFault } from './session-fault'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SessionRecord } from '../../shared/types'
import { sessionRecordSchema, parseInput } from './validation'
import { SerialQueue, readJson, writeJsonAtomic } from './storage'
import type { SettingsStore } from './settings-store'

type Auth = () => ReturnType<SettingsStore['getConnectionSnapshot']>
type Crypto = ConstructorParameters<typeof SettingsStore>[1]
const draftSchema = z.object({ record: sessionRecordSchema, version: z.number().int().nonnegative(), mutationId: z.string().uuid(), next: sessionRecordSchema.optional() })
const journalSchema = z.object({ drafts: z.record(z.string(), draftSchema), versions: z.record(z.string(), z.number()), removed: z.array(z.string()) })
type Journal = z.infer<typeof journalSchema>
const responseSchema = z.object({ version: z.number(), record: sessionRecordSchema })
const summarySchema = sessionRecordSchema.extend({ interviewEnvironment: sessionRecordSchema.shape.interviewEnvironment.nullish().transform(value => value ?? undefined), segmentCount: z.number(), answerCount: z.number() })
export class ServerHistory {
  private readonly queue = new SerialQueue()
  private readonly path: string
  private timer: ReturnType<typeof setInterval> | undefined
  private syncing = false
  private state = '已同步'
  constructor(root: string, private readonly crypto: Crypto, private readonly auth: Auth) { this.path = join(root, 'history-outbox.enc.json') }
  start() { if (!this.timer) this.timer = setInterval(() => { void this.flush().catch(() => undefined) }, 15000); void this.flush().catch(() => undefined) }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  status() { return this.state }
  private async request(path: string, body?: unknown): Promise<unknown> {
    const snapshot = await this.auth()
    if (!snapshot.settings.platform?.authenticated) throw new Error('请先登录。')
    assertPlatformTransport(snapshot.settings.platform.baseUrl)
    const response = await fetch(`${snapshot.settings.platform.baseUrl}/api/v1/session-records${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${snapshot.secrets.platformAccessToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) {
      if (response.status === 401) throw await sessionFault(response, snapshot.secrets.platformAccessToken)
      await response.body?.cancel()
      if (response.status === 409 || response.status === 410) throw new Error('记录已变更或删除，待上传草稿已保留，不能覆盖服务器记录。')
      throw new Error(`会话服务请求失败（${response.status}），待上传内容保留在本机。`)
    }
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 5 * 1048576) throw new Error('会话响应超过容量限制。')
        chunks.push(chunk.value)
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
    await this.auth()
    const text = Buffer.concat(chunks).toString('utf8')
    if (text.length > 5 * 1048576) throw new Error('会话响应超过容量限制。')
    return text ? JSON.parse(text) : undefined
  }
  async page(cursor?: number) {
    return z.object({ records: z.array(summarySchema), nextCursor: z.number().nullable() }).parse(await this.request(cursor ? `?cursor=${cursor}` : ''))
  }
  async list(): Promise<SessionRecord[]> { return (await this.page()).records }
  async detail(id: string): Promise<SessionRecord> { return responseSchema.parse(await this.request(`/${encodeURIComponent(id)}`)).record }
  async save(record: SessionRecord): Promise<void> {
    await this.saveDraft(record)
    void this.flush().catch(() => undefined)
  }
  async saveDraft(record: SessionRecord): Promise<void> {
    await this.queue.run(async () => {
      const value = parseInput(sessionRecordSchema, record)
      if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1048576) throw new Error('单次会话超过 4 MiB，请新建会话。')
      const journal = await this.read()
      if (journal.removed.includes(value.id)) return
      const previous = journal.drafts[value.id]
      journal.drafts[value.id] = previous ? { ...previous, next: value } : { record: value, version: journal.versions[value.id] ?? 0, mutationId: randomUUID() }
      await this.write(journal)
      this.state = '待同步'
    })
  }
  async remove(id: string): Promise<void> {
    await this.request(`/${encodeURIComponent(id)}/delete`, {})
    await this.queue.run(async () => {
      const journal = await this.read()
      delete journal.drafts[id]; delete journal.versions[id]
      if (!journal.removed.includes(id)) journal.removed.push(id)
      await this.write(journal)
    })
  }
  async flush(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      const ids = await this.queue.run(async () => Object.keys((await this.read()).drafts))
      let failure: unknown
      for (const id of ids) {
        try { await this.upload(id) } catch (error) { failure = error }
      }
      if (failure) throw failure
      const pending = await this.queue.run(async () => Object.keys((await this.read()).drafts).length)
      this.state = pending ? '待同步' : '已同步'
    } catch (error) { this.state = error instanceof Error ? error.message : '同步失败'; throw error }
    finally { this.syncing = false }
  }
  private async upload(id: string): Promise<void> {
    while (true) {
      const draft = await this.queue.run(async () => (await this.read()).drafts[id])
      if (!draft) return
      this.state = '保存中'
      const result = responseSchema.parse(await this.request(`/${encodeURIComponent(id)}`, {
        record: draft.record, version: draft.version, mutationId: draft.mutationId
      }))
      await this.queue.run(async () => {
        const journal = await this.read()
        const current = journal.drafts[id]
        if (!current || current.mutationId !== draft.mutationId) return
        journal.versions[id] = result.version
        if (current.next) journal.drafts[id] = { record: current.next, version: result.version, mutationId: randomUUID() }
        else delete journal.drafts[id]
        await this.write(journal)
      })
    }
  }
  private async read(): Promise<Journal> {
    const raw = await readJson(this.path, 220 * 1048576)
    if (raw === undefined) return { drafts: {}, versions: {}, removed: [] }
    const encoded = z.string().parse(raw)
    return journalSchema.parse(JSON.parse(this.crypto.decryptString(Buffer.from(encoded, 'base64'))))
  }
  private async write(journal: Journal) {
    if (!this.crypto.isEncryptionAvailable()) throw new Error('系统加密不可用，无法保存待上传会话。')
    await writeJsonAtomic(this.path, this.crypto.encryptString(JSON.stringify(journal)).toString('base64'))
  }
}
