import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { providerPrivateError, remoteMarker, remoteMetadataMarkers } from '../../scripts/mock-remote-knowledge.mjs'

const chatKey = 'sk-remote-e2e-chat-synthetic-only'
const remoteKey = 'sk-remote-e2e-knowledge-synthetic-only'
const localMarker = 'LOCAL_REFERENCE_ONLY_82'
const agentA = 'synthetic-agent-a-41'
const agentB = 'synthetic-agent-b-59'
const resumeText = 'RESUME_NOT_SENT_TO_REMOTE_76：合成候选人参与过演示订单系统。'
const target = { companyName: '合成企业', roleName: '缓存工程师', jobDescription: 'JD_NOT_SENT_TO_REMOTE_35：关注 Redis 缓存一致性。' }

/** Real Electron IPC/storage/HTTP transports, synthetic content, and loopback-only provider doubles. */
export async function checkRemoteKnowledge(options) {
  let { app, page } = options
  const { profile, localReference, mock, remote, checked, checkpoint, screenshot, restart, report } = options
  let originalAnswer
  let selectedReference
  let environment

  async function settings() { return page.evaluate(() => window.copilot.getSettings()) }
  async function configure(patch) {
    return page.evaluate(async patch => {
      let current = await window.copilot.getSettings()
      if (patch.remoteKnowledge?.agentId) {
        const profile = current.customServices.find(value => value.id === current.serviceSelections.knowledge.id)
        await window.copilot.saveCustomService({ ...profile, hasApiKey: undefined, agentId: patch.remoteKnowledge.agentId })
        current = await window.copilot.getSettings()
      }
      return window.copilot.saveSettings({ ...current, ...patch,
        llm: { ...current.llm, ...patch.llm },
        remoteKnowledge: { ...current.remoteKnowledge, ...patch.remoteKnowledge } })
    }, patch)
  }
  async function workspace() { await page.getByRole('button', { name: '工作台', exact: true }).click() }
  async function openSettings() { await page.getByRole('button', { name: '打开设置', exact: true }).click() }
  async function closeSettings() { await page.getByRole('button', { name: '关闭设置', exact: true }).click() }
  async function remoteEnabled(enabled) {
    await openSettings()
    await page.getByRole('checkbox', { name: '启用远程知识库', exact: true }).setChecked(enabled)
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await checked(page.getByRole('dialog').getByRole('status')).toContainText('设置已保存')
    await checked.poll(async () => (await settings()).remoteKnowledge.enabled).toBe(enabled)
    await closeSettings()
  }
  function payload(request = mock.requests.at(-1)) {
    return JSON.parse(request.body.messages.find(message => message.role === 'user').content)
  }
  function assertRemoteRequest(request, question, agentId = agentA) {
    assert.deepEqual(request.body, { agent_id: agentId, query: question, images: [] })
    assert.equal(request.method, 'POST')
    assert.equal(request.authorization, `Bearer ${remoteKey}`)
    assert.equal(JSON.stringify(request.body).includes('RESUME_NOT_SENT_TO_REMOTE_76'), false)
    assert.equal(JSON.stringify(request.body).includes('JD_NOT_SENT_TO_REMOTE_35'), false)
  }
  function assertRemoteTextOnly(answer, request) {
    const referenceContext = payload(request).referenceContext
    assert.ok(referenceContext.every(value => typeof value === 'string'), 'remote referenceContext must contain only plain text strings')
    assert.deepEqual(referenceContext, answer.retrieval.excerpts.map(value => value.text))
    for (const marker of Object.values(remoteMetadataMarkers)) {
      assert.equal(JSON.stringify(request.body).includes(String(marker)), false, `provider metadata marker ${marker} must not enter HTTP model input`)
      assert.equal(JSON.stringify(answer).includes(String(marker)), false, `provider metadata marker ${marker} must not enter persisted answer snapshots`)
    }
    assert.equal(JSON.stringify(request.body).includes('/must-not-fetch'), false)
    const received = remote.requests.findLast(value => value.body.query === answer.question)?.response?.data?.nodes ?? []
    for (const excerpt of answer.retrieval.excerpts) {
      assert.equal(excerpt.name, '百炼远程知识库')
      assert.equal(excerpt.source, 'bailian')
      assert.equal(excerpt.kind, 'technical')
      assert.equal(Object.hasOwn(excerpt, 'pageStart'), false)
      assert.equal(Object.hasOwn(excerpt, 'pageEnd'), false)
      assert.ok(received.some(node => node.text.startsWith(excerpt.text)), 'persisted source text must come from nodes[].text, allowing only documented length limits')
    }
  }
  async function startQuestion(question) {
    await workspace()
    await page.getByLabel('当前问题', { exact: false }).fill(question)
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
  }
  async function savedAnswer(question) {
    return page.evaluate(async question => (await window.copilot.getHistory()).flatMap(value => value.answers)
      .findLast(answer => answer.question === question), question)
  }
  async function assertUnifiedContext(answer) {
    const details = page.locator('details[aria-label="面试信息"]')
    await checked(details).toHaveCount(1)
    await details.locator('summary').click()
    await checked(details.getByRole('region', { name: '面试环境与目标详情', exact: true })).toBeVisible()
    await checked(details).toContainText(answer.interviewEnvironment.name)
    for (const value of Object.values(answer.interviewTarget)) if (value) await checked(details).toContainText(value)
    if (answer.interviewTarget.jobDescription) await checked(details.getByText(answer.interviewTarget.jobDescription, { exact: true }).first()).toBeVisible()
    await details.locator('summary').click()
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
  }
  async function assertAnswerScrollable(answer, mode) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: answer.question, exact: true }) })
    const viewport = page.getByRole('region', { name: '回答与面试信息', exact: true })
    const height = await viewport.evaluate(element => element.clientHeight)
    assert.ok(height > 0, `${mode} expanded context must preserve a scrollable answer viewport; received ${height}px`)
    const paragraph = card.getByText(answer.text.split(/\n\s*\n/)[0], { exact: true })
    await paragraph.scrollIntoViewIfNeeded()
    await checked(paragraph).toBeInViewport()
    await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeInViewport()
    await checked(page.locator('details[aria-label="面试信息"]')).toHaveAttribute('open', '')
  }
  async function localObservations() {
    return { embeddings: mock.embeddingRequests.length,
      operations: await app.evaluate(() => [...globalThis.__remoteLocalRetrievalOperations]) }
  }
  async function assertNoLocalRetrieval(before, answer) {
    assert.deepEqual(await localObservations(), before, 'remote mode must not query local candidates, keywords, or query embeddings')
    if (answer) {
      assert.ok(answer.retrieval.excerpts.every(value => value.source === 'bailian'))
      assert.equal(JSON.stringify(answer.modelInput).includes(localMarker), false)
    }
  }
  async function finishQuestion(question, before) {
    await checked.poll(() => mock.requests.length).toBe(before + 1)
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    await checked.poll(async () => (await savedAnswer(question))?.status).toBe('complete')
    const answer = await savedAnswer(question)
    const request = mock.requests[before]
    assert.deepEqual(answer.modelInput, { model: request.body.model, messages: request.body.messages })
    if (answer.retrieval.remote) assertRemoteTextOnly(answer, request)
    else assert.deepEqual(payload(request).referenceContext, answer.retrieval.excerpts)
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
    for (const key of [chatKey, remoteKey]) assert.equal(JSON.stringify(answer).includes(key), false)
    return answer
  }
  async function generate(question) {
    const before = mock.requests.length
    const remoteOnly = (await settings()).remoteKnowledge.enabled
    const observed = await localObservations()
    await startQuestion(question)
    const answer = await finishQuestion(question, before)
    if (remoteOnly) await assertNoLocalRetrieval(observed, answer)
    return answer
  }

  await checkpoint('remote knowledge is disabled by default and generating with local retrieval off sends no remote request', async () => {
    assert.equal((await settings()).remoteKnowledge.enabled, false)
    assert.equal((await settings()).remoteKnowledge.hasApiKey, false)
    await configure({ llm: { baseUrl: mock.llmBaseUrl, model: 'mock-ui', apiKey: chatKey }, retrieval: { enabled: false } })
    environment = await page.evaluate(async ({ resumeText, target }) => {
      let library = await window.copilot.saveResume({ name: '合成远程测试简历', text: resumeText })
      const resume = library.resumes.find(value => value.name === '合成远程测试简历')
      library = await window.copilot.saveTarget({ name: '合成远程测试岗位', ...target })
      const profile = library.targets.find(value => value.name === '合成远程测试岗位')
      const active = library.environments.find(value => value.id === library.activeEnvironmentId)
      library = await window.copilot.saveEnvironment({ id: active.id, name: active.name,
        resumeId: resume.id, targetId: profile.id, referenceIds: [] })
      return library.environments.find(value => value.id === library.activeEnvironmentId)
    }, { resumeText, target })
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot?.testRemoteKnowledge))
    const answer = await generate('默认关闭检查：Redis 缓存一致性如何处理？')
    assert.equal(remote.requests.length, 0)
    assert.equal(answer.retrieval.status, 'disabled')
    assert.equal(answer.retrieval.remote, undefined)
    assert.equal(payload().personalContext, resumeText)
    assert.deepEqual(payload().interviewTarget, target)
  })

  await checkpoint('settings UI saves and tests an independent encrypted key with explicit global scope', async () => {
    await openSettings()
    const dialog = page.getByRole('dialog')
    await checked(page.getByRole('checkbox', { name: '启用远程知识库', exact: true })).not.toBeChecked()
    await page.getByRole('checkbox', { name: '启用远程知识库', exact: true }).check()
    await page.getByRole('combobox', { name: /^远程知识库/ }).click()
    await page.getByRole('option', { name: '自定义模型/服务…', exact: true }).click()
    const modal = page.getByRole('dialog', { name: '添加远程知识库', exact: true })
    await modal.getByLabel('配置名称', { exact: true }).fill('合成远程知识库')
    await modal.getByLabel('API 地址', { exact: true }).fill(remote.url)
    await modal.getByLabel('Agent ID', { exact: true }).fill(agentA)
    await modal.getByLabel('API Key', { exact: true }).fill(remoteKey)
    const baseline = remote.requests.length
    await modal.getByRole('button', { name: '测试连接', exact: true }).click()
    await checked(modal.getByRole('status')).toContainText('测试未保存配置')
    assert.equal(remote.requests.length, baseline + 1)
    assert.equal(remote.requests.at(-1).authorization, `Bearer ${remoteKey}`)
    await modal.getByRole('button', { name: '保存并选用', exact: true }).click()
    await checked(modal).not.toBeVisible()
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await checked.poll(async () => (await settings()).remoteKnowledge.enabled).toBe(true)
    const current = await settings()
    assert.equal(JSON.stringify(current).includes(remoteKey), false)
    assert.equal(await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable()), true)
    await screenshot('remote-knowledge-settings.png')
    await closeSettings()
    report.remoteKeyEncryptedAtRestTested = true
  })

  await checkpoint('restart restores remote settings and blank key saves preserve the independent credential', async () => {
    ;({ app, page } = await restart())
    assert.equal((await settings()).remoteKnowledge.agentId, agentA)
    await page.evaluate(async () => {
      const current = await window.copilot.getSettings()
      const profile = current.customServices.find(value => value.id === current.serviceSelections.knowledge.id)
      await window.copilot.saveCustomService({ ...profile, hasApiKey: undefined })
      await window.copilot.testCustomService({ ...profile, hasApiKey: undefined })
    })
    assert.equal(remote.requests.at(-1).authorization, `Bearer ${remoteKey}`)

  })

  await checkpoint('remote-only answers send the exact current question and expose the actual remote source and model-input snapshots', async () => {
    const baseline = remote.requests.length
    const question = 'REMOTE_QUESTION_ONLY_24：Redis 缓存穿透如何处理？'
    originalAnswer = await generate(question)
    assert.equal(remote.requests.length, baseline + 1)
    assertRemoteRequest(remote.requests.at(-1), question)
    assert.deepEqual((await settings()).interviewEnvironment.referenceIds, [])
    assert.equal((await settings()).retrieval.enabled, false)
    assert.equal(originalAnswer.retrieval.status, 'ready')
    assert.equal(originalAnswer.retrieval.remote.agentId, agentA)
    assert.equal(originalAnswer.retrieval.remote.status, 'ready')
    assert.equal(originalAnswer.retrieval.excerpts.length, 2)
    assert.ok(originalAnswer.retrieval.excerpts.every(value => value.source === 'bailian' && value.kind === 'technical' && value.text.includes(remoteMarker)))
    assert.deepEqual(payload().referenceContext, remote.requests.at(-1).response.data.nodes.map(value => value.text), 'normal remote content must be included verbatim without metadata wrappers')
    await assertUnifiedContext(originalAnswer)
    await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
    try {
      await checked(page.getByRole('button', { name: '恢复完整窗口', exact: true })).toBeVisible()
      const details = page.locator('details[aria-label="面试信息"]')
      await checked(details).toHaveCount(1)
      await details.locator('summary').click()
      await checked(details).toContainText(target.companyName)
      await checked(details.getByText(target.jobDescription, { exact: true })).toBeVisible()
      await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeInViewport()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
      await screenshot('remote-knowledge-compact-context.png')
      await assertAnswerScrollable(originalAnswer, 'compact')
      await screenshot('remote-knowledge-compact-answer.png')
      await details.locator('summary').click()
    } finally { await page.getByRole('button', { name: '恢复完整窗口', exact: true }).click() }
    report.compactUnifiedContextTested = true
    const fullBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    try {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 640))
      await checked.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())).toEqual([900, 640])
      const details = page.locator('details[aria-label="面试信息"]')
      await details.locator('summary').click()
      await screenshot('remote-knowledge-normal-small-context.png')
      await assertAnswerScrollable(originalAnswer, '900x640 normal')
      await screenshot('remote-knowledge-normal-small-answer.png')
      await details.locator('summary').click()
    } finally { await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), fullBounds) }
    report.smallNormalUnifiedContextTested = true
    const card = page.getByRole('article').last()
    await card.getByText('本次检索资料', { exact: true }).click()
    await checked(card).toContainText('百炼远程知识库')
    await checked(card).toContainText(agentA)
    assert.equal((await card.innerText()).includes('版本 1'), false, 'synthetic snapshot revision must not be presented as a remote version')
    await card.locator('summary').filter({ hasText: '本次发送内容' }).click()
    assert.deepEqual(await card.getByRole('region', { name: '本次发送的完整文字', exact: true }).locator('pre').allTextContents(), originalAnswer.modelInput.messages.map(value => value.content))
    for (const marker of Object.values(remoteMetadataMarkers)) assert.equal((await card.innerText()).includes(String(marker)), false)
    await card.locator('summary').filter({ hasText: '本次发送内容' }).click()
    await card.getByText(originalAnswer.retrieval.excerpts[0].name, { exact: true }).first().evaluate(element => element.scrollIntoView({ block: 'center' }))
    await screenshot('remote-knowledge-answer.png')
  })

  // Selected-document PG/Bailian exclusivity is covered against real Java/PG in smoke-platform.mjs.

  await checkpoint('an empty remote response stays visible and does not fall back to enabled, indexed local references', async () => {
    remote.setMode('empty')
    try {
      const answer = await generate('空结果检查：合成未收录的问题是什么？')
      assert.equal(answer.retrieval.remote.status, 'empty')
      assert.equal(answer.retrieval.status, 'empty')
      assert.deepEqual(answer.retrieval.excerpts, [])
      await checked(page.getByRole('article').last()).toContainText(/未找到|未命中/)
    } finally { remote.setMode('ready') }
  })

  await checkpoint('HTTP and business failures continue answering without local fallback or exposure of private provider errors', async () => {
    try {
      for (const mode of ['http-error', 'business-error']) {
        remote.setMode(mode)
        const answer = await generate(`远程故障 ${mode}：Redis 缓存更新失败如何处理？`)
        assert.equal(answer.retrieval.status, 'degraded')
        assert.equal(answer.retrieval.remote.status, 'degraded')
        assert.deepEqual(answer.retrieval.excerpts, [])
        assert.equal(JSON.stringify(answer).includes(providerPrivateError), false)
        await checked(page.getByRole('article').last()).toContainText(/暂不可用|失败|无法|降级/)
        assert.equal((await page.getByRole('article').last().innerText()).includes(providerPrivateError), false)
      }
    } finally { remote.setMode('ready') }
  })

  await checkpoint('the five-second remote timeout aborts HTTP and continues answering without any local fallback', async () => {
    remote.setMode('timeout')
    const before = remote.requests.length
    const started = Date.now()
    try {
      const answer = await generate('远程超时检查：Redis 缓存监控应该关注什么？')
      const elapsed = Date.now() - started
      assert.ok(elapsed < 10_000, `the five-second budget plus UI and model transport took ${elapsed} ms`)
      assert.equal(answer.retrieval.remote.status, 'degraded')
      assert.deepEqual(answer.retrieval.excerpts, [])
      await checked.poll(() => remote.requests[before]?.cancelled).toBe(true)
    } finally { remote.setMode('ready') }
  })

  await checkpoint('stopping or replacing a pending remote query aborts it and prevents stale sources or model submissions', async () => {
    await page.evaluate(() => {
      window.__remoteAnswerEvents = []
      window.__remoteStopEvents = window.copilot.onEvent(event => {
        if (event.kind.startsWith('answer-')) window.__remoteAnswerEvents.push(event)
      })
    })
    const beforeChat = mock.requests.length
    const beforeRemote = remote.requests.length
    const observed = await localObservations()
    remote.setMode('held')
    try {
      await startQuestion('取消检查 REMOTE_CANCELLED_ONLY_19：Redis 缓存如何设计？')
      await checked.poll(() => remote.isHeld(beforeRemote)).toBe(true)
      await page.getByRole('button', { name: '停止生成', exact: true }).click()
      await checked.poll(() => remote.requests[beforeRemote].cancelled).toBe(true)
      await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeEnabled()
      assert.equal(mock.requests.length, beforeChat)
      const staleQuestion = '换问检查 REMOTE_STALE_ONLY_43：Redis 缓存如何刷新？'
      await startQuestion(staleQuestion)
      await checked.poll(() => remote.isHeld(beforeRemote + 1)).toBe(true)
      remote.setMode('ready')
      const nextQuestion = '新问题 REMOTE_NEW_ONLY_64：MySQL 慢查询如何定位？'
      const editor = page.getByLabel('当前问题', { exact: false })
      await editor.fill(nextQuestion)
      await editor.press('Meta+Enter')
      const answer = await finishQuestion(nextQuestion, beforeChat)
      await checked.poll(() => remote.requests[beforeRemote + 1].cancelled).toBe(true)
      assertRemoteRequest(remote.requests.at(-1), nextQuestion)
      assert.ok(answer.retrieval.excerpts.every(value => value.text.includes('REMOTE_NEW_ONLY_64')))
      assert.equal(JSON.stringify(answer).includes('REMOTE_STALE_ONLY_43'), false)
      assert.equal(remote.release(beforeRemote), false)
      assert.equal(remote.release(beforeRemote + 1), false)
      const events = await page.evaluate(() => window.__remoteAnswerEvents)
      const contexts = events.filter(value => value.kind === 'answer-context')
      assert.equal(contexts.length, 1)
      assert.deepEqual(contexts[0].retrieval, answer.retrieval)
      assert.equal(events.filter(value => value.kind === 'answer-request').length, 1)
      const oldCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: staleQuestion, exact: true }) })
      await checked(oldCard.getByText('已停止', { exact: true })).toBeVisible()
      await checked(oldCard.getByText('本次检索资料', { exact: true })).toHaveCount(0)
      await assertNoLocalRetrieval(observed, answer)
    } finally {
      remote.setMode('ready')
      await page.evaluate(() => window.__remoteStopEvents())
    }
  })

  await checkpoint('remote mode skips selected ready local references, limits remote snippets, and also works with an empty local environment', async () => {
    remote.setMode('many')
    try {
      const remoteOnly = await generate('远程独占检查：Redis 缓存一致性和慢查询如何排查？')
      const cloud = remoteOnly.retrieval.excerpts
      assert.equal(cloud.length, 6)
      assert.ok(cloud.every(value => value.source === 'bailian'))
      assert.ok(cloud.reduce((sum, value) => sum + value.text.length, 0) <= 6000)
      const noLocal = await page.evaluate(async () => {
        const library = await window.copilot.saveEnvironment({ name: '合成远程全局空环境', resumeId: null, targetId: null, referenceIds: [] })
        return library.environments.find(value => value.name === '合成远程全局空环境')
      })
      await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '准备面试', exact: true }).click()
      await page.evaluate(async id => window.copilot.activateEnvironment(id), noLocal.id)
      await checked.poll(async () => (await settings()).interviewEnvironment.id).toBe(noLocal.id)
      remote.setMode('large')
      const emptyLocal = await generate('空本地环境检查：Redis 缓存有哪些策略？')
      assert.equal(payload().personalContext, '')
      assert.deepEqual(payload().interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
      assert.ok(emptyLocal.retrieval.excerpts.length > 0 && emptyLocal.retrieval.excerpts.length <= 6)
      assert.ok(emptyLocal.retrieval.excerpts.every(value => value.source === 'bailian' && value.text.length <= 2000))
      assert.equal(emptyLocal.retrieval.excerpts.reduce((sum, value) => sum + value.text.length, 0), 6000)
      await remoteEnabled(false)
      const beforeRemote = remote.requests.length
      const observed = await localObservations()
      const empty = await generate('恢复空本地环境检查：Redis 缓存失效如何处理？')
      assert.deepEqual(empty.retrieval.excerpts, [])
      assert.equal(remote.requests.length, beforeRemote)
      await assertNoLocalRetrieval(observed)
      assert.deepEqual((await settings()).interviewEnvironment.referenceIds, [])
      await remoteEnabled(true)
      report.remoteLocalSelectionIsolationTested = true
      report.remoteExclusiveRetrievalTested = true
    } finally { remote.setMode('ready') }
  })

  await checkpoint('configuration changes cannot rewrite an in-flight remote request or historical source and exact-input snapshots', async () => {
    const beforeChat = mock.requests.length
    const beforeRemote = remote.requests.length
    const question = '快照检查 REMOTE_AGENT_A_ONLY_27：Redis 缓存怎样测试？'
    remote.setMode('held')
    try {
      await startQuestion(question)
      await checked.poll(() => remote.isHeld(beforeRemote)).toBe(true)
      await configure({ remoteKnowledge: { agentId: agentB } })
      assertRemoteRequest(remote.requests[beforeRemote], question, agentA)
      remote.release(beforeRemote)
      const heldAnswer = await finishQuestion(question, beforeChat)
      assert.equal(heldAnswer.retrieval.remote.agentId, agentA)
      assert.ok(heldAnswer.retrieval.excerpts.every(value => value.name === '百炼远程知识库'))
    } finally { remote.setMode('ready') }
    const nextQuestion = '新配置检查 REMOTE_AGENT_B_ONLY_68：Redis 缓存如何监控？'
    const next = await generate(nextQuestion)
    assertRemoteRequest(remote.requests.at(-1), nextQuestion, agentB)
    assert.equal(next.retrieval.remote.agentId, agentB)
    assert.deepEqual(await savedAnswer(originalAnswer.question), originalAnswer)
    await remoteEnabled(false)
    ;({ app, page } = await restart())
    assert.equal((await settings()).remoteKnowledge.enabled, false)
    assert.equal((await settings()).remoteKnowledge.agentId, agentB)
    assert.deepEqual(await savedAnswer(originalAnswer.question), originalAnswer)
    const records = await page.evaluate(() => window.copilot.getHistory())
    const record = records.find(value => value.answers.some(answer => answer.id === originalAnswer.id))
    await page.getByRole('button', { name: '会话记录', exact: true }).click()
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: record.title, exact: true }) }).click()
    await assertUnifiedContext(originalAnswer)
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: originalAnswer.question, exact: true }) })
    await card.getByText('本次检索资料', { exact: true }).click()
    await checked(card).toContainText(agentA)
    assert.equal((await card.innerText()).includes(agentB), false)
    await card.locator('summary').filter({ hasText: '本次发送内容' }).click()
    assert.deepEqual(await card.getByRole('region', { name: '本次发送的完整文字', exact: true }).locator('pre').allTextContents(), originalAnswer.modelInput.messages.map(value => value.content))
    for (const marker of Object.values(remoteMetadataMarkers)) assert.equal((await card.innerText()).includes(String(marker)), false)
    assert.equal((await card.innerText()).includes('版本 1'), false)
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
    await card.locator('summary').filter({ hasText: '本次发送内容' }).click()
    await card.getByText(originalAnswer.retrieval.excerpts[0].name, { exact: true }).first().evaluate(element => element.scrollIntoView({ block: 'center' }))
    await screenshot('remote-knowledge-history.png')
    assert.ok(mock.requests.every(value => value.authorization === `Bearer ${chatKey}`))
    assert.ok(mock.embeddingRequests.every(value => value.authorization === `Bearer ${embeddingKey}`))
    assert.ok(remote.requests.every(value => value.authorization === `Bearer ${remoteKey}`))
    report.remoteSnapshotPersistenceTested = true
    report.remotePlainTextModelInputTested = true
    report.providerMetadataDiscardedTested = true
  })
}
