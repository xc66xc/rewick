import { randomUUID } from 'node:crypto'

/** Loopback test double only; the production client still performs its normal login and refresh. */
export function mockAuthHandler() {
  const tokens = new Set()
  const user = { id: 'smoke-user', username: 'smoke-user', email: 'smoke@example.test' }
  return async (request, response) => {
    if (!request.url?.startsWith('/api/v1/')) return false
    const reply = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(value ? JSON.stringify(value) : undefined) }
    if (request.url === '/api/v1/auth/login' && request.method === 'POST') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      if (body.username !== user.email || body.password !== 'smoke-local-password') { reply(401, {}); return true }
      const accessToken = randomUUID()
      tokens.add(accessToken)
      reply(200, { accessToken, expiresAt: new Date(Date.now() + 3600000).toISOString(), user })
      return true
    }
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    if (!tokens.has(token)) { reply(401, {}); return true }
    if (request.url === '/api/v1/auth/logout') { tokens.delete(token); reply(204); return true }
    if (request.url === '/api/v1/platform') {
      reply(200, { user, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '', available: [] }, services: { asr: [], knowledge: [], embedding: [] }, limits: { dailyAnswers: 1000, dailyKnowledgeQueries: 1000, maxAsrSessionSeconds: 3600 } })
      return true
    }
    reply(404, {})
    return true
  }
}

export async function loginForSmoke(page, mock) {
  await page.evaluate(async baseUrl => {
    const settings = await window.copilot.getSettings()
    if (settings.platform?.authenticated) return
    await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } })
    await window.copilot.platformLogin({ username: 'smoke@example.test', password: 'smoke-local-password' })
  }, new URL(mock.llmBaseUrl).origin)
  await page.getByRole('button', { name: '打开设置', exact: true }).waitFor()
}
