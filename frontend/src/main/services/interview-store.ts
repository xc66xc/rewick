import { environmentStampInputSchema, type EnvironmentStampInput } from '../../shared/environment-stamp'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { sessionFault } from './session-fault'
import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import type { EnvironmentInput, InterviewLibrary, ResumeInput, Settings, TargetInput } from '../../shared/types'
import { resolveInterviewSettings } from '../../shared/interview-settings'
import { environmentHotwordsSchema, environmentHotwordSourcesSchema, environmentInputSchema, environmentDetailSchema, interviewIdSchema, interviewLibrarySchema, resumeInputSchema, targetInputSchema } from './interview-validation'
import type { SettingsStore } from './settings-store'
import { SerialQueue } from './storage'
import { parseInput } from './validation'

type Kind = 'resumes' | 'targets' | 'environments'
export class InterviewStore {
  private readonly queue = new SerialQueue()
  private readonly stampPending = new Map<string, string>()
  private readonly pending = new Map<string, { id: string; mutationId: string }>()
  constructor(private readonly authentication: () => ReturnType<SettingsStore['getConnectionSnapshot']>) {}
  async list(): Promise<InterviewLibrary> { return interviewLibrarySchema.parse(await this.request('')) }
  async resume(id: string) { return resumeInputSchema.extend({ id: interviewIdSchema }).parse(await this.request(`/resumes/${encodeURIComponent(parseInput(interviewIdSchema, id))}`)) }
  async target(id: string) { return targetInputSchema.extend({ id: interviewIdSchema }).parse(await this.request(`/targets/${encodeURIComponent(parseInput(interviewIdSchema, id))}`)) }
  saveResume(input: ResumeInput) { return this.save('resumes', parseInput(resumeInputSchema, input)) }
  saveTarget(input: TargetInput) { return this.save('targets', parseInput(targetInputSchema, input)) }
  saveEnvironment(input: EnvironmentInput) { return this.save('environments', parseInput(environmentInputSchema, input)) }
  async saveEnvironmentStamp(input: EnvironmentStampInput): Promise<InterviewLibrary> {
    const value = parseInput(environmentStampInputSchema, input)
    const actor = await this.authentication()
    const token = actor.secrets.platformAccessToken
    if (!token || !actor.settings.platform?.authenticated) throw new Error('请先登录账户。')
    return this.queue.run(async () => {
      const key = `${createHash('sha256').update(token).digest('hex')}:${JSON.stringify(value)}`
      const mutationId = this.stampPending.get(key) ?? randomUUID()
      if (!this.stampPending.has(key) && this.stampPending.size >= 64) { const oldest = this.stampPending.keys().next().value; if (oldest) this.stampPending.delete(oldest) }
      this.stampPending.set(key, mutationId)
      const saved = environmentDetailSchema.parse(await this.request(`/environments/${encodeURIComponent(value.id)}/stamp`, { version: value.version, mutationId, stamp: value.stamp }, 15000, token))
      const library = await this.request('', undefined, 15000, token)
      const parsed = interviewLibrarySchema.parse(library)
      const index = parsed.environments.findIndex(environment => environment.id === value.id)
      if (index < 0) throw new Error('该环境已删除，请刷新环境列表。')
      if ((parsed.environments[index].version ?? 0) < (saved.version ?? 0)) parsed.environments[index] = saved
      this.stampPending.delete(key)
      return parsed
    })
  }
  async extractEnvironmentHotwords(input: Pick<EnvironmentInput, 'resumeId' | 'targetId' | 'referenceIds'>): Promise<string[]> {
    const sources = parseInput(environmentHotwordSourcesSchema, input)
    try {
      const response = await this.request('/hotwords/extract', sources, 60000)
      return z.object({ hotwords: environmentHotwordsSchema }).parse(response).hotwords
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error('专业术语提取超时，请稍后重试，或手动添加。')
      }
      throw error
    }
  }
  removeResume(id: string) { return this.remove('resumes', id) }
  removeTarget(id: string) { return this.remove('targets', id) }
  removeEnvironment(id: string) { return this.remove('environments', id) }
  activate(id: string): Promise<InterviewLibrary> {
    return this.queue.run(async () => { await this.request(`/environments/${encodeURIComponent(parseInput(interviewIdSchema, id))}/activate`, {}); return this.list() })
  }
  async resolve(settings: Settings): Promise<Settings> { return resolveInterviewSettings(settings, await this.list()) }
  private save(kind: Kind, input: ResumeInput | TargetInput | EnvironmentInput): Promise<InterviewLibrary> {
    return this.queue.run(async () => {
      const { id, version, bodyLoaded: _bodyLoaded, ...content } = input
      const key = `${kind}:${JSON.stringify(input)}`
      const mutation = this.pending.get(key) ?? { id: id ?? randomUUID(), mutationId: randomUUID() }
      this.pending.set(key, mutation)
      const saved = await this.request(`/${kind}/${encodeURIComponent(mutation.id)}`, { version: version ?? 0, mutationId: mutation.mutationId, content })
      const library = await this.list()
      const rows = library[kind] as unknown[]
      const index = rows.findIndex(value => (value as { id: string }).id === mutation.id)
      if (index >= 0) rows[index] = saved
      const parsed = interviewLibrarySchema.parse(library)
      this.pending.delete(key)
      return parsed
    })
  }
  private remove(kind: Kind, id: string): Promise<InterviewLibrary> {
    return this.queue.run(async () => { await this.request(`/${kind}/${encodeURIComponent(parseInput(interviewIdSchema, id))}/delete`, {}); return this.list() })
  }
  private async request(path: string, body?: unknown, timeoutMs = 15000, expectedToken?: string): Promise<unknown> {
    const auth = await this.authentication()
    const token = auth.secrets.platformAccessToken
    if (expectedToken && token !== expectedToken) throw new Error('账户登录状态已变化，请刷新后重试。')
    if (!token || !auth.settings.platform?.authenticated) throw new Error('请先登录账户。')
    assertPlatformTransport(auth.settings.platform.baseUrl)
    const response = await fetch(`${auth.settings.platform.baseUrl}/api/v1/background${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status === 401) throw await sessionFault(response, token)
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      if (reader) while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 2 * 1_048_576) throw new Error('背景资料响应超过容量限制。')
        chunks.push(chunk.value)
      }
    } finally { await reader?.cancel().catch(() => undefined); reader?.releaseLock() }
    const latest = await this.authentication()
    if (latest.secrets.platformAccessToken !== token) throw new Error('账户登录状态已变化，请刷新后重试。')
    const raw = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown : undefined
    if (!response.ok) {
      const error = raw as { message?: unknown; error?: { message?: unknown } } | undefined
      const message = error?.message ?? error?.error?.message
      if (response.status === 409) throw new Error(`${typeof message === 'string' ? message : '环境已被其他设备修改'}，请刷新环境后重试。`)
      throw new Error(typeof message === 'string' && message.length <= 2000 ? message : `背景资料请求失败（HTTP ${response.status}），请刷新后重试。`)
    }
    return raw
  }
}
