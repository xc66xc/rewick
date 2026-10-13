import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { RetrievalContext, Settings } from '../../shared/types'
import { PlatformClient, PlatformRequestError } from './platform-client'
import { SessionFault } from './session-fault'
import { referenceExcerptSchema } from './validation'

const responseSchema = z.object({
  status: z.enum(['ready', 'empty', 'degraded']), message: z.string().max(2000).optional(),
  excerpts: z.array(referenceExcerptSchema).max(21),
}).superRefine((value, context) => {
  if (value.excerpts.some(excerpt => excerpt.source !== 'web')
    || value.excerpts.filter(excerpt => excerpt.generatedSummary).length > 1
    || value.excerpts.filter(excerpt => !excerpt.generatedSummary).length > 20
    || value.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0) > 8000
    || (value.status === 'ready') !== (value.excerpts.length > 0)) {
    context.addIssue({ code: 'custom', message: '联网检索响应格式无效。' })
  }
})

export class WebSearchClient {
  constructor(private readonly settings: Settings, private readonly token: string) {}

  async retrieve(query: string, signal: AbortSignal): Promise<RetrievalContext> {
    signal.throwIfAborted()
    if (!this.settings.webSearch?.enabled) return { status: 'disabled', excerpts: [] }
    const platform = this.settings.platform
    if (!platform?.authenticated || !this.token) throw new Error('请先登录平台账号。')
    try {
      if (!platform.advancedSettingsEnabled) throw new Error('当前账号没有联网搜索权限，请刷新设置。')
      if (!platform.webSearchAvailable) throw new Error('平台尚未开放联网搜索，请联系管理员配置 Tavily。')
      const timeoutMs = (platform.webSearchTimeoutMs ?? 8000) + 1500
      const response = responseSchema.parse(await new PlatformClient(platform.baseUrl, timeoutMs)
        .webSearch(this.token, query, randomUUID(), signal))
      signal.throwIfAborted()
      return { ...response, web: { status: response.status, ...(response.message ? { message: response.message } : {}) } }
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof SessionFault) throw error
      if (error instanceof PlatformRequestError && [402, 409].includes(error.status ?? 0)) {
        throw new Error('面试会话已结束或请求失效，请刷新面试状态。')
      }
      const message = error instanceof z.ZodError ? '联网搜索响应格式无效，本次继续回答。'
        : error instanceof Error ? error.message : '联网搜索失败，本次继续回答。'
      return { status: 'degraded', excerpts: [], message, web: { status: 'degraded', message } }
    }
  }
}
