import { randomUUID } from 'node:crypto'

/** Loopback test double only; the production client still performs its normal login and refresh. */
export function mockAuthHandler() {
  const tokens = new Set()
  // Minimal in-memory references double: uploads become ready immediately and
  // search echoes one synthetic excerpt per requested document. Excerpt text
  // deliberately contains no fixture markers so cross-environment isolation
  // assertions stay meaningful.
  const references = []
  const user = { id: 'smoke-user', displayName: 'smoke-user', email: 'smoke@example.test' }
  return async (request, response) => {
    if (!request.url?.startsWith('/api/v1/')) return false
    const reply = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(value ? JSON.stringify(value) : undefined) }
    if (request.url === '/api/v1/auth/login' && request.method === 'POST') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      if (body.identifier !== user.email || body.password !== 'smoke-local-password') { reply(401, {}); return true }
      const accessToken = randomUUID()
      tokens.add(accessToken)
      reply(200, { accessToken, expiresAt: new Date(Date.now() + 3600000).toISOString(), user })
      return true
    }
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    if (!tokens.has(token)) { reply(401, {}); return true }
    if (request.url === '/api/v1/auth/logout') { tokens.delete(token); reply(204); return true }
    if (request.url === '/api/v1/platform') {
      reply(200, { user, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '', available: [] }, services: { asr: [], knowledge: [] }, limits: { maxAsrSessionSeconds: 3600 } })
      return true
    }
    if (request.url === '/api/v1/references') {
      if (request.method === 'GET') { reply(200, references); return true }
      if (request.method === 'POST') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const filename = /filename="([^"]+)"/.exec(Buffer.concat(chunks).toString('latin1'))?.[1] ?? `reference-${references.length + 1}.txt`
        const now = new Date().toISOString()
        const document = { id: randomUUID(), name: filename, kind: 'technical', enabled: true, status: 'ready',
          pageCount: 0, contentHash: '', revision: 1, createdAt: now, updatedAt: now, chunkCount: 0 }
        references.push(document)
        reply(200, document)
        return true
      }
    }
    if (request.url === '/api/v1/references/search' && request.method === 'POST') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      const excerpts = references
        .filter(document => Array.isArray(body.referenceIds) && body.referenceIds.includes(document.id))
        .map(document => ({ documentId: document.id, revision: document.revision, name: document.name,
          kind: document.kind, chunkId: `${document.id}-chunk-1`,
          text: `Mock excerpt of ${document.name}: check Redis cache consistency first, then analyze MySQL slow queries and index usage.` }))
        .slice(0, 12)
      reply(200, { status: 'ready', excerpts })
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
    await window.copilot.platformLogin({ identifier: 'smoke@example.test', password: 'smoke-local-password' })
  }, new URL(mock.llmBaseUrl).origin)
  await page.getByRole('button', { name: '打开设置', exact: true }).waitFor()
}
