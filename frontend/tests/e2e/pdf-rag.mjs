import assert from 'node:assert/strict'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { syntheticResumeMarker, syntheticResumeChineseMarker, syntheticCacheMarker } from '../fixtures/pdf-rag.mjs'

const fakeLlmKey = 'sk-synthetic-rag-chat-not-real'
const fakeEmbeddingKey = 'sk-synthetic-rag-embedding-not-real'
const targetA = { companyName: '合成星河科技', roleName: '后端工程师', jobDescription: '合成岗位 A：关注订单可靠性、Redis 缓存一致性与故障排查。JD_A_ONLY_31' }
const targetB = { companyName: '合成山海实验室', roleName: '数据平台工程师', jobDescription: '合成岗位 B：关注 MySQL 查询性能、数据质量与稳定性。JD_B_ONLY_52' }

async function filesUnder(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(path))
    else files.push(path)
  }
  return files
}

/** Uses the app's real preload/IPC, local file extraction, storage, and HTTP transports. */
export async function checkPdfRag(options) {
  let { app, page } = options
  const { profile, fixtures, mock, checked, checkpoint, screenshot, report, restart } = options
  let cacheDocument
  let databaseDocument
  let retrievedAnswer
  let savedResume
  let savedTarget = targetB
  let targetProfileB
  let environmentB

  async function settingsPatch(patch) {
    return page.evaluate(async patch => {
      if (patch.context) {
        let library = await window.copilot.getInterviewLibrary()
        const environment = library.environments.find(value => value.id === library.activeEnvironmentId)
        const before = new Set(library.resumes.map(value => value.id))
        library = await window.copilot.saveResume({ ...patch.context, ...(environment.resumeId ? { id: environment.resumeId } : {}) })
        const resume = library.resumes.find(value => value.id === environment.resumeId) ?? library.resumes.find(value => !before.has(value.id))
        await window.copilot.saveEnvironment({ id: environment.id, name: environment.name, resumeId: resume.id,
          targetId: environment.targetId, referenceIds: environment.referenceIds })
      }
      const current = await window.copilot.getSettings()
      return window.copilot.saveSettings({ ...current, ...patch,
        asr: { ...current.asr, ...patch.asr }, llm: { ...current.llm, ...patch.llm },
        embedding: { ...current.embedding, ...patch.embedding } })
    }, patch)
  }
  async function chooseFiles(files) {
    await app.evaluate((_, files) => globalThis.__ragDialogSelections.push(files), files)
  }
  async function contextTab(name) {
    await page.getByRole('button', { name: '个人背景', exact: true }).click()
    await page.getByRole('tab', { name, exact: true }).click()
  }
  async function workspace() { await page.getByRole('button', { name: '工作台', exact: true }).click() }
  async function assertUnifiedContext(targets, absent = [], screenshotName) {
    const details = page.locator('details[aria-label="面试信息"]')
    await checked(details).toHaveCount(1)
    await details.locator('summary').click()
    await checked(details.getByRole('region', { name: '面试环境与目标详情', exact: true })).toBeVisible()
    for (const target of targets) for (const value of Object.values(target)) if (value) await checked(details).toContainText(value)
    for (const target of targets) if (target.jobDescription) await checked(details.getByText(target.jobDescription, { exact: true }).first()).toBeVisible()
    for (const value of absent) await checked(details).not.toContainText(value)
    if (targets.length > 1) await checked(details).toContainText('用于 Q')
    if (screenshotName) await screenshot(screenshotName)
    await details.locator('summary').click()
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
  }
  async function screenshotNarrow(name) {
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    try {
      await app.evaluate(({ BrowserWindow }, height) => BrowserWindow.getAllWindows()[0].setSize(900, height), bounds.height)
      await checked.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0])).toBe(900)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
      await screenshot(name)
    } finally { await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), bounds) }
  }
  async function setRetrievalEnabled(enabled) {
    const toggle = page.getByRole('switch', { name: '使用参考资料', exact: true })
    if (await toggle.isChecked() !== enabled) await toggle.click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).retrieval.enabled)).toBe(enabled)
    await checked(toggle).toBeChecked({ checked: enabled })
  }
  async function fillTarget(target, id) {
    await contextTab('目标岗位')
    if (id) await page.getByRole('combobox', { name: '选择目标岗位', exact: true }).selectOption(id)
    await page.getByLabel('面试公司', { exact: true }).fill(target.companyName)
    await page.getByLabel('岗位名称', { exact: true }).fill(target.roleName)
    await page.getByLabel('岗位 JD', { exact: false }).fill(target.jobDescription)
  }
  async function saveNewTarget(target, name) {
    await contextTab('目标岗位')
    await page.getByRole('button', { name: '新增岗位', exact: true }).click()
    await page.getByLabel('岗位方案名称', { exact: true }).fill(name)
    await fillTarget(target)
    await page.getByRole('button', { name: '保存岗位 JD', exact: true }).click()
    await checked.poll(() => page.evaluate(async name => (await window.copilot.getInterviewLibrary()).targets.some(value => value.name === name), name)).toBe(true)
    return page.evaluate(async name => (await window.copilot.getInterviewLibrary()).targets.find(value => value.name === name), name)
  }
  async function createEnvironment(name, targetId, referenceIds = []) {
    return page.evaluate(async input => {
      const settings = await window.copilot.getSettings()
      const library = await window.copilot.saveEnvironment({ name: input.name, resumeId: settings.interviewEnvironment.resumeId,
        targetId: input.targetId, referenceIds: input.referenceIds })
      return library.environments.find(value => value.name === input.name)
    }, { name, targetId, referenceIds })
  }
  async function enterEnvironment(environment) {
    await page.getByRole('button', { name: '面试环境', exact: true }).click()
    await page.getByRole('button', { name: `进入面试 ${environment.name}`, exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).interviewEnvironment.id)).toBe(environment.id)
    await workspace()
  }
  function payload(request = mock.requests.at(-1)) {
    return JSON.parse(request.body.messages.find(message => message.role === 'user').content)
  }
  async function generate(question) {
    await workspace()
    const baseline = mock.requests.length
    await page.getByLabel('当前问题', { exact: false }).fill(question)
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked.poll(() => mock.requests.length).toBe(baseline + 1)
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    await checked.poll(() => page.evaluate(async text => (await window.copilot.getHistory()).flatMap(record => record.answers)
      .findLast(answer => answer.question === text)?.status, question)).toBe('complete')
    const records = await page.evaluate(() => window.copilot.getHistory())
    const answer = records.flatMap(record => record.answers).findLast(answer => answer.question === question)
    assert.ok(answer, 'completed answer must be saved in history')
    assert.deepEqual(answer.modelInput, { model: mock.requests.at(-1).body.model, messages: mock.requests.at(-1).body.messages })
    assert.equal(JSON.stringify(answer.modelInput).includes(fakeLlmKey), false)
    assert.equal(JSON.stringify(answer.modelInput).includes(fakeEmbeddingKey), false)
    await checked(page.getByRole('article').locator('summary').filter({ hasText: /^本次(?:环境|目标)/ })).toHaveCount(0)
    return answer
  }

  await checkpoint('new settings are safe by default and test credentials stay outside the renderer', async () => {
    const defaults = await page.evaluate(() => window.copilot.getSettings())
    assert.deepEqual(defaults.interviewTarget, { companyName: '', roleName: '', jobDescription: '' })
    assert.equal(defaults.retrieval.enabled, false)
    assert.equal(defaults.embedding.hasApiKey, false)
    await settingsPatch({ llm: { baseUrl: mock.llmBaseUrl, model: 'mock-ui', apiKey: fakeLlmKey },
      asr: { url: `${mock.asrUrl}?mode=manual`, apiKey: 'sk-synthetic-rag-asr-not-real' },
      context: { name: '原有合成背景', text: 'ORIGINAL_BACKGROUND_ONLY_11' }, autoAnswer: { enabled: false, pauseMs: 1500 } })
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot))
    assert.equal(JSON.stringify(await page.evaluate(() => window.copilot.getSettings())).includes(fakeLlmKey), false)
  })

  await checkpoint('PDF resume preview, cancellation, saving, and extraction errors preserve the saved background', async () => {
    await contextTab('我的简历')
    await page.getByRole('combobox', { name: '选择简历', exact: true }).selectOption({ label: '原有合成背景' })
    const editor = page.getByLabel('简历与项目说明', { exact: false })
    const importButton = page.getByRole('button', { name: '导入 PDF / TXT / MD', exact: true })
    await chooseFiles(null)
    await importButton.click()
    await checked(editor).toHaveValue('ORIGINAL_BACKGROUND_ONLY_11')
    await chooseFiles([fixtures.resume])
    await importButton.click()
    await checked(editor).toHaveValue(new RegExp(syntheticResumeMarker))
    await checked(editor).toHaveValue(new RegExp(syntheticResumeChineseMarker))
    assert.equal((await page.evaluate(() => window.copilot.getSettings())).context.text, 'ORIGINAL_BACKGROUND_ONLY_11')
    await screenshot('pdf-resume-preview.png')
    await page.getByRole('button', { name: '还原已保存内容', exact: true }).click()
    await checked(editor).toHaveValue('ORIGINAL_BACKGROUND_ONLY_11')
    await chooseFiles([fixtures.resume])
    await importButton.click()
    await checked(editor).toHaveValue(new RegExp(syntheticResumeMarker))
    savedResume = `${await editor.inputValue()}\n合成简历人工校对：参与过演示订单服务。`
    await editor.fill(savedResume)
    await page.getByRole('button', { name: '保存背景', exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).context.text)).toBe(savedResume)
    for (const invalid of [fixtures.blank, fixtures.broken]) {
      await chooseFiles([invalid])
      await importButton.click()
      await checked(page.getByRole('tabpanel', { name: '我的简历', exact: true }).getByRole('alert')).toBeVisible()
      await checked(editor).toHaveValue(savedResume)
      assert.equal((await page.evaluate(() => window.copilot.getSettings())).context.text, savedResume)
    }
  })

  await checkpoint('entering a new interview environment archives the old dialogue while saving a target alone preserves it', async () => {
    const targetProfileA = await saveNewTarget(targetA, 'RAG 合成岗位 A')
    const environmentA = await createEnvironment('RAG 合成环境 A', targetProfileA.id)
    await enterEnvironment(environmentA)
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).interviewTarget)).toEqual(targetA)
    await workspace()
    // Generate audio internally; neither microphone nor operating-system display capture is invoked.
    await page.evaluate(() => {
      window.__ragAudioContexts = []
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
        const context = new AudioContext()
        const oscillator = context.createOscillator()
        const destination = context.createMediaStreamDestination()
        oscillator.connect(destination); oscillator.start()
        window.__ragAudioContexts.push(context)
        await context.resume()
        return destination.stream
      } })
    })
    const connections = mock.asrConnections.length
    await page.getByRole('button', { name: '系统音频', exact: true }).click()
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(connections + 1)
    const oldTranscript = 'OLD_INTERVIEW_TRANSCRIPT_ONLY_64：旧场次讨论打印队列。'
    mock.sendSentence(connections, { sentenceId: 0, text: oldTranscript, isFinal: true })
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveValue(oldTranscript)
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    await page.evaluate(() => Promise.all(window.__ragAudioContexts.map(context => context.close())))
    const oldQuestion = '旧岗位中怎么保证打印队列可靠性？'
    const answer = await generate(oldQuestion)
    assert.deepEqual(payload().interviewTarget, targetA)
    assert.deepEqual(answer.interviewTarget, targetA)
    assert.equal(payload().personalContext, savedResume)
    assert.ok(payload().transcript.includes(oldTranscript))
    assert.deepEqual(payload().referenceContext, [])
    await page.getByLabel('当前问题', { exact: false }).fill('OLD_UNSUBMITTED_DRAFT_ONLY_27')
    targetProfileB = await saveNewTarget(targetB, 'RAG 合成岗位 B')
    assert.deepEqual((await page.evaluate(() => window.copilot.getSettings())).interviewTarget, targetA)
    await page.getByLabel('岗位 JD', { exact: false }).fill('合'.repeat(12001))
    assert.equal((await page.getByLabel('岗位 JD', { exact: false }).inputValue()).length, 12001)
    await checked(page.getByRole('button', { name: '保存岗位 JD', exact: true })).toBeDisabled()
    assert.deepEqual((await page.evaluate(() => window.copilot.getSettings())).interviewTarget, targetA)
    await page.getByLabel('岗位 JD', { exact: false }).fill(targetB.jobDescription)
    await screenshot('interview-target-editor.png')
    await workspace()
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue('OLD_UNSUBMITTED_DRAFT_ONLY_27')
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveValue(oldTranscript)
    environmentB = await createEnvironment('RAG 合成环境 B', targetProfileB.id)
    await enterEnvironment(environmentB)
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).interviewTarget)).toEqual(targetB)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue('')
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveCount(0)
    await checked(page.getByRole('article')).toHaveCount(0)
    const next = await generate('新岗位如何优化 MySQL 查询？')
    assert.deepEqual(payload().interviewTarget, targetB)
    assert.deepEqual(next.interviewTarget, targetB)
    assert.equal(payload().transcript, '')
    assert.equal(JSON.stringify(payload()).includes('OLD_'), false)
    await assertUnifiedContext([targetB], [targetA.companyName, 'JD_A_ONLY_31'])
    const oldRecord = (await page.evaluate(() => window.copilot.getHistory())).find(record => record.answers.some(value => value.question === oldQuestion))
    assert.ok(oldRecord.segments.some(value => value.text === oldTranscript))
    assert.deepEqual(oldRecord.answers.find(value => value.question === oldQuestion).interviewTarget, targetA)
    await screenshot('interview-target.png')
  })

  await checkpoint('PDF and text references import without embeddings and remain previewable after originals move', async () => {
    await contextTab('参考资料')
    await chooseFiles([fixtures.cache, fixtures.database])
    await page.getByRole('button', { name: '导入参考资料', exact: true }).click()
    // Documents become visible before worker extraction finishes; await the completed import state.
    await checked.poll(() => page.evaluate(async () => (await window.copilot.listReferences()).map(document => document.status))).toEqual(['pending', 'pending'])
    const documents = await page.evaluate(() => window.copilot.listReferences())
    cacheDocument = documents.find(value => value.name === 'synthetic-cache-reference.pdf')
    databaseDocument = documents.find(value => value.name === 'synthetic-database-reference.txt')
    assert.equal(cacheDocument.pageCount, 2)
    assert.ok(cacheDocument.chunkCount > 0)
    assert.ok(databaseDocument.chunkCount > 0)
    assert.ok(documents.every(value => value.status === 'pending' && value.kind === 'technical'))
    assert.equal(mock.embeddingRequests.length, 0)
    assert.deepEqual((await page.evaluate(() => window.copilot.getSettings())).interviewEnvironment.referenceIds, [])
    await page.evaluate(environment => window.copilot.saveEnvironment(environment), {
      id: environmentB.id, name: environmentB.name, resumeId: environmentB.resumeId,
      targetId: environmentB.targetId, referenceIds: [cacheDocument.id, databaseDocument.id],
    })
    await checked(page.getByRole('article', { name: `参考资料 ${cacheDocument.name}`, exact: true }).getByRole('status')).toHaveText('等待建索引')
    await rm(fixtures.cache)
    await page.getByRole('button', { name: `预览资料 ${cacheDocument.name}`, exact: true }).click()
    await checked(page.getByRole('dialog', { name: cacheDocument.name, exact: true })).toContainText(syntheticCacheMarker)
    await screenshot('reference-pdf-preview.png')
    await page.getByRole('button', { name: '关闭资料预览', exact: true }).click()
    const files = await filesUnder(profile)
    const database = files.find(path => path.endsWith('references.sqlite'))
    assert.ok(database)
    assert.equal((await readFile(database)).subarray(0, 16).toString(), 'SQLite format 3\0')
    report.sqlitePersistenceTested = true
    report.pdfTextExtractionTested = true
  })

  await checkpoint('independent embedding settings save securely and index both PDF and text references', async () => {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await page.getByLabel('向量 API 地址', { exact: true }).fill(mock.llmBaseUrl)
    await page.getByLabel('向量模型', { exact: true }).fill('mock-embedding')
    await page.getByLabel('向量维度', { exact: true }).fill('256')
    await page.getByLabel('向量 API Key', { exact: false }).fill(fakeEmbeddingKey)
    await page.getByRole('button', { name: '保存并测试向量模型', exact: true }).click()
    await checked.poll(() => mock.embeddingRequests.length).toBeGreaterThan(0)
    await checked(page.getByRole('dialog').getByRole('status')).toContainText('设置已保存')
    await screenshot('embedding-settings.png')
    await page.getByRole('button', { name: '关闭设置', exact: true }).click()
    const settings = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(settings.embedding.hasApiKey, true)
    assert.equal(settings.embedding.dimensions, 256)
    assert.equal(JSON.stringify(settings).includes(fakeEmbeddingKey), false)
    const settingsFile = (await filesUnder(profile)).find(path => path.endsWith('/settings.json'))
    assert.ok(settingsFile)
    const persisted = await readFile(settingsFile, 'utf8')
    assert.equal(persisted.includes(fakeEmbeddingKey), false)
    assert.equal(persisted.includes(fakeLlmKey), false)
    await contextTab('参考资料')
    for (const document of [cacheDocument, databaseDocument]) {
      await page.getByRole('button', { name: `重建索引 ${document.name}`, exact: true }).click()
      await checked.poll(() => page.evaluate(async id => (await window.copilot.listReferences()).find(value => value.id === id)?.status, document.id)).toBe('ready')
      await checked(page.getByRole('article', { name: `参考资料 ${document.name}`, exact: true }).getByRole('status')).toHaveText('可用')
    }
    assert.ok(mock.embeddingRequests.every(request => request.authorization === `Bearer ${fakeEmbeddingKey}`))
    assert.ok(mock.embeddingRequests.every(request => request.body.dimensions === 256))
    assert.ok(JSON.stringify(mock.embeddingRequests.map(request => request.body.input)).includes(syntheticCacheMarker))
    assert.ok(JSON.stringify(mock.embeddingRequests.map(request => request.body.input)).includes('MYSQL_REFERENCE_ONLY_89'))
    await setRetrievalEnabled(true)
    await page.getByRole('combobox', { name: `资料用途 ${databaseDocument.name}`, exact: true }).selectOption('personal')
    await checked.poll(() => page.evaluate(async id => (await window.copilot.listReferences()).find(value => value.id === id)?.kind, databaseDocument.id)).toBe('personal')
    await page.getByRole('heading', { name: '个人背景', exact: true }).scrollIntoViewIfNeeded()
    await screenshot('reference-library.png')
    await screenshotNarrow('reference-library-900.png')
  })

  await checkpoint('retrieval sends matching source snapshots with the JD and copy uses only the spoken answer body', async () => {
    retrievedAnswer = await generate('Redis 缓存一致性应该怎么处理？')
    assert.equal(retrievedAnswer.retrieval.status, 'ready')
    assert.ok(retrievedAnswer.retrieval.excerpts.some(excerpt => excerpt.documentId === cacheDocument.id))
    assert.ok(retrievedAnswer.retrieval.excerpts.filter(excerpt => excerpt.documentId === cacheDocument.id).every(excerpt => excerpt.pageStart >= 1 && excerpt.pageStart <= 2))
    assert.deepEqual(payload().referenceContext, retrievedAnswer.retrieval.excerpts)
    assert.deepEqual(payload().interviewTarget, savedTarget)
    assert.equal(payload().personalContext, savedResume)
    assert.ok(payload().referenceContext.every(excerpt => excerpt.kind === 'technical'))
    assert.equal(mock.requests.at(-1).authorization, `Bearer ${fakeLlmKey}`)
    const card = page.getByRole('article').last()
    await card.getByText('本次检索资料', { exact: true }).click()
    await checked(card.getByText(cacheDocument.name, { exact: true }).first()).toBeVisible()
    await checked(card.getByText(/第 [12](?:–2)? 页/).first()).toBeVisible()
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true,
      value: async text => { window.__ragCopiedText = text } }))
    await card.getByRole('button', { name: '复制回答', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__ragCopiedText), retrievedAnswer.text)
    assert.equal((await page.evaluate(() => window.__ragCopiedText)).includes(cacheDocument.name), false)
    await card.getByText(cacheDocument.name, { exact: true }).first().evaluate(element => element.scrollIntoView({ block: 'center' }))
    await screenshot('reference-answer.png')
    await screenshotNarrow('reference-answer-900.png')
  })

  await checkpoint('an in-flight answer keeps its JD snapshot while later answers use the saved revision', async () => {
    await settingsPatch({ llm: { model: 'mock-held' } })
    const baseline = mock.requests.length
    const question = 'Redis 缓存更新失败时如何恢复？'
    await page.getByLabel('当前问题', { exact: false }).fill(question)
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked.poll(() => mock.isStreamHeld(baseline)).toBe(true)
    assert.deepEqual(payload(mock.requests[baseline]).interviewTarget, savedTarget)
    const previousTarget = savedTarget
    savedTarget = { ...savedTarget, jobDescription: `${savedTarget.jobDescription}\nJD_REVISION_ONLY_88：补充发布回滚要求。` }
    await fillTarget(savedTarget, targetProfileB.id)
    await page.getByRole('button', { name: '保存岗位 JD', exact: true }).click()
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).interviewTarget)).toEqual(savedTarget)
    mock.finishStream(baseline)
    await workspace()
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    const records = await page.evaluate(() => window.copilot.getHistory())
    const original = records.flatMap(record => record.answers).find(value => value.question === question)
    assert.deepEqual(original.interviewTarget, previousTarget)
    assert.deepEqual(original.modelInput, { model: mock.requests[baseline].body.model, messages: mock.requests[baseline].body.messages })
    assert.equal(JSON.stringify(original.modelInput).includes('JD_REVISION_ONLY_88'), false)
    assert.deepEqual(payload(mock.requests[baseline]).interviewTarget, previousTarget)
    await assertUnifiedContext([previousTarget], ['JD_REVISION_ONLY_88'])
    await settingsPatch({ llm: { model: 'mock-ui' } })
    const next = await generate('Redis 缓存失效需要哪些监控？')
    assert.deepEqual(next.interviewTarget, savedTarget)
    await assertUnifiedContext([previousTarget, savedTarget], [], 'reference-multiple-contexts.png')
    assert.deepEqual(payload().interviewTarget, savedTarget)
  })

  await checkpoint('per-answer input disclosure shows exact model messages, supports keyboard access and copies the complete snapshot', async () => {
    const card = page.getByRole('article').last()
    const summary = card.locator('summary').filter({ hasText: '本次发送内容' })
    const region = card.getByRole('region', { name: '本次发送的完整文字', exact: true })
    await checked(region).toBeHidden()
    await summary.focus()
    await page.keyboard.press('Enter')
    await checked(region).toBeVisible()
    assert.deepEqual(await region.locator('pre').allTextContents(), mock.requests.at(-1).body.messages.map(message => message.content))
    await card.getByRole('button', { name: '复制发送内容', exact: true }).click()
    const copied = await page.evaluate(() => window.__ragCopiedText)
    assert.deepEqual(JSON.parse(copied), { model: mock.requests.at(-1).body.model, messages: mock.requests.at(-1).body.messages })
    assert.equal(copied.includes(fakeLlmKey), false)
    await checked(card.getByRole('button', { name: '已复制发送内容', exact: true })).toBeVisible()
    await card.locator('header').first().evaluate(element => element.scrollIntoView({ block: 'start' }))
    await screenshot('model-input.png')
    await screenshotNarrow('model-input-900.png')
    await summary.focus()
    await page.keyboard.press('Enter')
    await checked(region).toBeHidden()
    await card.locator('header').first().evaluate(element => element.scrollIntoView({ block: 'start' }))
    await screenshot('model-input-collapsed.png')
  })

  await checkpoint('cancelling retrieval suppresses the model call and fast question replacement never reuses stale sources', async () => {
    const requests = mock.requests.length
    const embedding = mock.embeddingRequests.length
    await page.evaluate(() => {
      window.__ragAnswerEvents = []
      window.copilot.onEvent(event => { if (event.kind.startsWith('answer-')) window.__ragAnswerEvents.push(event) })
    })
    const editor = page.getByLabel('当前问题', { exact: false })
    mock.setEmbeddingMode('timeout')
    try {
      await editor.fill('取消检查：Redis 缓存一致性如何保证？')
      await page.getByRole('button', { name: '生成回答', exact: true }).click()
      await checked.poll(() => mock.embeddingRequests.length).toBe(embedding + 1)
      await page.getByRole('button', { name: '停止生成', exact: true }).click()
      await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeEnabled()
      await checked.poll(() => mock.embeddingRequests[embedding].cancelled).toBe(true)
      assert.equal(mock.requests.length, requests)
      const staleQuestion = '被替换的问题：Redis 缓存击穿如何处理？'
      await editor.fill(staleQuestion)
      await page.getByRole('button', { name: '生成回答', exact: true }).click()
      await checked.poll(() => mock.embeddingRequests.length).toBe(embedding + 2)
      mock.setEmbeddingMode('fast')
      const nextQuestion = 'MySQL 慢查询如何利用 EXPLAIN 检查索引？'
      await editor.fill(nextQuestion)
      await editor.press('Meta+Enter')
      await checked.poll(() => mock.requests.length).toBe(requests + 1)
      await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
      assert.equal(payload().question, nextQuestion)
      assert.ok(payload().referenceContext.some(excerpt => excerpt.documentId === databaseDocument.id))
      assert.ok(payload().referenceContext.every(excerpt => excerpt.documentId !== cacheDocument.id))
      await checked.poll(() => mock.embeddingRequests[embedding + 1].cancelled).toBe(true)
      const contextEvents = await page.evaluate(() => window.__ragAnswerEvents.filter(event => event.kind === 'answer-context'))
      assert.equal(contextEvents.length, 1, 'cancelled and replaced requests must not publish stale source snapshots')
      assert.deepEqual(contextEvents[0].retrieval.excerpts, payload().referenceContext)
      const inputEvents = await page.evaluate(() => window.__ragAnswerEvents.filter(event => event.kind === 'answer-request'))
      assert.equal(inputEvents.length, 1, 'requests cancelled before submission must not publish input snapshots')
      assert.deepEqual(inputEvents[0].modelInput.messages, mock.requests.at(-1).body.messages)
      const oldCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: staleQuestion, exact: true }) })
      await checked(oldCard.getByText('已停止', { exact: true })).toBeVisible()
      await checked(oldCard.getByText('本次检索资料', { exact: true })).toHaveCount(0)
    } finally { mock.setEmbeddingMode('fast') }
  })

  await checkpoint('query embedding timeout falls back to keywords and still supplies the saved JD', async () => {
    const baseline = mock.embeddingRequests.length
    mock.setEmbeddingMode('timeout')
    try {
      const answer = await generate('Redis cache invalidation 失败后怎样检查缓存？')
      assert.ok(mock.embeddingRequests.length > baseline)
      assert.equal(answer.retrieval.status, 'degraded')
      assert.ok(answer.retrieval.excerpts.some(excerpt => excerpt.documentId === cacheDocument.id))
      assert.deepEqual(payload().referenceContext, answer.retrieval.excerpts)
      assert.deepEqual(payload().interviewTarget, savedTarget)
      assert.ok(mock.embeddingRequests.slice(baseline).some(request => request.cancelled))
      await page.getByRole('article').last().getByText('本次检索资料', { exact: true }).click()
      await checked(page.getByRole('article').last()).toContainText(/关键词|降级|超时/)
    } finally { mock.setEmbeddingMode('fast') }
  })

  await checkpoint('turning retrieval off and disabling or deleting a document excludes it from later requests', async () => {
    await contextTab('参考资料')
    await setRetrievalEnabled(false)
    const baseline = mock.embeddingRequests.length
    const off = await generate('Redis 缓存过期时间如何选择？')
    assert.equal(off.retrieval.status, 'disabled')
    assert.deepEqual(payload().referenceContext, [])
    assert.deepEqual(payload().interviewTarget, savedTarget)
    assert.equal(mock.embeddingRequests.length, baseline)
    await contextTab('参考资料')
    await page.getByRole('checkbox', { name: `启用资料 ${cacheDocument.name}`, exact: true }).click()
    await checked.poll(() => page.evaluate(async id => (await window.copilot.listReferences()).find(value => value.id === id)?.enabled, cacheDocument.id)).toBe(false)
    await setRetrievalEnabled(true)
    const disabled = await generate('Redis 缓存热点数据怎样刷新？')
    assert.ok(disabled.retrieval.excerpts.every(excerpt => excerpt.documentId !== cacheDocument.id))
    await contextTab('参考资料')
    await page.getByRole('button', { name: `移除资料 ${cacheDocument.name}`, exact: true }).click()
    await checked.poll(() => page.evaluate(async id => (await window.copilot.listReferences()).some(value => value.id === id), cacheDocument.id)).toBe(false)
    const removed = await generate('Redis cache-aside 是什么？')
    assert.ok(removed.retrieval.excerpts.every(excerpt => excerpt.documentId !== cacheDocument.id))
    const records = await page.evaluate(() => window.copilot.getHistory())
    const original = records.flatMap(record => record.answers).find(value => value.id === retrievedAnswer.id)
    assert.deepEqual(original.retrieval, retrievedAnswer.retrieval)
    assert.deepEqual(original.interviewTarget, retrievedAnswer.interviewTarget)
  })

  await checkpoint('restart restores the resume, JD, independent encrypted key, remaining index, and historical source snapshots', async () => {
    ;({ app, page } = await restart())
    const settings = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(settings.context.text, savedResume)
    assert.deepEqual(settings.interviewTarget, savedTarget)
    assert.equal(settings.embedding.hasApiKey, true)
    assert.equal(settings.embedding.dimensions, 256)
    const documents = await page.evaluate(() => window.copilot.listReferences())
    assert.equal(documents.length, 1)
    assert.equal(documents[0].id, databaseDocument.id)
    assert.equal(documents[0].status, 'ready')
    const records = await page.evaluate(() => window.copilot.getHistory())
    const record = records.find(value => value.answers.some(answer => answer.id === retrievedAnswer.id))
    assert.deepEqual(record.answers.find(value => value.id === retrievedAnswer.id).retrieval, retrievedAnswer.retrieval)
    assert.deepEqual(record.answers.find(value => value.id === retrievedAnswer.id).modelInput, retrievedAnswer.modelInput)
    await page.getByRole('button', { name: '会话记录', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(record.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    await assertUnifiedContext([retrievedAnswer.interviewTarget, savedTarget], [targetA.companyName], 'reference-history-contexts.png')
    report.multipleHistoricalContextsTested = true
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: retrievedAnswer.question, exact: true }) })
    await card.getByText('本次检索资料', { exact: true }).click()
    await checked(card.getByText(cacheDocument.name, { exact: true }).first()).toBeVisible()
    await card.locator('summary').filter({ hasText: '本次发送内容' }).click()
    assert.deepEqual(await card.getByRole('region', { name: '本次发送的完整文字', exact: true }).locator('pre').allTextContents(), retrievedAnswer.modelInput.messages.map(message => message.content))
    await screenshot('reference-history.png')
    await page.evaluate(() => window.copilot.testEmbedding())
    assert.equal(mock.embeddingRequests.at(-1).authorization, `Bearer ${fakeEmbeddingKey}`)
    const answer = await generate('MySQL 慢查询如何分析索引覆盖和扫描行数？')
    assert.ok(answer.retrieval.excerpts.some(excerpt => excerpt.documentId === databaseDocument.id))
    assert.ok(answer.retrieval.excerpts.filter(excerpt => excerpt.documentId === databaseDocument.id).every(excerpt => excerpt.kind === 'personal'))
    assert.deepEqual(payload().interviewTarget, savedTarget)
  })

  await checkpoint('entering an environment without a target removes the previous JD while keeping old answer snapshots', async () => {
    const emptyEnvironment = await createEnvironment('RAG 无岗位环境', null, [databaseDocument.id])
    assert.deepEqual((await page.evaluate(() => window.copilot.getSettings())).interviewTarget, savedTarget)
    await enterEnvironment(emptyEnvironment)
    const emptyTarget = { companyName: '', roleName: '', jobDescription: '' }
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).interviewTarget)).toEqual(emptyTarget)
    await generate('MySQL 的 EXPLAIN 有哪些用途？')
    assert.deepEqual(payload().interviewTarget, emptyTarget)
    assert.equal(JSON.stringify(payload()).includes('JD_B_ONLY_52'), false)
    const records = await page.evaluate(() => window.copilot.getHistory())
    assert.ok(records.flatMap(record => record.answers).some(answer => answer.interviewTarget?.jobDescription.includes('JD_B_ONLY_52')))
  })
}
