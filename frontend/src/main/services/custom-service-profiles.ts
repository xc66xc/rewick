import { z } from 'zod'
import type { CustomServiceInput, CustomServiceProfile, ServiceKind, Settings } from '../../shared/types'
import { endpoint, isLoopback, parseInput } from './validation'

const base = z.object({
  id: z.string().min(1).max(128).optional(), name: z.string().trim().min(1).max(100),
  kind: z.enum(['llm', 'asr']), url: z.string().trim().min(1).max(2048),
  model: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(4096).refine(value => !/[\r\n]/.test(value)).optional(),
})
export const customServiceSchema = base.superRefine((value, context) => {
  const url = endpoint(value.kind === 'asr' ? 'ws' : 'http').safeParse(value.url)
  if (!url.success) context.addIssue({ code: 'custom', path: ['url'], message: '请填写有效的安全服务地址；HTTP/WS 仅限本机。' })
  if (!value.model) context.addIssue({ code: 'custom', path: ['model'], message: '请填写模型名称。' })

})
export const storedCustomServiceSchema = base.omit({ apiKey: true }).extend({ id: z.string().min(1).max(128), secret: z.string().max(16_384) })
export type StoredCustomService = z.infer<typeof storedCustomServiceSchema>
export const serviceKinds: ServiceKind[] = ['llm', 'asr']

export function profileView({ secret, ...profile }: StoredCustomService): CustomServiceProfile {
  return { ...profile, hasApiKey: Boolean(secret) }
}

export function profileSettings(settings: Settings, profile: CustomServiceProfile): Settings {
  switch (profile.kind) {
    case 'llm': return { ...settings, llm: { ...settings.llm, baseUrl: profile.url, model: profile.model ?? '', hasApiKey: profile.hasApiKey } }
    case 'asr': return { ...settings, asr: { ...settings.asr, url: profile.url, model: profile.model ?? '', hasApiKey: profile.hasApiKey } }
  }
}

export function validateCustomDraft(input: CustomServiceInput, previous?: StoredCustomService): CustomServiceInput {
  const parsed = parseInput(customServiceSchema, input)
  if (parsed.id && !previous) throw new Error('这项自定义服务已移除，请重新添加。')
  if (previous && previous.kind !== parsed.kind) throw new Error('不能改变已保存服务的类型，请新建服务。')
  if (previous?.secret && previous.url !== parsed.url && parsed.apiKey === undefined) throw new Error('请求地址已改变，请重新填写 API Key。')
  const hasKey = parsed.apiKey === undefined ? Boolean(previous?.secret) : Boolean(parsed.apiKey)
  if (!hasKey && !(isLoopback(new URL(parsed.url).hostname))) throw new Error('请填写自定义服务的 API Key。')
  return parsed
}
