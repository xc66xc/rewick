import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron } from 'playwright'

const directory = await mkdtemp(join(tmpdir(), 'copilot-account-isolation-'))
const tokens = new Map()
async function server() {
  const instance = createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(value ? JSON.stringify(value) : undefined) }
    if (req.url === '/api/v1/auth/login') {
      let raw = ''; for await (const chunk of req) raw += chunk
      const email = JSON.parse(raw).username
      const user = { id: email.split('@')[0], username: email, email }
      const accessToken = randomUUID(); tokens.set(accessToken, user)
      return reply(200, { accessToken, expiresAt: new Date(Date.now() + 3600000).toISOString(), user })
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const user = tokens.get(token)
    if (!user) return reply(401, {})
    if (req.url === '/api/v1/auth/logout') { tokens.delete(token); return reply(204) }
    reply(200, { user, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '', available: [] }, services: { asr: [], knowledge: [], embedding: [] }, limits: { dailyAnswers: 1000, dailyKnowledgeQueries: 1000, maxAsrSessionSeconds: 3600 } })
  })
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
  return { instance, url: `http://127.0.0.1:${instance.address().port}` }
}
const servers = [await server(), await server()]
let app
try {
  for (const file of ['settings.json', 'history.json', 'interviews.json']) await writeFile(join(directory, file), 'legacy shared data must never be read')
  const fixture = join(directory, 'reference.txt')
  await writeFile(fixture, 'Private reference for account A. Database index optimization experience.')
  const env = { ...process.env, COPILOT_USER_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: process.cwd(), env })
  const page = await app.firstWindow()
  await page.waitForFunction(() => Boolean(window.copilot))
  async function login(email, url = servers[0].url) {
    await page.evaluate(async ({ email, url }) => {
      const config = await window.copilot.getSettings()
      await window.copilot.saveSettings({ ...config, platform: { enabled: true, baseUrl: url } })
      await window.copilot.platformLogin({ username: email, password: 'synthetic-password-123' })
    }, { email, url })
    await page.getByRole('button', { name: '打开设置', exact: true }).waitFor()
  }
  const logout = () => page.evaluate(() => window.copilot.platformLogout())
  const snapshot = () => page.evaluate(async () => ({ settings: await window.copilot.getSettings(), library: await window.copilot.getInterviewLibrary(), history: await window.copilot.getHistory(), references: await window.copilot.listReferences() }))
  await login('a@example.test')
  const owner = await page.evaluate(async () => {
    const settings = await window.copilot.getSettings()
    window.accountA = window.copilot.withAccountScope(settings.accountScope)
    const library = await window.accountA.saveResume({ name: 'A resume', text: 'Private experience A' })
    const resumeId = library.resumes[0].id
    await window.accountA.saveTarget({ name: 'A target', companyName: 'A company', roleName: 'Engineer', jobDescription: 'Private JD A' })
    await window.accountA.saveEnvironment({ name: 'A environment', resumeId, targetId: null, referenceIds: [] })
    await window.accountA.saveCustomService({ name: 'A model', kind: 'llm', url: 'https://model.example/v1', model: 'private-model-a', apiKey: 'private-key-a' })
    await window.accountA.saveSession({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: 'A history', segments: [], answers: [] })
    return { scope: settings.accountScope, resumeId }
  })
  await app.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }) }, fixture)
  const references = await page.evaluate(() => window.accountA.importReferences())
  assert.equal(references.length, 1)
  await logout(); await login('b@example.test')
  const b = await snapshot()
  assert.notEqual(b.settings.accountScope, owner.scope)
  assert.equal(b.library.resumes.length, 0)
  assert.equal(b.library.targets.length, 0)
  assert.equal(b.library.environments.length, 1)
  assert.equal(b.settings.customServices.length, 0)
  assert.equal(b.history.length, 0)
  assert.equal(b.references.length, 0)
  const rejected = await page.evaluate(async ({ owner, referenceId }) => {
    const attempts = [
      () => window.accountA.saveResume({ name: 'Late A', text: 'Must not enter B' }),
      () => window.copilot.saveSession({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: 'Late A history', segments: [], answers: [] }, owner.scope),
      () => window.copilot.previewReference(referenceId),
      () => window.copilot.removeResume(owner.resumeId)
    ]
    return Promise.all(attempts.map(async attempt => { try { await attempt(); return false } catch { return true } }))
  }, { owner, referenceId: references[0].id })
  assert.deepEqual(rejected, [true, true, true, true])
  await logout(); await login('a@example.test')
  const a = await snapshot()
  assert.equal(a.library.resumes.length, 1)
  assert.equal(a.library.targets[0].name, 'A target')
  assert.equal(a.library.resumes[0].name, 'A resume')
  assert.equal(a.settings.customServices.length, 1)
  assert.equal(a.history.length, 1)
  assert.equal(a.references.length, 1)
  await logout(); await login('a@example.test', servers[1].url)
  const moved = await snapshot()
  assert.equal(moved.settings.accountScope, owner.scope)
  assert.deepEqual(moved.library, a.library)
  assert.deepEqual(moved.settings.customServices, a.settings.customServices)
  assert.deepEqual(moved.history, a.history)
  assert.equal(moved.references[0].id, a.references[0].id)
  console.log('PASS account isolation: environments, resumes, custom keys, references, history, stale requests, relogin and unchanged user data after platform address changes; legacy files ignored')
} finally {
  await app?.close()
  for (const { instance } of servers) await new Promise(resolve => instance.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
