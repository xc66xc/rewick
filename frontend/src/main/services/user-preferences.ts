import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ServiceKind, Settings, SettingsInput } from '../../shared/types'
import type { SettingsStore } from './settings-store'
import { PlatformClient } from './platform-client'
const kinds: ServiceKind[] = ['llm', 'asr']
const choice = z.string().min(1).max(200).nullable()
export const userPreferencesSchema = z.object({
  version: z.number().int().nonnegative(),
  preferences: z.object({ answerStyle: z.enum(['concise', 'detailed']), temperature: z.number().min(0).max(2), silenceMs: z.number().int().min(200).max(6000),
    autoAnswer: z.object({ enabled: z.boolean(), pauseMs: z.number().int().min(1000).max(5000) }), retrievalEnabled: z.boolean(),
    webSearchEnabled: z.boolean().default(false),
    platformSelections: z.object({ llm: choice, asr: choice }) }),
  unavailableSelections: z.array(z.enum(['llm', 'asr'])),
})
type State = z.infer<typeof userPreferencesSchema>
export class UserPreferencesClient {
  private cached: State | undefined
  private reading: Promise<State> | undefined
  private generation = 0
  private pending: { key: string; mutationId: string } | undefined
  constructor(private readonly auth: () => ReturnType<SettingsStore['getConnectionSnapshot']>) {}
  reset() { this.generation++; this.cached = undefined; this.reading = undefined; this.pending = undefined }
  async load(refresh = false): Promise<State> {
    if (!refresh && this.cached) return structuredClone(this.cached)
    if (this.reading) return this.reading
    const generation = this.generation
    const request = this.request().then(value => {
      if (generation !== this.generation) throw new Error('账户已切换，请重新读取设置。')
      if (!this.cached || value.version >= this.cached.version) this.cached = value
      return structuredClone(this.cached)
    }).finally(() => { if (this.reading === request) this.reading = undefined })
    this.reading = request
    return request
  }
  async merge(local: Settings): Promise<Settings> {
    const state = await this.load()
    const value = state.preferences
    const serviceSelections: Settings['serviceSelections'] = {}
    for (const kind of kinds) {
      const own = local.serviceSelections?.[kind]
      const platformId = value.platformSelections[kind]
      if (own?.source === 'custom') serviceSelections[kind] = own
      else if (platformId) serviceSelections[kind] = { source: 'platform', id: platformId }
    }
    return { ...local, preferencesVersion: state.version, serviceSelections,
      unavailablePlatformSelections: Object.fromEntries(state.unavailableSelections.map(kind => [kind, value.platformSelections[kind]])),
      answerStyle: value.answerStyle, autoAnswer: { ...value.autoAnswer }, retrieval: { enabled: value.retrievalEnabled },
      webSearch: { enabled: value.webSearchEnabled },
      llm: { ...local.llm, temperature: value.temperature }, asr: { ...local.asr, silenceMs: value.silenceMs } }
  }
  async save(input: SettingsInput): Promise<void> {
    if (input.preferencesVersion === undefined) throw new Error('请先读取服务器设置，再保存。')
    const previous = await this.load()
    const platformSelections = { ...previous.preferences.platformSelections }
    for (const kind of kinds) {
      const selection = input.serviceSelections?.[kind]
      // Choosing a custom service changes only this device; keep the account's platform choice.
      if (selection?.source === 'platform') platformSelections[kind] = selection.id || null
      else if (!selection) platformSelections[kind] = null
    }
    const preferences: State['preferences'] = { answerStyle: input.answerStyle, temperature: input.llm.temperature, silenceMs: input.asr.silenceMs,
      autoAnswer: input.autoAnswer, retrievalEnabled: input.retrieval.enabled, webSearchEnabled: input.webSearch?.enabled ?? previous.preferences.webSearchEnabled, platformSelections }
    const key = JSON.stringify({ version: input.preferencesVersion, preferences })
    if (this.pending?.key !== key) this.pending = { key, mutationId: randomUUID() }
    const generation = this.generation
    const result = await this.request({ version: input.preferencesVersion, mutationId: this.pending.mutationId, preferences })
    if (generation !== this.generation) throw new Error('账户已切换，请重新读取设置。')
    this.cached = result
  }
  private async request(body?: unknown): Promise<State> {
    const before = await this.auth()
    if (!before.settings.platform?.authenticated) throw new Error('请先登录账户。')
    const token = before.secrets.platformAccessToken
    const result = await new PlatformClient(before.settings.platform.baseUrl).walletRequest('/api/v1/user-preferences', token, body)
    const after = await this.auth()
    if (after.secrets.platformAccessToken !== token) throw new Error('登录状态已变化，请重新读取设置。')
    return userPreferencesSchema.parse(result)
  }
}
