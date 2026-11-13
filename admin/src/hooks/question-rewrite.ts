import { questionRewriteSchema, type Config, type QuestionRewritePolicy } from '../types'

export function validateQuestionRewrite(config: Config, draft: QuestionRewritePolicy, test = false): string {
  if (!questionRewriteSchema.safeParse(draft).success) return '提取超时需为 500–3000 毫秒的整数。'
  const model = config.models.find(item => item.id === draft.modelId)
  const provider = config.providers.find(item => item.id === model?.providerId && item.kind === 'llm')
  if (draft.modelId && (!model || !provider)) return '提取模型已不可用，请重新选择或清空绑定。'
  if (!(draft.enabled || test)) return ''
  if (!model?.enabled || !provider?.enabled) return '请先选择已启用的问题提取模型。'
  if (!provider.hasApiKey && !provider.apiKey?.trim()) return '请先在模型服务中保存 API Key，再启用或测试问题提取。'
  return ''
}
