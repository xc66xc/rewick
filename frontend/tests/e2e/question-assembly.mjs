import assert from 'node:assert/strict'
import { startRemoteKnowledgeMock } from '../../scripts/mock-remote-knowledge.mjs'

/** Real Electron/IPC with synthetic audio, manually controlled ASR and loopback-only model/RAG services. */
export async function checkQuestionAssembly({ app, page, mock, checked, checkpoint, settingsPatch, screenshot, report }) {
  const saved = await page.evaluate(() => window.copilot.getSettings())
  const originalBounds = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).getBounds())
  const remote = await startRemoteKnowledgeMock()
  const composer = page.getByRole('textbox', { name: '当前问题', exact: true })
  const assembling = page.getByRole('status').filter({ hasText: /^正在合并问题$/ })
  const paused = page.getByRole('status').filter({ hasText: /^正在合并问题，自动回答暂缓；提交或清空后恢复$/ })
  const clear = page.getByRole('button', { name: '清空当前问题', exact: true })
  const silenceMs = 1500
  const observations = { providerMode: 'synthetic audio and loopback HTTP/SSE/WebSocket', quietWindows: [], layouts: [] }
  report.questionAssembly = observations

  function counts() { return { model: mock.requests.length, remote: remote.requests.length, embedding: mock.embeddingRequests.length } }
  function payload(request = mock.requests.at(-1)) { return JSON.parse(request.body.messages.find(value => value.role === 'user').content) }
  function editor(index) { return page.getByRole('textbox', { name: `转写文字 ${index + 1}`, exact: true }) }
  function row(index) { return page.getByRole('listitem').filter({ has: editor(index) }) }
  function joinButton(index) { return row(index).getByRole('button', { name: /^加入问题：/ }) }

  async function normalWindow() {
    const restore = page.getByRole('button', { name: '恢复完整窗口', exact: true })
    if (await restore.count()) await restore.click()
    await checked(page.getByRole('button', { name: '紧凑模式', exact: true })).toBeVisible()
  }
  async function reset() {
    await normalWindow()
    const cancel = page.getByRole('button', { name: '停止生成', exact: true })
    if (await cancel.count()) await cancel.click()
    const stop = page.getByRole('button', { name: '停止转写', exact: true })
    if (await stop.count()) await stop.click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '新会话', exact: true }).click()
    await checked(page.getByRole('article')).toHaveCount(0)
    await checked(page.getByRole('textbox', { name: /^转写文字 / })).toHaveCount(0)
    await checked(composer).toHaveValue('')
    await checked(assembling).toHaveCount(0)
  }
  async function start(model = 'mock-ui') {
    await settingsPatch({ llm: { model }, asr: { url: `${mock.asrUrl}?mode=manual` } })
    await page.getByRole('button', { name: '系统音频', exact: true }).click()
    const connections = mock.asrConnections.length
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(connections + 1)
    await checked.poll(() => mock.asrConnections[connections].hasNonzeroPcm).toBe(true)
    assert.ok(await page.evaluate(() => window.__questionAssemblyDisplayCalls > 0), 'system capture must use the fake-media substitute')
    return connections
  }
  async function sentence(connection, index, text, isFinal = true) {
    mock.sendSentence(connection, { sentenceId: index, text, isFinal })
    await checked(editor(index)).toHaveValue(text)
  }
  async function joined(index, expected) {
    // v30 speech-actions: 历史条操作按钮默认收起，先悬停所在行展开。
    await row(index).hover()
    await joinButton(index).click()
    await checked(composer).toHaveValue(expected)
    await checked(assembling).toBeVisible()
    await checked(paused).toBeVisible()
    await checked(composer).not.toBeFocused()
  }
  async function quiet(before, label) {
    const cards = await page.getByRole('article').count()
    // A complete silence window is necessary to prove that a cancelled debounce/queue never submits.
    await new Promise(resolve => setTimeout(resolve, silenceMs + 350))
    assert.deepEqual(counts(), before, `${label}: joining/paused transcription must not call a model, remote search or embeddings`)
    await checked(page.getByRole('article')).toHaveCount(cards)
    observations.quietWindows.push({ label, durationMs: silenceMs + 350, counts: { ...before } })
  }
  async function oneRequest(before, question, { held = false } = {}) {
    await checked.poll(() => mock.requests.length).toBe(before.model + 1)
    await checked.poll(() => remote.requests.length).toBe(before.remote + 1)
    assert.equal(mock.embeddingRequests.length, before.embedding, 'remote-only retrieval must not invoke query embeddings')
    const request = mock.requests[before.model]
    assert.equal(payload(request).question, question)
    assert.equal(remote.requests[before.remote].body.query, question)
    assert.deepEqual(remote.requests[before.remote].body, { agent_id: 'synthetic-question-assembly-agent', query: question, images: [] })
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: question.replace(/\s+/g, ' ').trim(), exact: true }) })
    await checked(card).toHaveCount(1)
    if (held) await checked.poll(() => mock.isStreamHeld(before.model)).toBe(true)
    else {
      await checked(card.getByText('已完成', { exact: true })).toBeVisible()
      await checked.poll(() => page.evaluate(async question => (await window.copilot.getHistory()).flatMap(value => value.answers)
        .findLast(answer => answer.question === question)?.status, question)).toBe('complete')
    }
    return { request, card, index: before.model }
  }
  async function inputSize(label, expanded) {
    const metrics = await composer.evaluate(element => {
      const style = getComputedStyle(element)
      return { height: element.getBoundingClientRect().height, clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight, rows: element.rows, lineHeight: Number.parseFloat(style.lineHeight),
        minHeight: Number.parseFloat(style.minHeight) || 0, inlineHeight: element.style.height,
        padding: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
        border: Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth) }
    })
    const maximum = Math.max(metrics.minHeight, metrics.lineHeight * (expanded ? 3 : 1) + metrics.padding + metrics.border)
    assert.equal(metrics.rows, 1)
    assert.ok(metrics.height <= maximum + 1, `${label}: question input must stay within ${expanded ? 'three lines' : 'one line'}; ${JSON.stringify(metrics)}`)
    if (expanded) {
      assert.ok(metrics.height > metrics.lineHeight + metrics.padding + metrics.border + 1)
      assert.ok(metrics.scrollHeight > metrics.clientHeight, `${label}: a longer assembled question must scroll within its capped input`)
    } else assert.equal(metrics.inlineHeight, '', `${label}: leaving assembly must restore the native one-line input style`)
    await checked(composer).toBeInViewport()
    observations.layouts.push({ label, ...metrics })
  }

  try {
    await page.addInitScript(() => {
      window.__questionAssemblyDisplayCalls = 0
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: async () => {
          window.__questionAssemblyDisplayCalls += 1
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        },
      })
    })
    await settingsPatch({ llm: { baseUrl: mock.llmBaseUrl, model: 'mock-ui' },
      asr: { url: `${mock.asrUrl}?mode=manual` }, autoAnswer: { enabled: true, pauseMs: silenceMs },
      retrieval: { ...saved.retrieval, enabled: false },
      remoteKnowledge: { enabled: true, url: remote.url, agentId: 'synthetic-question-assembly-agent', apiKey: 'sk-question-assembly-synthetic-only' } })
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot))
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).setSize(1100, 760))

    await checkpoint('joining transcript segments preserves an existing draft and click order without retrieval until one complete submission', async () => {
      await reset()
      const connection = await start()
      const before = counts()
      const draft = '请结合高并发场景回答。'
      const first = '你如何设计订单系统的幂等接口？'
      const second = '数据库与缓存之间怎样保持一致？'
      const third = '出现异常重试时还需要关注什么？'
      await composer.fill(draft)
      await sentence(connection, 0, first)
      await sentence(connection, 1, second)
      await sentence(connection, 2, third, false)
      await joined(1, `${draft}\n${second}`)
      await joined(0, `${draft}\n${second}\n${first}`)
      const question = `${draft}\n${second}\n${first}\n${third}`
      await joined(2, question)
      await quiet(before, 'three segments appended in 2/1/3 click order')
      await screenshot('question-assembly-order.png')
      await page.getByRole('button', { name: '生成回答', exact: true }).click()
      await checked(composer).toHaveValue('')
      await checked(assembling).toHaveCount(0)
      await oneRequest(before, question)
      await quiet(counts(), 'submitted assembly does not replay its constituent segments')
      report.questionAssemblyOrderAndSingleRequestTested = true
    })

    await checkpoint('joining a focused transcript snapshots visible text before buffered ASR blur updates and later revisions', async () => {
      await reset()
      const connection = await start()
      const before = counts()
      const visible = '你会如何分析缓存中的性能问题？'
      const pending = '你会如何分析缓存中的性能问题，以及数据库连接池、线程池和队列中积压的请求？'
      await sentence(connection, 0, visible, false)
      await sentence(connection, 1, '这是一段尚未结束的背景说明。', false)
      await editor(0).click()
      mock.sendSentence(connection, { sentenceId: 0, text: pending, isFinal: true })
      await sentence(connection, 1, '这段说明用于确认前面的修订已经送达。', false)
      await checked(editor(0)).toHaveValue(visible)
      await checked(editor(0)).toBeFocused()
      await joined(0, visible)
      await checked(editor(0)).toHaveValue(pending)
      await sentence(connection, 0, '你会如何分析缓存和数据库之间的性能差异？')
      await checked(composer).toHaveValue(visible)
      await quiet(before, 'focused visible snapshot and later ASR revisions')
      await screenshot('question-assembly-visible-snapshot.png')
      report.questionAssemblyVisibleSnapshotTested = true
    })

    await checkpoint('joining before a silence deadline pauses all assembly-era segments and clearing resumes only genuinely new questions', async () => {
      await reset()
      const connection = await start()
      const before = counts()
      const question = '你如何设计数据库的索引？'
      await sentence(connection, 0, question)
      await checked(page.getByRole('status').filter({ hasText: /^问题已定稿，等待停顿$/ })).toBeVisible()
      // Let most of the real silence window elapse, then join before its scheduled submission.
      await new Promise(resolve => setTimeout(resolve, 900))
      await joined(0, question)
      await sentence(connection, 1, '你如何验证数据库迁移', false)
      await sentence(connection, 2, '你如何处理数据库迁移中的失败？')
      for (let index = 3; index <= 7; index += 1) {
        await sentence(connection, index, `第${index}段合成背景说明：这里补充数据库迁移中的访问规模、部署顺序和失败重试，以确认转写列表在合并期间继续接收完整内容。`, false)
      }
      const reading = await editor(0).evaluate(element => {
        const viewport = element.closest('ol').parentElement
        const overflow = viewport.scrollHeight - viewport.clientHeight
        viewport.scrollTop = Math.min(100, overflow / 2)
        return { top: viewport.scrollTop, overflow }
      })
      assert.ok(reading.overflow > 150 && reading.top > 0, 'transcription must actually overflow before testing its reading position')
      await sentence(connection, 8, '这段后到的合成字幕应追加到列表，但不能抢走当前正在阅读的位置。', false)
      await sentence(connection, 2, '你如何处理数据库迁移中的超时？')
      await quiet(before, 'joining cancels a pending silence deadline and ignores new assembly-era segments')
      const after = await editor(0).evaluate(element => element.closest('ol').parentElement.scrollTop)
      assert.ok(Math.abs(after - reading.top) <= 1, `assembly transcription reading position moved from ${reading.top}px to ${after}px`)
      observations.transcriptScroll = { ...reading, after }
      await clear.click()
      await checked(composer).toHaveValue('')
      await checked(assembling).toHaveCount(0)
      await inputSize('cleared-assembly', false)
      await sentence(connection, 0, '你如何设计数据库的组合索引？')
      await sentence(connection, 1, '你如何验证数据库迁移的数据一致性？')
      await sentence(connection, 2, '你如何处理数据库迁移中的失败和回滚？')
      await quiet(before, 'cleared assembly must not replay old IDs or finalize an old interim into a new request')
      const future = '你如何设计支付系统的容灾方案？'
      await sentence(connection, 9, future)
      await oneRequest(before, future)
      await checked(composer).toHaveValue('')
      await checked(page.getByRole('switch', { name: '自动回答', exact: true })).toBeChecked()
      await screenshot('question-assembly-resumed.png')
      report.questionAssemblyPauseAndResumeTested = true
    })

    await checkpoint('an older held answer may finish while sentence answers and cancellation preserve the assembled draft and pause', async () => {
      await reset()
      const connection = await start('mock-held')
      const before = counts()
      const older = '你如何设计一个订单系统？'
      await sentence(connection, 0, older)
      const oldAnswer = await oneRequest(before, older, { held: true })
      const draft = '你如何排查系统中的异常请求？'
      await sentence(connection, 1, draft)
      await checked(page.getByRole('status').filter({ hasText: /^等当前回答完成$/ })).toBeVisible()
      await joined(1, draft)
      const selected = '你如何设计缓存失效策略？'
      await sentence(connection, 2, selected)
      await sentence(connection, 3, '你如何处理消息重试', false)
      const pausedCounts = counts()
      await quiet(pausedCounts, 'assembly while the previously submitted answer is still streaming')
      assert.equal(oldAnswer.request.cancelled, false)
      mock.finishStream(oldAnswer.index)
      await checked(oldAnswer.card.getByText('已完成', { exact: true })).toBeVisible()
      await checked(composer).toHaveValue(draft)
      await checked(assembling).toBeVisible()
      await quiet(pausedCounts, 'finishing the old stream must not drain an assembly-era queued question')
      await row(2).hover()
      await row(2).getByRole('button', { name: /^回答这句：/ }).click()
      const manual = await oneRequest(pausedCounts, selected, { held: true })
      await checked(composer).toHaveValue(draft)
      await checked(assembling).toBeVisible()
      await checked(paused).toBeVisible()
      await page.getByRole('button', { name: '停止生成', exact: true }).click()
      await checked.poll(() => manual.request.cancelled).toBe(true)
      await checked(composer).toHaveValue(draft)
      await checked(assembling).toBeVisible()
      await sentence(connection, 3, '你如何处理消息重试中的幂等问题？')
      await sentence(connection, 4, '你如何设计消息队列中的告警？')
      await quiet(counts(), 'cancelling a sentence answer does not exit assembly or restart automatic answers')
      await screenshot('question-assembly-held-answer.png')
      report.questionAssemblyHeldAndSentenceIsolationTested = true
    })

    await checkpoint('normal and compact assembly inputs cap at three lines and keyboard submission restores one line', async () => {
      await reset()
      const connection = await start()
      const before = counts()
      const draft = '请结合现有系统的访问规模回答。\n重点说明数据库与缓存的一致性。\n也请解释失败重试时的处理顺序。\n需要考虑可观测性和异常告警。\n最后说明如何验证变更后的效果。'
      const segment = '你如何完成这套缓存方案的设计？'
      await composer.fill(draft)
      await sentence(connection, 0, segment, false)
      const question = `${draft}\n${segment}`
      await joined(0, question)
      await inputSize('normal-assembly', true)
      await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).setSize(900, 640))
      await checked.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).getSize())).toEqual([900, 640])
      await inputSize('small-window-assembly', true)
      await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeInViewport()
      const smallReading = await page.getByRole('region', { name: '回答与面试信息', exact: true }).evaluate(element => element.clientHeight)
      assert.ok(smallReading >= 150, `small-window assembly must preserve at least 150px of answer space; received ${smallReading}px`)
      await screenshot('question-assembly-small.png')
      await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
      await checked(page.getByRole('button', { name: '恢复完整窗口', exact: true })).toBeVisible()
      assert.deepEqual(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).getSize()), [480, 640])
      await checked(composer).toHaveValue(question)
      await inputSize('compact-assembly', true)
      const readingHeight = await page.getByRole('region', { name: '回答与面试信息', exact: true }).evaluate(element => element.clientHeight)
      assert.ok(readingHeight >= 150, `compact assembly must preserve at least 150px of answer reading space; received ${readingHeight}px`)
      await checked(page.getByRole('button', { name: '生成回答', exact: true })).toBeInViewport()
      await screenshot('question-assembly-compact.png')
      assert.deepEqual(counts(), before)
      await composer.press('Meta+Enter')
      await checked(composer).toHaveValue('')
      await checked(assembling).toHaveCount(0)
      await inputSize('compact-submitted', false)
      await oneRequest(before, question)
      await screenshot('question-assembly-compact-submitted.png')
      report.questionAssemblyBoundedInputTested = true
    })
    assert.deepEqual(remote.unexpectedRequests, [])
  } catch (error) {
    if (!page.isClosed()) await screenshot('question-assembly-failure.png').catch(() => undefined)
    throw error
  } finally {
    try {
      await reset()
      await settingsPatch({ llm: saved.llm, asr: saved.asr, autoAnswer: saved.autoAnswer,
        retrieval: saved.retrieval, remoteKnowledge: saved.remoteKnowledge })
      // The synthetic remote credential stays only in the runner's disposable profile and is removed with it.
      await page.getByRole('button', { name: '麦克风', exact: true }).click()
      await app.evaluate(({ BaseWindow }, bounds) => BaseWindow.getAllWindows().find(window => window.isVisible()).setBounds(bounds), originalBounds)
    } finally { await remote.close() }
  }
}
