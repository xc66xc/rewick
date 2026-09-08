import { join } from 'node:path'
import { z } from 'zod'
import { defaultSettings } from '../../shared/defaults'
import type { PlatformInfo, Settings, SettingsInput } from '../../shared/types'
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
  platformSession: platformSessionSchema.optional(),
  secrets: z.object({ asr: z.string().max(16_384), llm: z.string().max(16_384), embedding: z.string().max(16_384).default(''), remoteKnowledge: z.string().max(16_384).default(''), platformAccessToken: z.string().max(16_384).default('') }),
})
type Persisted = z.infer<typeof persistedSchema>
export interface ServiceSecrets { platformAccessToken: string; asrApiKey: string; llmApiKey: string; embeddingApiKey: string; remoteKnowledgeApiKey: string }

export class SettingsStore {
  private readonly path: string
  private readonly queue = new SerialQueue()
  constructor(rootDir: string, private readonly crypto: SecretStorage) {
    this.path = join(rootDir, 'settings.json')
  }

  getSettings(): Promise<Settings> {
    return this.queue.run(async () => this.publicSettings(await this.read()))
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
      const { apiKey: asrKey, ...asr } = parsed.asr
      const { apiKey: llmKey, ...llm } = parsed.llm
      const { apiKey: embeddingKey, ...embedding } = parsed.embedding
      const { apiKey: remoteKnowledgeKey, ...remoteKnowledge } = parsed.remoteKnowledge
      const next: Persisted = {
        version: 1, settings: { ...parsed, asr, llm, embedding, remoteKnowledge },
        platformSession: parsed.platform.baseUrl === previous.settings.platform.baseUrl ? previous.platformSession : undefined,
        secrets: {
          platformAccessToken: parsed.platform.baseUrl === previous.settings.platform.baseUrl ? previous.secrets.platformAccessToken : '',
          asr: this.encrypt(asrKey, previous.secrets.asr),
          llm: this.encrypt(llmKey, previous.secrets.llm),
          embedding: this.encrypt(embeddingKey, previous.secrets.embedding),
          remoteKnowledge: this.encrypt(remoteKnowledgeKey, previous.secrets.remoteKnowledge),
        },
      }
      if (remoteKnowledge.enabled && next.secrets.remoteKnowledge) parseInput(remoteKnowledgeSettingsSchema, remoteKnowledge)
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

  private privateSecrets({ secrets }: Persisted): ServiceSecrets {
    return { platformAccessToken: this.decrypt(secrets.platformAccessToken), asrApiKey: this.decrypt(secrets.asr), llmApiKey: this.decrypt(secrets.llm), embeddingApiKey: this.decrypt(secrets.embedding), remoteKnowledgeApiKey: this.decrypt(secrets.remoteKnowledge) }
  }

  private async read(): Promise<Persisted> {
    const saved = await readJson(this.path, 1_048_576)
    if (saved === undefined) {
      return { version: 1, settings: parseInput(settingsInputSchema, defaultSettings), secrets: { asr: '', llm: '', embedding: '', remoteKnowledge: '', platformAccessToken: '' } }
    }
    const parsed = persistedSchema.safeParse(saved)
    if (!parsed.success) throw new Error('本地设置文件格式无效，请先备份后检查 settings.json。')
    // Never accept plaintext secrets from a manually altered settings file.
    delete parsed.data.settings.asr.apiKey
    delete parsed.data.settings.llm.apiKey
    delete parsed.data.settings.embedding.apiKey
    delete parsed.data.settings.remoteKnowledge.apiKey
    return parsed.data
  }

  private publicSettings(value: Persisted): Settings {
    const { asr, llm, embedding, remoteKnowledge, context, interviewTarget, retrieval, answerStyle, autoAnswer } = value.settings
    const authenticated = Boolean(value.secrets.platformAccessToken && value.platformSession && Date.parse(value.platformSession.expiresAt) > Date.now())
    const info = authenticated ? value.platformSession?.info : undefined
    return {
      platform: { ...value.settings.platform, authenticated, user: info?.user, expiresAt: value.platformSession?.expiresAt, capabilities: info?.capabilities ?? { llm: false, asr: false, knowledge: false }, models: info?.models ?? { llm: '', asr: '' }, limits: info?.limits },
      asr: { url: asr.url, model: asr.model, silenceMs: asr.silenceMs, hasApiKey: Boolean(value.secrets.asr) },
      llm: { baseUrl: llm.baseUrl, model: llm.model, temperature: llm.temperature, hasApiKey: Boolean(value.secrets.llm) },
      embedding: { baseUrl: embedding.baseUrl, model: embedding.model, dimensions: embedding.dimensions, hasApiKey: Boolean(value.secrets.embedding) },
      remoteKnowledge: { ...remoteKnowledge, hasApiKey: Boolean(value.secrets.remoteKnowledge) },
      context, interviewTarget, retrieval, answerStyle, autoAnswer,
    }
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
