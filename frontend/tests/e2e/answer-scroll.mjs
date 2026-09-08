import assert from 'node:assert/strict'
import http from 'node:http'

/** A loopback SSE provider whose answer batches advance only after the UI assertion. */
async function startHeldAnswers() {
  const requests = []
  const sockets = new Set()
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    let body
    try {
      let raw = ''
      for await (const chunk of request) raw += chunk
      body = JSON.parse(raw)
    } catch {
      response.writeHead(400).end()
      return
    }
    if (!body.stream || body.model !== 'scroll-held') {
      response.writeHead(400).end('Expected the held streaming model')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.flushHeaders()
    const record = { body, text: '', completed: false, closed: false }
    record.send = async paragraphs => {
      assert.equal(record.closed, false, 'the real model request must remain connected between held batches')
      const delta = `${record.text ? '\n\n' : ''}${paragraphs.join('\n\n')}`
      record.text += delta
      await new Promise((resolve, reject) => response.write(`data: ${JSON.stringify({
        id: 'scroll-held-answer', object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
      })}\n\n`, error => error ? reject(error) : resolve()))
    }
    record.finish = () => {
      assert.equal(record.closed, false, 'the provider must still be connected when the test completes its answer')
      record.completed = true
      response.end('data: [DONE]\n\n')
    }
    // Keep a held request alive during screenshots without releasing any answer text.
    const heartbeat = setInterval(() => response.write(': held answer\n\n'), 10_000)
    heartbeat.unref()
    response.on('close', () => { record.closed = true; clearInterval(heartbeat) })
    requests.push(record)
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

function paragraphs(prefix, start, count) {
  return Array.from({ length: count }, (_, offset) => `${prefix}，在第 ${start + offset} 次检查中，我会把数据库里的实际状态和缓存命中情况放在一起看。如果两边出现差异，就继续确认写入顺序、过期时间和失败重试，确保调整以后既能保持数据准确，也不会给数据库带来突然增加的压力。`)
}

/** Uses real Electron IPC, HTTP/SSE and user wheel/click actions; never opens audio or a live provider. */
export async function checkAnswerScroll({ app, page, checked, checkpoint, settingsPatch, screenshot, report }) {
  const saved = await page.evaluate(() => window.copilot.getSettings())
  const originalBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  const originallyCompact = await page.getByRole('button', { name: '恢复完整窗口', exact: true }).count() > 0
  const provider = await startHeldAnswers()
  const viewport = page.getByRole('region', { name: '回答与面试信息', exact: true })
  const composer = page.getByLabel('当前问题', { exact: false })
  const latest = page.getByRole('button', { name: '查看最新回答', exact: true })
  const details = page.locator('details[aria-label="面试信息"]')
  const results = { providerMode: 'held loopback HTTP/SSE', layouts: [], positions: [] }
  report.answerScroll = results

  async function normalWindow() {
    const restore = page.getByRole('button', { name: '恢复完整窗口', exact: true })
    if (await restore.count()) await restore.click()
    await checked(page.getByRole('button', { name: '紧凑模式', exact: true })).toBeVisible()
  }
  async function resize(width, height) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height])
    await checked.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())).toEqual([width, height])
  }
  async function settledPosition() {
    // Read consecutive animation frames so a real wheel event has settled before taking its anchor.
    return viewport.evaluate(async element => {
      let previous = element.scrollTop
      let stable = 0
      for (let frame = 0; frame < 90; frame += 1) {
        await new Promise(requestAnimationFrame)
        const current = element.scrollTop
        stable = Math.abs(current - previous) < 0.1 ? stable + 1 : 0
        previous = current
        if (stable >= 4) return current
      }
      throw new Error('Answer viewport did not settle after the user scroll')
    })
  }
  async function wheel(delta) {
    const bounds = await viewport.boundingBox()
    assert.ok(bounds && bounds.height > 0, 'the answer scroll viewport must exist before a user scroll')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.7)
    await page.mouse.wheel(0, delta)
    return settledPosition()
  }
  async function unchanged(anchor, label) {
    const samples = await viewport.evaluate(async element => {
      const values = []
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise(requestAnimationFrame)
        values.push(element.scrollTop)
      }
      return values
    })
    const maximumMovement = Math.max(...samples.map(value => Math.abs(value - anchor)))
    results.positions.push({ label, before: anchor, after: samples.at(-1), maximumMovement })
    assert.ok(maximumMovement <= 1, `${label}: reading position moved by ${maximumMovement}px from ${anchor}px`)
  }
  async function readableOpening(card, opening, label) {
    const paragraph = card.getByText(opening, { exact: true })
    await checked(paragraph).toHaveCount(1)
    const text = await paragraph.boundingBox()
    const area = await viewport.boundingBox()
    const lineHeight = await paragraph.evaluate(element => Number.parseFloat(getComputedStyle(element).lineHeight))
    assert.ok(text && area && text.y >= area.y - 1 && text.y + Math.min(text.height, lineHeight) <= area.y + area.height + 1,
      `${label}: the answer's opening line must be fully readable inside the answer viewport; paragraph=${JSON.stringify(text)}, viewport=${JSON.stringify(area)}`)
    await checked(paragraph).toBeInViewport()
  }
  async function layout(label, compact = false) {
    const metrics = await viewport.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight,
      scrollHeight: element.scrollHeight, overflowAnchor: getComputedStyle(element).overflowAnchor }))
    const inputBounds = await composer.boundingBox()
    const windowSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())
    const measured = { label, windowSize, ...metrics, composerHeight: inputBounds?.height }
    if (!compact) {
      const answer = await page.getByRole('region', { name: '回答辅助', exact: true }).boundingBox()
      const transcript = await page.getByRole('region', { name: '实时转写', exact: true }).boundingBox()
      assert.ok(answer && transcript)
      measured.answerToTranscriptWidthRatio = answer.width / transcript.width
      const minimumRatio = windowSize[0] > 1060 ? 1.4 : 1.25
      assert.ok(measured.answerToTranscriptWidthRatio >= minimumRatio,
        `${label}: answers must get visibly more width than transcription; ratio=${measured.answerToTranscriptWidthRatio}`)
    }
    results.layouts.push(measured)
    assert.ok(metrics.height >= 150, `${label}: answer viewport must retain at least 150px; received ${metrics.height}px`)
    assert.ok(inputBounds && inputBounds.height <= 50, `${label}: the default question field must remain a compact single row`)
    assert.equal(metrics.overflowAnchor, 'none')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
    await checked(composer).toBeInViewport()
    await checked(page.getByRole('button', { name: /^(?:生成回答|停止生成)$/ })).toBeInViewport()
  }
  async function start(question, shortcut = false) {
    const count = provider.requests.length
    await composer.fill(question)
    if (shortcut) await composer.press('Meta+Enter')
    else await page.getByRole('button', { name: '生成回答', exact: true }).click()
    // The provider has not sent any text yet: clearing must happen on accepted submission.
    await checked(composer).toHaveValue('')
    await checked.poll(() => provider.requests.length).toBe(count + 1)
    const request = provider.requests[count]
    assert.equal(JSON.parse(request.body.messages.find(message => message.role === 'user').content).question, question)
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: question, exact: true }) })
    await checked(card.getByText('正在生成', { exact: true })).toHaveCount(1)
    return { request, card, question }
  }
  async function send(answer, batch) {
    await answer.request.send(batch)
    await checked(answer.card.getByText(batch.at(-1), { exact: true })).toHaveCount(1)
  }
  async function finish(answer) {
    answer.request.finish()
    await checked(answer.card.getByText('已完成', { exact: true })).toHaveCount(1)
    await checked.poll(() => page.evaluate(async question => (await window.copilot.getHistory()).flatMap(record => record.answers)
      .findLast(value => value.question === question)?.status, answer.question)).toBe('complete')
    const stored = await page.evaluate(async question => (await window.copilot.getHistory()).flatMap(record => record.answers)
      .findLast(value => value.question === question), answer.question)
    assert.equal(stored.text, answer.request.text, 'the displayed real stream must be the text persisted by the app')
  }
  async function bringOpeningByWheel(answer, opening) {
    await wheel(-100_000)
    const area = await viewport.boundingBox()
    const paragraph = await answer.card.getByText(opening, { exact: true }).boundingBox()
    assert.ok(area && paragraph)
    await wheel(Math.max(0, paragraph.y - area.y - 16))
    await readableOpening(answer.card, opening, 'explicitly scrolling to the older opening')
    return settledPosition()
  }
  async function expandedContext(answer, opening, mode) {
    await wheel(-100_000)
    await checked(details).toHaveCount(1)
    await details.locator('summary').click()
    await checked(details).toHaveAttribute('open', '')
    await checked(details.getByRole('region', { name: '面试环境与目标详情', exact: true })).toBeVisible()
    await latest.click()
    const area = await viewport.boundingBox()
    const paragraph = await answer.card.getByText(opening, { exact: true }).boundingBox()
    assert.ok(area && paragraph)
    await wheel(Math.max(0, paragraph.y - area.y - 16))
    await readableOpening(answer.card, opening, `${mode} with interview information expanded`)
    await checked(details).toHaveAttribute('open', '')
    await composer.fill('展开面试信息后仍可输入下一题。')
    await checked(composer).toHaveValue('展开面试信息后仍可输入下一题。')
    await layout(`${mode}-expanded-context`, mode === 'compact')
    await screenshot(`answer-scroll-${mode}-expanded.png`)
    await composer.clear()
    await wheel(-100_000)
    await details.locator('summary').click()
  }

  try {
    await normalWindow()
    await settingsPatch({ llm: { baseUrl: provider.baseUrl, model: 'scroll-held' },
      retrieval: { ...saved.retrieval, enabled: false }, remoteKnowledge: { ...saved.remoteKnowledge, enabled: false } })
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot))
    for (const mode of ['normal', 'compact']) {
      await normalWindow()
      await page.getByRole('button', { name: '工作台', exact: true }).click()
      await page.getByRole('button', { name: '新会话', exact: true }).click()
      await checked(page.getByRole('article')).toHaveCount(0)
      if (mode === 'compact') {
        await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
        await checked(page.getByRole('button', { name: '恢复完整窗口', exact: true })).toBeVisible()
        // Exercise the actual default compact size; a wider test window could hide a layout regression.
        const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())
        assert.deepEqual(size, [480, 640])
      } else await resize(1100, 760)
      const label = mode === 'normal' ? '普通窗口' : '紧凑窗口'
      const opening = mode === 'normal' ? '我会先更新数据库，再让缓存失效。' : '我会先确认问题，再选择缓存方案。'
      let first
      let second
      const secondOpening = `${label}的下一题，我会结合实际请求分析。`
      await checkpoint(`${mode} first answer starts readable and streaming completion preserves the user's upward scroll`, async () => {
        await wheel(-100_000)
        const beginning = await settledPosition()
        first = await start(`${label}：缓存怎么更新？`, mode === 'compact')
        await unchanged(beginning, `${mode}: starting first answer`)
        await send(first, [opening, ...paragraphs(label, 1, 5)])
        await unchanged(beginning, `${mode}: first held batch`)
        await readableOpening(first.card, opening, `${mode} initial answer`)
        await layout(mode, mode === 'compact')
        await screenshot(`answer-scroll-${mode}-opening.png`)
        const down = await wheel(380)
        const anchor = await wheel(-150)
        assert.ok(down > 0 && anchor < down && anchor > 0, 'a real upward user scroll must select a nonzero reading position')
        const nextDraft = `${label}的下一题草稿：请继续说明失败重试的边界。`
        await composer.fill(nextDraft)
        await send(first, paragraphs(label, 6, 6))
        await checked(composer).toHaveValue(nextDraft)
        await unchanged(anchor, `${mode}: continued stream after user scrolled up`)
        await send(first, paragraphs(label, 12, 6))
        await checked(composer).toHaveValue(nextDraft)
        await unchanged(anchor, `${mode}: another held batch`)
        await finish(first)
        await checked(composer).toHaveValue(nextDraft)
        await unchanged(anchor, `${mode}: completed stream after user scrolled up`)
        await screenshot(`answer-scroll-${mode}-reading.png`)
      })
      await checkpoint(`${mode} new answers preserve the older reading position until the user chooses the latest answer`, async () => {
        const anchor = await bringOpeningByWheel(first, opening)
        assert.ok(anchor > 0, 'the older-answer reader must have a nonzero scroll position')
        second = await start(`${label}：缓存失败怎么恢复？`)
        await unchanged(anchor, `${mode}: new answer while reading older answer`)
        await send(second, [secondOpening, ...paragraphs(`${label}的新回答`, 21, 5)])
        await unchanged(anchor, `${mode}: new answer text while reading older answer`)
        await readableOpening(first.card, opening, `${mode} older answer while a new answer streams`)
        await checked(second.card.getByRole('heading', { name: second.question, exact: true })).not.toBeInViewport()
        await latest.click()
        const chosen = await settledPosition()
        assert.ok(chosen > anchor, 'the explicit latest-answer button must move to the new answer')
        const area = await viewport.boundingBox()
        const cardBounds = await second.card.boundingBox()
        assert.ok(area && cardBounds && Math.abs(cardBounds.y - area.y) <= 1,
          'the explicit latest-answer action must align the beginning of the answer, not the end')
        await readableOpening(second.card, secondOpening, `${mode} manually selected newest answer`)
        await send(second, paragraphs(`${label}的新回答`, 26, 6))
        await unchanged(chosen, `${mode}: further stream after explicit latest-answer selection`)
        await finish(second)
        await unchanged(chosen, `${mode}: completion after explicit latest-answer selection`)
        await screenshot(`answer-scroll-${mode}-latest.png`)
      })
      await checkpoint(`${mode} expanded interview information still allows reading answers and composing the next question`, async () => {
        await expandedContext(second, secondOpening, mode)
      })
      if (mode === 'normal') await checkpoint('900x640 normal window keeps a wider answer column and usable reading area', async () => {
        await resize(900, 640)
        await expandedContext(second, secondOpening, 'normal-small')
      })
    }
    assert.equal(provider.requests.length, 4)
    assert.ok(provider.requests.every(request => request.completed))
    report.controlledAnswerScrollTested = true
    report.answerReadingSpaceTested = true
    report.explicitLatestAnswerNavigationTested = true
    report.manualComposerClearsBeforeResponseTested = true
    report.newDraftSurvivesStreamingCompletionTested = true
    report.composerShortcutClearsBeforeResponseTested = true
  } catch (error) {
    if (!page.isClosed()) await screenshot('answer-scroll-failure.png').catch(() => undefined)
    throw error
  } finally {
    try {
      const cancel = page.getByRole('button', { name: '停止生成', exact: true })
      if (!page.isClosed() && await cancel.count()) await cancel.click()
      await normalWindow()
      await settingsPatch({ llm: saved.llm, retrieval: saved.retrieval, remoteKnowledge: saved.remoteKnowledge })
      await page.getByRole('button', { name: '新会话', exact: true }).click()
      if (originallyCompact) await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
      await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), originalBounds)
    } finally { await provider.close() }
  }
}
