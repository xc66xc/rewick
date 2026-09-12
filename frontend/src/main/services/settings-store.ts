import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defaultSettings } from '../../shared/defaults'
import type { CustomServiceInput, PlatformInfo, Settings, SettingsInput } from '../../shared/types'
import { profileSettings, profileView, serviceKinds, storedCustomServiceSchema, validateCustomDraft } from './custom-service-profiles'
import { parseInput, remoteKnowledgeSettingsSchema, settingsInputSchema } from './validation'
import { platformSessionSchema } from './platform-schema'
import { readJson, SerialQueue, writeJsonAtomic } from './storage'

interface SecretStorage {
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  isEncryptionAvailable(): boolean
}
const persistedSchema = z.object({
  version: z.literal(1), settings: settingsInputSchema,
  customServices: z.array(storedCustomServiceSchema).max(100).default([]),
  serviceProfilesInitialized: z.boolean().default(false),
  platformSession: platformSessionSchema.optional(),
  rememberedLogin: z.string().max(16_384).optional(),
  secrets: z.object({ asr: z.string().max(16_384), llm: z.string().max(16_384), remoteKnowledge: z.string().max(16_384).default(''), platformAccessToken: z.string().max(16_384).default('') }),
})
type Persisted = z.infer<typeof persistedSchema>
export interface ServiceSecrets { platformAccessToken: string; asrApiKey: string; llmApiKey: string; remoteKnowledgeApiKey: string }

export class SettingsStore {
  private readonly path: string
  private readonly queue = new SerialQueue()
  constructor(rootDir: string, private readonly crypto: SecretStorage) {
    this.path = join(rootDir, 'settings.json')
  }

  getSettings(): Promise<Settings> {
    return this.queue.run(async () => this.publicSettings(await this.read()))
  }

  getRememberedLogin(): Promise<{ identifier: string; password: string } | null> {
    return this.queue.run(async () => {
      const saved = await this.read()
      if (!saved.rememberedLogin) return null
      return parseInput(z.object({ identifier: z.string(), password: z.string() }), JSON.parse(this.decrypt(saved.rememberedLogin)))
    })
  }

  saveRememberedLogin(credentials: { identifier: string; password: string } | null): Promise<void> {
    return this.queue.run(async () => {
      const saved = await this.read()
      const rememberedLogin = credentials ? this.encrypt(JSON.stringify(credentials), '') : undefined
      await writeJsonAtomic(this.path, { ...saved, rememberedLogin })
    })
  }

  initializeServices(): Promise<void> {
    return this.queue.run(async () => {
      const saved = await this.read()
      if (saved.serviceProfilesInitialized) return
      const { llm, asr, remoteKnowledge } = saved.settings
      const candidates = [
        { id: 'legacy-llm', kind: 'llm' as const, name: llm.model, url: llm.baseUrl, model: llm.model, secret: saved.secrets.llm },
        { id: 'legacy-asr', kind: 'asr' as const, name: asr.model, url: asr.url, model: asr.model, secret: saved.secrets.asr },
        { id: 'legacy-knowledge', kind: 'knowledge' as const, name: '我的百炼知识库', url: remoteKnowledge.url, agentId: remoteKnowledge.agentId, secret: saved.secrets.remoteKnowledge },
      ].filter(value => value.secret || (['llm', 'asr'].includes(value.kind) && /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(new URL(value.url).hostname)))
      const selections = { ...saved.settings.serviceSelections }
      for (const profile of candidates) {
        if (!saved.customServices.some(value => value.id === profile.id)) saved.customServices.push(profile)
        selections[profile.kind] ??= { source: 'custom', id: profile.id }
      }
      saved.settings.serviceSelections = selections
      saved.settings.platform.enabled = true
      saved.serviceProfilesInitialized = true
      await writeJsonAtomic(this.path, saved)
    })
  }

  saveCustomService(input: CustomServiceInput): Promise<Settings> {
    return this.queue.run(async () => {
      const saved = await this.read()
      const previous = saved.customServices.find(value => value.id === input.id)
      const { apiKey, ...parsed } = validateCustomDraft(input, previous)
      if (!previous && saved.customServices.length >= 100) throw new Error('最多保存 100 项自定义服务，请先移除不再使用的配置。')
      const profile = { ...parsed, id: previous?.id ?? randomUUID(), secret: this.encrypt(apiKey, previous?.secret ?? '') }
      saved.customServices = [...saved.customServices.filter(value => value.id !== profile.id), profile]
      saved.settings.serviceSelections = { ...saved.settings.serviceSelections, [profile.kind]: { source: 'custom', id: profile.id } }
      await writeJsonAtomic(this.path, saved)
      return this.publicSettings(saved)
    })
  }

  customServiceConnection(input: CustomServiceInput): Promise<{ settings: Settings; apiKey: string }> {
    return this.queue.run(async () => {
      const saved = await this.read()
      const previous = saved.customServices.find(value => value.id === input.id)
      const parsed = validateCustomDraft(input, previous)
      const apiKey = parsed.apiKey ?? this.decrypt(previous?.secret ?? '')
      return { settings: profileSettings(this.publicSettings(saved), { ...parsed, id: parsed.id ?? 'draft', hasApiKey: Boolean(apiKey) }), apiKey }
    })
  }

  removeCustomService(id: string): Promise<Settings> {
    return this.queue.run(async () => {
      const saved = await this.read()
      saved.customServices = saved.customServices.filter(value => value.id !== id)
      const legacySecret = { 'legacy-llm': 'llm', 'legacy-asr': 'asr', 'legacy-knowledge': 'remoteKnowledge' } as const
      if (id in legacySecret) saved.secrets[legacySecret[id as keyof typeof legacySecret]] = ''
      // Preserve a missing selection so removal never silently switches a paid provider.
      await writeJsonAtomic(this.path, saved)
      return this.publicSettings(saved)
    })
  }

  /** Read endpoints and their credentials together so concurrent edits cannot mix revisions. */
  getConnectionSnapshot(): Promise<{ settings: Settings; secrets: ServiceSecrets }> {
    return this.queue.run(async () => {
      const saved = await this.read()
      return { settings: this.publicSettings(saved), secrets: this.privateSecrets(saved) }
    })
  }

  saveSettings(input: SettingsInput): Promise<Settings> {
    return this.queue.run(async () => {
      const parsed = parseInput(settingsInputSchema, input)
      const previous = await this.read()
      parsed.serviceSelections ??= previous.settings.serviceSelections
      for (const kind of serviceKinds) {
        const choice = parsed.serviceSelections?.[kind]
        if (choice?.source === 'custom' && !previous.customServices.some(profile => profile.id === choice.id && profile.kind === kind)
          && previous.settings.serviceSelections?.[kind]?.id !== choice.id) throw new Error('所选自定义服务不存在，请重新选择。')
      }
      if (parsed.platform.baseUrl !== previous.settings.platform.baseUrl) delete parsed.platform.selectedModelId
      // Explicit selections belong to the submitted catalog; only discard inherited selections on address changes.
      if (parsed.platform.baseUrl !== previous.settings.platform.baseUrl && input.serviceSelections === undefined && parsed.serviceSelections) {
        for (const kind of serviceKinds) if (parsed.serviceSelections[kind]?.source === 'platform') delete parsed.serviceSelections[kind]
      }
      const { apiKey: asrKey, ...asr } = parsed.asr
      const { apiKey: llmKey, ...llm } = parsed.llm
      const { apiKey: remoteKnowledgeKey, ...remoteKnowledge } = parsed.remoteKnowledge
      const next: Persisted = {
        customServices: previous.customServices, serviceProfilesInitialized: previous.serviceProfilesInitialized,
        version: 1, settings: { ...parsed, asr, llm, remoteKnowledge },
        rememberedLogin: parsed.platform.baseUrl === previous.settings.platform.baseUrl ? previous.rememberedLogin : undefined,
        platformSession: parsed.platform.baseUrl === previous.settings.platform.baseUrl ? previous.platformSession : undefined,
        secrets: {
          platformAccessToken: parsed.platform.baseUrl === previous.settings.platform.baseUrl ? previous.secrets.platformAccessToken : '',
          asr: this.encrypt(asrKey, previous.secrets.asr),
          llm: this.encrypt(llmKey, previous.secrets.llm),
          remoteKnowledge: this.encrypt(remoteKnowledgeKey, previous.secrets.remoteKnowledge),
        },
      }
      if (remoteKnowledge.enabled && next.secrets.remoteKnowledge && parsed.serviceSelections?.knowledge?.source !== 'platform') parseInput(remoteKnowledgeSettingsSchema, remoteKnowledge)
      if (remoteKnowledge.enabled && !parsed.platform.enabled && !next.secrets.remoteKnowledge) throw new Error('启用远程知识库前请填写远程知识库 API Key。')
      await writeJsonAtomic(this.path, next)
      return this.publicSettings(next)
    })
  }

  savePlatformSession(baseUrl: string, accessToken: string, expiresAt: string, info: PlatformInfo, expectedToken?: string): Promise<Settings> {
    return this.queue.run(async () => {
      const saved = await this.read()
      if (saved.settings.platform.baseUrl !== baseUrl || !saved.settings.platform.enabled) throw new Error('平台设置已改变，请重新登录。')
      if (expectedToken !== undefined && this.decrypt(saved.secrets.platformAccessToken) !== expectedToken) throw new Error('平台登录已改变，请重试。')
      if (!accessToken || accessToken.length > 4096 || /\s/.test(accessToken)) throw new Error('平台凭证格式无效。')
      const platformSession = parseInput(platformSessionSchema, { expiresAt, info })
      if (Date.parse(expiresAt) <= Date.now()) throw new Error('平台登录已过期，请重新登录。')
      const next = { ...saved, platformSession, secrets: { ...saved.secrets, platformAccessToken: this.encrypt(accessToken, '') } }
      await writeJsonAtomic(this.path, next)
      return this.publicSettings(next)
    })
  }

  clearPlatformSession(expectedToken?: string): Promise<Settings> {
    return this.queue.run(async () => {
      const saved = await this.read()
      if (expectedToken !== undefined && this.decrypt(saved.secrets.platformAccessToken) !== expectedToken) return this.publicSettings(saved)
      const next = { ...saved, platformSession: undefined, secrets: { ...saved.secrets, platformAccessToken: '' } }
      await writeJsonAtomic(this.path, next)
      return this.publicSettings(next)
    })
  }

  getSecrets(): Promise<ServiceSecrets> {
    return this.queue.run(async () => this.privateSecrets(await this.read()))
  }

  private privateSecrets(saved: Persisted): ServiceSecrets {
    const { secrets } = saved
    const secretFor = (kind: typeof serviceKinds[number], legacy: string): string => {
      const choice = saved.settings.serviceSelections?.[kind]
      if (!choice) return this.decrypt(legacy)
      if (choice.source === 'platform') return ''
      return this.decrypt(saved.customServices.find(value => value.id === choice.id && value.kind === kind)?.secret ?? '')
    }
    return { platformAccessToken: this.decrypt(secrets.platformAccessToken), asrApiKey: secretFor('asr', secrets.asr), llmApiKey: secretFor('llm', secrets.llm), remoteKnowledgeApiKey: secretFor('knowledge', secrets.remoteKnowledge) }
  }

  private async read(): Promise<Persisted> {
    const saved = await readJson(this.path, 1_048_576)
    if (saved === undefined) {
      return { version: 1, customServices: [], serviceProfilesInitialized: false, settings: parseInput(settingsInputSchema, defaultSettings), secrets: { asr: '', llm: '', remoteKnowledge: '', platformAccessToken: '' } }
    }
    const parsed = persistedSchema.safeParse(saved)
    if (!parsed.success) throw new Error('本地设置文件格式无效，请先备份后检查 settings.json。')
    // Never accept plaintext secrets from a manually altered settings file.
    delete parsed.data.settings.asr.apiKey
    delete parsed.data.settings.llm.apiKey
    delete parsed.data.settings.remoteKnowledge.apiKey
    return parsed.data
  }

  private publicSettings(value: Persisted): Settings {
    const { asr, llm, remoteKnowledge, context, interviewTarget, retrieval, answerStyle, autoAnswer } = value.settings
    const authenticated = Boolean(value.secrets.platformAccessToken && value.platformSession && Date.parse(value.platformSession.expiresAt) > Date.now())
    const info = authenticated ? value.platformSession?.info : undefined
    let result: Settings = {
      customServices: value.customServices.map(profileView), serviceSelections: value.settings.serviceSelections,
      platform: { ...value.settings.platform, authenticated, user: info?.user, expiresAt: value.platformSession?.expiresAt, capabilities: info?.capabilities ?? { llm: false, asr: false, knowledge: false }, models: info?.models ?? { llm: '', asr: '' }, services: info?.services, limits: info?.limits },
      asr: { url: asr.url, model: asr.model, silenceMs: asr.silenceMs, hasApiKey: Boolean(value.secrets.asr) },
      llm: { baseUrl: llm.baseUrl, model: llm.model, temperature: llm.temperature, hasApiKey: Boolean(value.secrets.llm) },
      remoteKnowledge: { ...remoteKnowledge, hasApiKey: Boolean(value.secrets.remoteKnowledge) },
      context, interviewTarget, retrieval, answerStyle, autoAnswer,
    }
    for (const kind of serviceKinds) {
      const choice = value.settings.serviceSelections?.[kind]
      const profile = choice?.source === 'custom' ? value.customServices.find(item => item.id === choice.id && item.kind === kind) : undefined
      if (profile) result = profileSettings(result, profileView(profile))
      else if (choice?.source === 'custom') {
        if (kind === 'knowledge') result.remoteKnowledge.hasApiKey = false
        else result[kind].hasApiKey = false
      }
    }
    return result
  }

  private encrypt(value: string | undefined, previous: string): string {
    if (value === undefined) return previous
    if (value === '') return ''
    if (!this.crypto.isEncryptionAvailable()) throw new Error('系统安全存储不可用，暂时无法保存 API Key。请检查 macOS 钥匙串。')
    return this.crypto.encryptString(value).toString('base64')
  }

  private decrypt(value: string): string {
    if (!value) return ''
    if (!this.crypto.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取 API Key。请检查 macOS 钥匙串。')
    try { return this.crypto.decryptString(Buffer.from(value, 'base64')) }
    catch { throw new Error('无法解密已保存的 API Key，请在设置中重新填写。') }
  }
}
