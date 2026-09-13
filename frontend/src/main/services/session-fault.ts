const messages: Record<string, string> = {
  session_replaced: '你的账号已在其他设备登录，本机已退出。进行中的面试已结束，时长已结算。',
  session_expired: '登录已失效，请重新登录。',
  account_disabled: '账号已禁用，请联系管理员。'
}
export class SessionFault extends Error {
  readonly status = 401
  constructor(readonly code: string) { super(messages[code] ?? messages.session_expired) }
}
const listeners = new Set<(token: string, error: SessionFault) => void>()
export function onSessionFault(listener: (token: string, error: SessionFault) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export async function sessionFault(response: Response, token: string): Promise<SessionFault> {
  let code = 'session_expired'
  const reader = response.body?.getReader()
  if (reader) {
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 4096) break
        chunks.push(part.value)
      }
      if (size <= 4096) {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (parsed && typeof parsed === 'object' && 'code' in parsed && typeof parsed.code === 'string' && messages[parsed.code]) code = parsed.code
      }
    } catch { /* Invalid error bodies still revoke only this request's token. */ }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  }
  const error = new SessionFault(code)
  for (const listener of listeners) listener(token, error)
  return error
}
