import { z } from 'zod'

export const webSourceUrlSchema = z.string().min(1).max(2048).refine(value => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}, '网页来源必须是有效的 HTTP 或 HTTPS 地址，不能包含账号或密码。')
