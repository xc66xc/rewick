import { operationsTelemetry } from './operations-telemetry'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { sessionFault } from './session-fault'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SessionRecord } from '../../shared/types'
import { sessionRecordSchema, parseInput } from './validation'
import { SerialQueue, readJson, writeJsonAtomic } from './storage'
import type { SettingsStore } from './settings-store'

type Auth = () => ReturnType<SettingsStore['getConnectionSnapshot']>
type Crypto = ConstructorParameters<typeof SettingsStore>[1]
const draftSchema = z.object({ record: sessionRecordSchema, version: z.number().int().nonnegative(), mutationId: z.string().uuid(), next: sessionRecordSchema.optional(), blocked: z.enum(['record_changed', 'record_deleted', 'retry_limit']).optional(), attempts: z.number().int().nonnegative().optional(), retryAt: z.number().optional(), recoveryId: z.string().uuid().optional(), sourceId: z.string().optional(), sourceHash: z.string().optional() })
const journalSchema = z.object({ drafts: z.record(z.string(), draftSchema), versions: z.record(z.string(), z.number()), removed: z.array(z.string()) })
type Journal = z.infer<typeof journalSchema>
const historyRecordSchema = sessionRecordSchema.extend({ usedSeconds: z.number().int().nonnegative().nullish().transform(value => value ?? undefined) })
const responseSchema = z.object({ version: z.number(), record: historyRecordSchema })
const summarySchema = historyRecordSchema.extend({ interviewEnvironment: sessionRecordSchema.shape.interviewEnvironment.nullish().transform(value => value ?? undefined), segmentCount: z.number(), answerCount: z.number() })
function fingerprint(record: SessionRecord) { return createHash('sha256').update(JSON.stringify(record)).digest('hex') }
export class HistoryConflictError extends Error {
  constructor(readonly reason: 'record_changed' | 'record_deleted') { super(reason === 'record_changed' ? '服务器记录已变更，本地草稿已保留，请在会话记录中处理。' : '服务器记录已删除，本地草稿已保留，请在会话记录中处理。') }
}
export class ServerHistory {
  private readonly queue = new SerialQueue()
  private readonly path: string
  private timer: ReturnType<typeof setInterval> | undefined
  private syncing = false
  private readonly recoveries = new Map<string, Promise<string>>()
  private state = '已同步'
  constructor(root: string, private readonly crypto: Crypto, private readonly auth: Auth) { this.path = join(root, 'history-outbox.enc.json') }
  start() { if (!this.timer) this.timer = setInterval(() => { void this.flush().catch(() => undefined) }, 15000); void this.flush().catch(() => undefined) }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  status() { return this.state }
  private async request(path: string, body?: unknown, timeoutMs = 15000): Promise<unknown> {
    const snapshot = await this.auth()
    if (!snapshot.settings.platform?.authenticated) throw new Error('请先登录。')
    assertPlatformTransport(snapshot.settings.platform.baseUrl)
    const response = await fetch(`${snapshot.settings.platform.baseUrl}/api/v1/session-records${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${snapshot.secrets.platformAccessToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) {
      if (response.status === 401) throw await sessionFault(response, snapshot.secrets.platformAccessToken)
      await response.body?.cancel()
      if (response.status === 409 || response.status === 410) throw new HistoryConflictError(response.status === 409 ? 'record_changed' : 'record_deleted')
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
  async detail(id: string): Promise<SessionRecord> {
    try {
      return responseSchema.parse(await this.request(`/${encodeURIComponent(id)}`, undefined, 60000)).record
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error('会话详情加载超时，请检查网络后重试。服务器中的记录仍然保留。')
      }
      throw error
    }
  }
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
      this.state = this.journalStatus(journal)
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
      this.state = await this.queue.run(async () => this.journalStatus(await this.read()))
    } catch (error) { this.state = error instanceof Error ? error.message : '同步失败'; throw error }
    finally { this.syncing = false }
  }
  private async upload(id: string): Promise<void> {
    while (true) {
      const draft = await this.queue.run(async () => (await this.read()).drafts[id])
      if (!draft || draft.blocked || (draft.retryAt ?? 0) > Date.now()) return
      this.state = '保存中'
      await this.auth() // Verify this workspace still owns the authenticated account before recording a sync.
      const telemetry = operationsTelemetry()
      const observation = telemetry?.forRequest(draft.record.answers.at(-1)?.id, draft.record.interviewSessionId) ?? telemetry?.operation({ operationId: draft.mutationId, sessionId: draft.record.interviewSessionId })
      const sync = () => this.request(`/${encodeURIComponent(id)}`, {
        record: draft.record, version: draft.version, mutationId: draft.mutationId
      })
      let result: z.infer<typeof responseSchema>
      try { result = responseSchema.parse(telemetry ? await telemetry.measure(observation, 'session.sync', sync) : await sync()) }
      catch (error) {
        await this.queue.run(async () => {
          const journal = await this.read()
          const current = journal.drafts[id]
          if (!current || current.mutationId !== draft.mutationId) return
          if (error instanceof HistoryConflictError) current.blocked = error.reason
          else {
            current.attempts = (current.attempts ?? 0) + 1
            current.retryAt = Date.now() + Math.min(300000, 15000 * 2 ** (current.attempts - 1))
            if (current.attempts >= 5) current.blocked = 'retry_limit'
          }
          await this.write(journal)
        })
        throw error
      }
      await this.queue.run(async () => {
        const journal = await this.read()
        const current = journal.drafts[id]
        if (!current || current.mutationId !== draft.mutationId) return
        journal.versions[id] = result.version
        if (current.sourceId) {
          const source = journal.drafts[current.sourceId]
          if (source?.recoveryId === id) {
            if (fingerprint(source.next ?? source.record) === current.sourceHash) delete journal.drafts[current.sourceId]
            else delete source.recoveryId
          }
        }
        if (current.next) journal.drafts[id] = { record: current.next, version: result.version, mutationId: randomUUID() }
        else delete journal.drafts[id]
        await this.write(journal)
      })
    }
  }
  private journalStatus(journal: Journal) {
    const drafts = Object.values(journal.drafts)
    return drafts.some(draft => draft.blocked) ? '存在待处理的本地草稿，请前往会话记录处理' : drafts.length ? '待同步' : '已同步'
  }
  async drafts() {
    return this.queue.run(async () => Object.entries((await this.read()).drafts).filter(([, draft]) => draft.blocked && !draft.sourceId).map(([id, draft]) => ({ id, title: (draft.next ?? draft.record).title, createdAt: draft.record.createdAt, reason: draft.blocked! })))
  }
  async localDraft(id: string): Promise<SessionRecord> {
    return this.queue.run(async () => {
      const draft = (await this.read()).drafts[id]
      if (!draft) throw new Error('本地草稿不存在。')
      return draft.next ?? draft.record
    })
  }
  async retryDraft(id: string): Promise<void> {
    await this.queue.run(async () => {
      const journal = await this.read()
      const draft = journal.drafts[id]
      if (!draft || (draft.blocked && draft.blocked !== 'retry_limit')) throw new Error('冲突草稿只能导出或另存为新会话记录。')
      delete draft.blocked; delete draft.retryAt; draft.attempts = 0
      await this.write(journal)
    })
    await this.flushTarget(id, '草稿尚未确认同步，本地内容仍保留，请稍后重试。')
  }
  recoverDraft(id: string): Promise<string> {
    const existing = this.recoveries.get(id)
    if (existing) return existing
    const action = this.recoverCopy(id).finally(() => this.recoveries.delete(id))
    this.recoveries.set(id, action)
    return action
  }
  private async recoverCopy(id: string): Promise<string> {
    const copyId = await this.queue.run(async () => {
      const journal = await this.read()
      const source = journal.drafts[id]
      if (!source?.blocked) throw new Error('该草稿无需另存。')
      if (source.recoveryId && journal.drafts[source.recoveryId]) {
        const copy = journal.drafts[source.recoveryId]
        // Retrying the persisted mutation also covers a successful upload whose response was lost.
        if (copy.blocked && copy.blocked !== 'retry_limit') throw new Error('副本也发生冲突，请先导出草稿。')
        delete copy.blocked; delete copy.retryAt; copy.attempts = 0
        await this.write(journal)
        return source.recoveryId
      }
      const latest = source.next ?? source.record
      const copyId = randomUUID()
      source.recoveryId = copyId
      journal.drafts[copyId] = { record: { ...latest, id: copyId, title: `${latest.title}（草稿副本）` }, version: 0, mutationId: randomUUID(), sourceId: id, sourceHash: fingerprint(latest) }
      await this.write(journal)
      return copyId
    })
    // upload is serialized by the global flush, including background retries of a persisted copy.
    await this.flushTarget(copyId, '副本尚未确认同步，原草稿仍保留，请稍后重试。')
    return copyId
  }
  private async flushTarget(id: string, pendingMessage: string): Promise<void> {
    let failure: unknown
    try { await this.flush() } catch (error) { failure = error }
    // A global batch may fail on another record after this target was durably acknowledged.
    const pending = await this.queue.run(async () => Boolean((await this.read()).drafts[id]))
    if (pending) {
      if (failure) throw failure
      throw new Error(pendingMessage)
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
