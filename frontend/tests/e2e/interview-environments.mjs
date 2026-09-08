import assert from 'node:assert/strict'
import { syntheticResumeMarker } from '../fixtures/pdf-rag.mjs'

const resumeAName = '合成简历 A · 缓存方向'
const resumeBName = '合成简历 B · 数据方向'
const targetAName = '合成岗位 A · Redis'
const targetBName = '合成岗位 B · MySQL'
const targetA = { companyName: '合成缓存实验室', roleName: '缓存工程师', jobDescription: 'JD_ENV_A_ONLY_41：关注 Redis 缓存一致性。' }
const targetB = { companyName: '合成数据实验室', roleName: '数据库工程师', jobDescription: '# 合成岗位 JD\nJD_ENV_B_ONLY_53：关注 MySQL 慢查询与数据质量。' }

export async function checkInterviewEnvironments(options) {
  let { app, page } = options
  const { fixtures, mock, checked, checkpoint, screenshot, restart, report } = options
  let resumeA, resumeB, profileA, profileB, referenceA, referenceB, environmentA, environmentB, emptyEnvironment
  let answerA, answerB
  let revisedResumeB
  let revisedTargetB
  const fakeChatKey = 'sk-environments-chat-synthetic-only'
  const fakeEmbeddingKey = 'sk-environments-embedding-synthetic-only'

  async function library() { return page.evaluate(() => window.copilot.getInterviewLibrary()) }
  async function settings() { return page.evaluate(() => window.copilot.getSettings()) }
  async function configure(patch) {
    return page.evaluate(async patch => {
      const current = await window.copilot.getSettings()
      return window.copilot.saveSettings({ ...current, ...patch,
        llm: { ...current.llm, ...patch.llm }, embedding: { ...current.embedding, ...patch.embedding } })
    }, patch)
  }
  async function chooseFiles(paths) { await app.evaluate((_, paths) => globalThis.__ragDialogSelections.push(paths), paths) }
  async function background(tab) {
    await page.getByRole('button', { name: '个人背景', exact: true }).click()
    await page.getByRole('tab', { name: tab, exact: true }).click()
  }
  async function environments() { await page.getByRole('button', { name: '面试环境', exact: true }).click() }
  async function workspace() { await page.getByRole('button', { name: '工作台', exact: true }).click() }
  async function assertUnifiedContext(environment, target, absent = [], screenshotName) {
    const details = page.locator('details[aria-label="面试信息"]')
    await checked(details).toHaveCount(1)
    await details.locator('summary').click()
    await checked(details.getByRole('region', { name: '面试环境与目标详情', exact: true })).toBeVisible()
    await checked(details).toContainText(environment.name)
    for (const value of Object.values(target)) if (value) await checked(details).toContainText(value)
    if (target.jobDescription) await checked(details.getByText(target.jobDescription, { exact: true }).first()).toBeVisible()
    for (const value of absent) await checked(details).not.toContainText(value)
    if (screenshotName) await screenshot(screenshotName)
    await details.locator('summary').click()
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
  }
  function payload(request = mock.requests.at(-1)) { return JSON.parse(request.body.messages.find(value => value.role === 'user').content) }
  async function createEnvironment(name, resumeId, targetId, documents = []) {
    await environments()
    await page.getByRole('button', { name: '创建环境', exact: true }).click()
    await page.getByLabel('环境名称', { exact: true }).fill(name)
    await page.getByRole('combobox', { name: '环境简历', exact: true }).selectOption(resumeId ?? '')
    await page.getByRole('combobox', { name: '环境目标岗位', exact: true }).selectOption(targetId ?? '')
    for (const document of documents) await page.getByRole('checkbox', { name: `选择资料 ${document.name}`, exact: true }).check()
    await page.getByRole('button', { name: '保存环境', exact: true }).click()
    await checked.poll(async () => (await library()).environments.some(value => value.name === name)).toBe(true)
    return (await library()).environments.find(value => value.name === name)
  }
  async function enter(environment) {
    await environments()
    await page.getByRole('button', { name: `进入面试 ${environment.name}`, exact: true }).click()
    await checked.poll(async () => (await settings()).interviewEnvironment.id).toBe(environment.id)
    await workspace()
  }
  async function generate(question) {
    await workspace()
    const before = mock.requests.length
    await page.getByLabel('当前问题', { exact: false }).fill(question)
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked.poll(() => mock.requests.length).toBe(before + 1)
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    await checked.poll(() => page.evaluate(async question => (await window.copilot.getHistory()).flatMap(value => value.answers)
      .findLast(value => value.question === question)?.status, question)).toBe('complete')
    const answer = await page.evaluate(async question => (await window.copilot.getHistory()).flatMap(value => value.answers)
      .findLast(value => value.question === question), question)
    assert.deepEqual(answer.modelInput, { model: mock.requests.at(-1).body.model, messages: mock.requests.at(-1).body.messages })
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
    return answer
  }
  async function inputTarget(target) {
    await page.getByLabel('面试公司', { exact: true }).fill(target.companyName)
    await page.getByLabel('岗位名称', { exact: true }).fill(target.roleName)
    await page.getByLabel('岗位 JD', { exact: false }).fill(target.jobDescription)
  }
  async function rejection(operation, input) {
    return page.evaluate(async ({ operation, input }) => {
      try { await window.copilot[operation](input); return null }
      catch (error) { return String(error) }
    }, { operation, input })
  }

  await checkpoint('legacy settings writes cannot replace library-managed resume and target selections', async () => {
    await configure({ llm: { baseUrl: mock.llmBaseUrl, model: 'mock-ui', apiKey: fakeChatKey },
      embedding: { baseUrl: mock.llmBaseUrl, model: 'mock-environments-embedding', dimensions: 256, apiKey: fakeEmbeddingKey },
      retrieval: { enabled: true }, context: { name: '旧设置污染', text: 'LEGACY_SETTINGS_POISON_ONLY_99' }, interviewTarget: targetA })
    const current = await settings()
    assert.equal(current.context.text, '')
    assert.deepEqual(current.interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
    assert.deepEqual(current.interviewEnvironment.referenceIds, [])
    assert.equal(JSON.stringify(current).includes(fakeChatKey), false)
    assert.equal(JSON.stringify(current).includes(fakeEmbeddingKey), false)
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot?.getInterviewLibrary))
  })

  await checkpoint('named resumes preserve drafts across navigation and explicit switching, then restore the latest saved revision', async () => {
    await background('我的简历')
    const editor = page.getByLabel('简历与项目说明', { exact: false })
    for (const [name, path, marker] of [[resumeAName, fixtures.resume, syntheticResumeMarker], [resumeBName, fixtures.resumeAlternate, 'RESUME_ENV_B_ONLY_92']]) {
      await page.getByRole('button', { name: '新增简历', exact: true }).click()
      await chooseFiles([path])
      await page.getByRole('button', { name: '导入 PDF / TXT / MD', exact: true }).click()
      await checked(editor).toHaveValue(new RegExp(marker))
      await page.getByLabel('资料名称', { exact: true }).fill(name)
      await page.getByRole('button', { name: '保存背景', exact: true }).click()
      await checked.poll(async () => (await library()).resumes.some(value => value.name === name)).toBe(true)
    }
    resumeA = (await library()).resumes.find(value => value.name === resumeAName)
    resumeB = (await library()).resumes.find(value => value.name === resumeBName)
    assert.notEqual(resumeA.id, resumeB.id)
    assert.equal((await settings()).context.text, '', 'saving a library item must not silently select it into an environment')
    const selector = page.getByRole('combobox', { name: '选择简历', exact: true })
    await selector.selectOption(resumeA.id)
    await checked(editor).toHaveValue(resumeA.text)
    const unsavedDraft = `${resumeA.text}\nUNSAVED_DRAFT_ONLY_47`
    await editor.fill(unsavedDraft)
    await environments()
    await background('我的简历')
    await checked(selector).toHaveValue(resumeA.id)
    await checked(page.getByLabel('资料名称', { exact: true })).toHaveValue(resumeA.name)
    await checked(editor).toHaveValue(unsavedDraft)
    assert.equal((await library()).resumes.find(value => value.id === resumeA.id).text, resumeA.text)
    await selector.selectOption(resumeB.id)
    await page.getByRole('button', { name: '保留草稿', exact: true }).click()
    await checked(editor).toHaveValue(/UNSAVED_DRAFT_ONLY_47/)
    await selector.selectOption(resumeB.id)
    await page.getByRole('button', { name: '放弃草稿并继续', exact: true }).click()
    await checked(editor).toHaveValue(resumeB.text)
    assert.equal((await library()).resumes.find(value => value.id === resumeA.id).text, resumeA.text)
    await selector.selectOption(resumeA.id)
    const olderDraft = `${resumeA.text}\nOLDER_CACHED_DRAFT_ONLY_65`
    const savedRevision = `${resumeA.text}\nSAVED_AFTER_NAVIGATION_ONLY_66`
    await editor.fill(olderDraft)
    await environments()
    await background('我的简历')
    await checked(selector).toHaveValue(resumeA.id)
    await checked(editor).toHaveValue(olderDraft)
    await editor.fill(savedRevision)
    await page.getByRole('button', { name: '保存背景', exact: true }).click()
    await checked.poll(async () => (await library()).resumes.find(value => value.id === resumeA.id)?.text).toBe(savedRevision)
    resumeA = (await library()).resumes.find(value => value.id === resumeA.id)
    await environments()
    await background('我的简历')
    await checked(selector).toHaveValue(resumeA.id)
    await checked(editor).toHaveValue(savedRevision)
    await checked(page.getByRole('button', { name: '保存背景', exact: true })).toBeDisabled()
    assert.equal((await editor.inputValue()).includes('OLDER_CACHED_DRAFT_ONLY_65'), false)
    await screenshot('environments-resumes.png')
  })

  await checkpoint('two target profiles save independently and JD file import is previewed before saving', async () => {
    await background('目标岗位')
    await page.getByRole('button', { name: '新增岗位', exact: true }).click()
    await page.getByLabel('岗位方案名称', { exact: true }).fill(targetAName)
    await inputTarget(targetA)
    await page.getByRole('button', { name: '保存岗位 JD', exact: true }).click()
    await checked.poll(async () => (await library()).targets.some(value => value.name === targetAName)).toBe(true)
    await page.getByRole('button', { name: '新增岗位', exact: true }).click()
    await chooseFiles([fixtures.jd])
    await page.getByRole('button', { name: '导入岗位 JD', exact: true }).click()
    await checked(page.getByLabel('岗位 JD', { exact: false })).toHaveValue(targetB.jobDescription)
    assert.equal((await library()).targets.some(value => value.jobDescription.includes('JD_ENV_B_ONLY_53')), false)
    await page.getByLabel('岗位方案名称', { exact: true }).fill(targetBName)
    await inputTarget(targetB)
    await page.getByRole('button', { name: '保存岗位 JD', exact: true }).click()
    await checked.poll(async () => (await library()).targets.some(value => value.name === targetBName)).toBe(true)
    profileA = (await library()).targets.find(value => value.name === targetAName)
    profileB = (await library()).targets.find(value => value.name === targetBName)
    await page.getByRole('combobox', { name: '选择目标岗位', exact: true }).selectOption(profileA.id)
    await checked(page.getByLabel('岗位 JD', { exact: false })).toHaveValue(targetA.jobDescription)
    assert.deepEqual((await settings()).interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
    await screenshot('environments-targets.png')
  })

  await checkpoint('reference imports are opt-in and environments persist different explicit combinations', async () => {
    await background('参考资料')
    await chooseFiles([fixtures.cache, fixtures.database])
    await page.getByRole('button', { name: '导入参考资料', exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.listReferences()).map(value => value.status))).toEqual(['ready', 'ready'])
    const references = await page.evaluate(() => window.copilot.listReferences())
    referenceA = references.find(value => value.name === 'synthetic-cache-reference.pdf')
    referenceB = references.find(value => value.name === 'synthetic-database-reference.txt')
    assert.deepEqual((await settings()).interviewEnvironment.referenceIds, [])
    environmentA = await createEnvironment('合成面试环境 A', resumeA.id, profileA.id, [referenceA])
    environmentB = await createEnvironment('合成面试环境 B', resumeB.id, profileB.id, [referenceB])
    emptyEnvironment = await createEnvironment('合成空环境', null, null)
    assert.deepEqual(environmentA.referenceIds, [referenceA.id])
    assert.deepEqual(environmentB.referenceIds, [referenceB.id])
    assert.deepEqual(emptyEnvironment.referenceIds, [])
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 820))
    try { await screenshot('environments-library-900.png') }
    finally { await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), bounds) }
  })

  await checkpoint('entering each environment clears the old draft and sends only its selected resume, JD, and reference candidates', async () => {
    await enter(environmentA)
    answerA = await generate('环境 A：Redis 缓存和 MySQL 慢查询应该怎样分析？')
    assert.equal(payload().personalContext, resumeA.text)
    assert.deepEqual(payload().interviewTarget, targetA)
    assert.ok(payload().referenceContext.length > 0)
    assert.ok(payload().referenceContext.every(value => value.documentId === referenceA.id))
    assert.deepEqual(answerA.interviewEnvironment.referenceIds, [referenceA.id])
    assert.equal(answerA.interviewEnvironment.id, environmentA.id)
    assert.equal(JSON.stringify(payload()).includes('RESUME_ENV_B_ONLY_92'), false)
    assert.equal(JSON.stringify(payload()).includes('JD_ENV_B_ONLY_53'), false)
    assert.equal(JSON.stringify(payload()).includes('MYSQL_REFERENCE_ONLY_89'), false)
    await assertUnifiedContext(environmentA, targetA, [environmentB.name, targetB.companyName])
    await page.getByLabel('当前问题', { exact: false }).fill('ENVIRONMENT_A_DRAFT_ONLY_38')
    await enter(environmentB)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue('')
    await checked(page.getByRole('article')).toHaveCount(0)
    answerB = await generate('环境 B：Redis 缓存和 MySQL 慢查询应该怎样分析？')
    assert.equal(payload().personalContext, resumeB.text)
    assert.deepEqual(payload().interviewTarget, targetB)
    assert.ok(payload().referenceContext.length > 0)
    assert.ok(payload().referenceContext.every(value => value.documentId === referenceB.id))
    assert.equal(answerB.interviewEnvironment.id, environmentB.id)
    assert.equal(JSON.stringify(payload()).includes(syntheticResumeMarker), false)
    assert.equal(JSON.stringify(payload()).includes('JD_ENV_A_ONLY_41'), false)
    assert.equal(JSON.stringify(payload()).includes('CACHE_REFERENCE_ONLY_73'), false)
    assert.equal(JSON.stringify(payload()).includes('ENVIRONMENT_A_DRAFT_ONLY_38'), false)
    await assertUnifiedContext(environmentB, targetB, [environmentA.name, targetA.companyName])
    const records = await page.evaluate(() => window.copilot.getHistory())
    assert.equal(records.find(value => value.answers.some(answer => answer.id === answerA.id)).interviewEnvironment.id, environmentA.id)
    assert.equal(records.find(value => value.answers.some(answer => answer.id === answerB.id)).interviewEnvironment.id, environmentB.id)
    await screenshot('environments-answer-b.png')
  })

  await checkpoint('busy environment activation and combination edits are rejected without changing the active answer', async () => {
    await configure({ llm: { model: 'mock-held' } })
    const baseline = mock.requests.length
    await page.getByLabel('当前问题', { exact: false }).fill('忙碌环境 B：如何分析 MySQL 索引？')
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked.poll(() => mock.isStreamHeld(baseline)).toBe(true)
    assert.ok(await rejection('activateEnvironment', environmentA.id))
    assert.ok(await rejection('saveEnvironment', { id: environmentB.id, name: environmentB.name,
      resumeId: resumeA.id, targetId: environmentB.targetId, referenceIds: environmentB.referenceIds }))
    assert.equal((await settings()).interviewEnvironment.id, environmentB.id)
    assert.equal((await library()).environments.find(value => value.id === environmentB.id).resumeId, resumeB.id)
    await environments()
    await checked(page.getByRole('button', { name: `进入面试 ${environmentA.name}`, exact: true })).toBeDisabled()
    mock.finishStream(baseline)
    await workspace()
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    await configure({ llm: { model: 'mock-ui' }, context: { name: resumeA.name, text: resumeA.text }, interviewTarget: targetA })
    assert.equal((await settings()).context.text, resumeB.text)
    assert.deepEqual((await settings()).interviewTarget, targetB)
    const before = mock.requests.length
    assert.ok(await rejection('generateAnswer', { requestId: 'stale-environment-request', question: '过期环境请求', transcript: '', environmentId: environmentA.id }))
    assert.equal(mock.requests.length, before)
  })

  await checkpoint('an explicitly empty environment never falls back to any stored profile or the full reference library', async () => {
    await enter(emptyEnvironment)
    const current = await settings()
    assert.equal(current.context.text, '')
    assert.deepEqual(current.interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
    assert.deepEqual(current.interviewEnvironment.referenceIds, [])
    const embedding = mock.embeddingRequests.length
    const answer = await generate('空环境：Redis 缓存和 MySQL 慢查询怎样排查？')
    assert.equal(payload().personalContext, '')
    assert.deepEqual(payload().referenceContext, [])
    assert.deepEqual(payload().interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
    assert.equal(mock.embeddingRequests.length, embedding)
    assert.equal(answer.interviewEnvironment.id, emptyEnvironment.id)
    await assertUnifiedContext(emptyEnvironment, current.interviewTarget, [environmentA.name, environmentB.name, targetA.companyName, targetB.companyName])
    await screenshot('environments-empty.png')
  })

  await checkpoint('profile revisions affect later answers while historical environment and model-input snapshots stay immutable', async () => {
    await enter(environmentB)
    await background('我的简历')
    await page.getByRole('combobox', { name: '选择简历', exact: true }).selectOption(resumeB.id)
    revisedResumeB = `${resumeB.text}\nRESUME_B_REVISION_ONLY_61：补充演示查询优化经历。`
    await page.getByLabel('简历与项目说明', { exact: false }).fill(revisedResumeB)
    await page.getByRole('button', { name: '保存背景', exact: true }).click()
    await checked.poll(async () => (await settings()).context.text).toBe(revisedResumeB)
    await background('目标岗位')
    await page.getByRole('combobox', { name: '选择目标岗位', exact: true }).selectOption(profileB.id)
    revisedTargetB = { ...targetB, jobDescription: `${targetB.jobDescription}\nJD_B_REVISION_ONLY_74：补充故障恢复要求。` }
    await inputTarget(revisedTargetB)
    await page.getByRole('button', { name: '保存岗位 JD', exact: true }).click()
    await checked.poll(async () => (await settings()).interviewTarget).toEqual(revisedTargetB)
    await generate('更新后的环境 B：MySQL 查询执行计划如何查看？')
    assert.equal(payload().personalContext, revisedResumeB)
    assert.deepEqual(payload().interviewTarget, revisedTargetB)
    assert.ok(await rejection('removeResume', resumeA.id), 'a referenced resume must not be deleted')
    assert.ok(await rejection('removeTarget', profileA.id), 'a referenced target must not be deleted')
    const answers = (await page.evaluate(() => window.copilot.getHistory())).flatMap(value => value.answers)
    assert.deepEqual(answers.find(value => value.id === answerA.id), answerA)
    assert.deepEqual(answers.find(value => value.id === answerB.id), answerB)
  })

  await checkpoint('restart restores all profiles, environment selection, reference filters, and past answer snapshots', async () => {
    ;({ app, page } = await restart())
    const persisted = await library()
    assert.ok(persisted.resumes.some(value => value.id === resumeA.id && value.text === resumeA.text))
    assert.ok(persisted.resumes.some(value => value.id === resumeB.id && value.text === revisedResumeB))
    assert.ok(persisted.targets.some(value => value.id === profileA.id && value.jobDescription === targetA.jobDescription))
    assert.ok(persisted.targets.some(value => value.id === profileB.id && value.jobDescription === revisedTargetB.jobDescription))
    assert.equal(persisted.activeEnvironmentId, environmentB.id)
    assert.deepEqual((await settings()).interviewEnvironment.referenceIds, [referenceB.id])
    assert.equal((await settings()).context.text, revisedResumeB)
    const answers = (await page.evaluate(() => window.copilot.getHistory())).flatMap(value => value.answers)
    assert.deepEqual(answers.find(value => value.id === answerA.id), answerA)
    assert.deepEqual(answers.find(value => value.id === answerB.id), answerB)
    await generate('重启后的环境 B：Redis 和 MySQL 的性能问题怎样处理？')
    assert.ok(payload().referenceContext.every(value => value.documentId === referenceB.id))
    assert.equal(payload().personalContext, revisedResumeB)
    assert.deepEqual(payload().interviewTarget, revisedTargetB)
    assert.ok(mock.embeddingRequests.every(value => value.authorization === `Bearer ${fakeEmbeddingKey}`))
    assert.ok(mock.requests.every(value => value.authorization === `Bearer ${fakeChatKey}`))
    const records = await page.evaluate(() => window.copilot.getHistory())
    const historical = records.find(record => record.answers.some(answer => answer.id === answerA.id))
    await page.getByRole('button', { name: '会话记录', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(historical.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    await assertUnifiedContext(environmentA, targetA, [environmentB.name, revisedTargetB.companyName, 'JD_B_REVISION_ONLY_74'], 'environments-historical-context.png')
    report.unifiedInterviewContextScopeTested = true
    report.environmentIsolationTested = true
  })
}
