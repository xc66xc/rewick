import assert from 'node:assert/strict'

/** Exercises the real system-source UI using synthetic media and local provider doubles. */
export async function checkAutoAnswers({ app, page, mock, checked, checkpoint, settingsPatch, screenshot, report }) {
  const pauseMs = 1000
  const silenceWindow = pauseMs + 300
  const toggle = page.getByRole('switch', { name: '自动回答', exact: true })
  // 等待停顿在面板内为文本展示(修改入口在「模型与设置」),e2e 经设置桥直写
  const setPauseMs = async (ms) => {
    await settingsPatch({ autoAnswer: { enabled: true, pauseMs: ms } })
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).autoAnswer.pauseMs)).toBe(ms)
  }

  // Never invoke the operating system's display or system-audio capture API.
  await page.addInitScript(() => {
    window.__syntheticDisplayCalls = 0
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        window.__syntheticDisplayCalls += 1
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      },
    })
  })
  await settingsPatch({ asr: { url: `${mock.asrUrl}?mode=manual` }, llm: { model: 'mock-ui' } })
  await page.reload()
  await page.waitForFunction(() => Boolean(window.copilot))

  async function start(source = '系统音频', model = 'mock-ui') {
    await settingsPatch({ asr: { url: `${mock.asrUrl}?mode=manual` }, llm: { model } })
    await toggle.setChecked(true)
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).autoAnswer.enabled)).toBe(true)
    await page.getByRole('button', { name: source, exact: true }).click()
    const connections = mock.asrConnections.length
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(connections + 1)
    await checked.poll(() => mock.asrConnections.at(-1).hasNonzeroPcm).toBe(true)
    if (source === '系统音频') {
      assert.ok(await page.evaluate(() => window.__syntheticDisplayCalls > 0))
      report.simulatedSystemAudioCaptureTested = true
    }
    return mock.asrConnections.length - 1
  }

  async function sentence(connection, id, text, isFinal) {
    mock.sendSentence(connection, { sentenceId: id, text, isFinal })
    await checked(page.getByRole('textbox', { name: `转写文字 ${id + 1}`, exact: true })).toHaveValue(text)
  }

  // v30 speech-actions: 历史转写条的操作按钮默认收起，需先悬停所在条目展开再点击。
  async function answerSentence(text) {
    const button = page.getByRole('button', { name: `回答这句：${text}`, exact: true })
    await button.locator('xpath=ancestor::li[1]').hover()
    await button.click()
  }

  async function noNewAnswer(requests, milliseconds = silenceWindow) {
    const answers = await page.getByRole('article').count()
    // A deliberate observation window is required to assert that a debounce never fires.
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
    assert.equal(mock.requests.length, requests, 'no model request should start during this observation window')
    await checked(page.getByRole('article')).toHaveCount(answers)
  }

  function payload(request) {
    return JSON.parse(request.body.messages.find((message) => message.role === 'user').content)
  }

  async function completed(requests) {
    await checked.poll(() => mock.requests.length).toBe(requests)
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
  }

  async function stop() {
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
  }

  async function reset() {
    await page.getByRole('button', { name: '新会话', exact: true }).click()
    await checked(page.getByRole('article')).toHaveCount(0)
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveCount(0)
  }

  await checkpoint('automatic-answer preferences save through the UI and greetings do not trigger an answer', async () => {
    await checked(toggle).toBeChecked()
    await checked(page.getByText('等待停顿 1.5 秒', { exact: true })).toBeVisible()
    await setPauseMs(2500)
    await setPauseMs(pauseMs)
    const connection = await start()
    const baseline = mock.requests.length
    await sentence(connection, 0, '你好，今天网络很稳定。', true)
    await noNewAnswer(baseline)
    await checked(page.getByRole('status').filter({ hasText: '这段未识别为提问，可手动生成回答' })).toBeVisible()
    await stop()
    await reset()
  })

  await checkpoint('system audio waits for every final sentence, groups a question, and deduplicates repeated finals', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    const first = '请介绍你负责的订单系统。'
    const second = '你当时怎么保证接口幂等？'
    await sentence(connection, 0, first, true)
    await sentence(connection, 1, '你当时怎么保证接口', false)
    await noNewAnswer(baseline)
    await sentence(connection, 1, second, true)
    await noNewAnswer(baseline, 200)
    await completed(baseline + 1)
    assert.equal(payload(mock.requests.at(-1)).question, `${first}\n${second}`)
    await sentence(connection, 0, first, true)
    await sentence(connection, 1, second, true)
    await noNewAnswer(baseline + 1)
    await stop()
    await reset()
  })

  await checkpoint('spoken self-introduction request with repeated ASR words automatically answers after 1.5 seconds', async () => {
    await setPauseMs(1500)
    const connection = await start()
    const baseline = mock.requests.length
    const question = '先简单自介介绍一下自己。'
    const draft = '自动回答期间保留的下一题草稿：如何设计缓存？'
    await page.getByLabel('当前问题', { exact: false }).fill(draft)
    mock.sendFunAsrSentence(connection, { sentenceId: 0, text: question, endMs: null })
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveValue(question)
    await checked(page.getByRole('status').filter({ hasText: '等待语音转写定稿' })).toBeVisible()
    await noNewAnswer(baseline, 1800)
    mock.sendFunAsrSentence(connection, { sentenceId: 0, text: question, endMs: 1000 })
    await checked(page.getByRole('status').filter({ hasText: '问题已定稿，等待停顿' })).toBeVisible()
    await noNewAnswer(baseline, 200)
    await completed(baseline + 1)
    assert.equal(payload(mock.requests.at(-1)).question, question)
    assert.equal(payload(mock.requests.at(-1)).transcript, question)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue(draft)
    await checked(page.getByRole('article')).toHaveCount(1)
    await checked(page.getByRole('article').getByRole('heading', { name: question, exact: true })).toBeVisible()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    mock.sendFunAsrSentence(connection, { sentenceId: 0, text: question, endMs: 1000 })
    await noNewAnswer(baseline + 1, 1800)
    await screenshot('auto-introduction.png')
    await stop()
    await checked.poll(() => page.evaluate(async (text) => {
      const records = await window.copilot.getHistory()
      return records.some(record => record.answers.some(answer => answer.question === text && answer.status === 'complete'))
    }, question)).toBe(true)
    await reset()
    await setPauseMs(pauseMs)
  })

  await checkpoint('manual sentence answers take precedence over a pending automatic answer', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    const question = '你如何定位订单系统的慢查询？'
    await sentence(connection, 0, question, true)
    await answerSentence(question)
    await completed(baseline + 1)
    assert.equal(payload(mock.requests.at(-1)).question, question)
    await noNewAnswer(baseline + 1)
    await stop()
    await reset()
  })

  await checkpoint('clicking a waiting sentence dismisses its whole question batch across blur and ASR revisions', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    await sentence(connection, 0, '请介绍你负责的订单系统。', true)
    await sentence(connection, 1, '你如何设计订单系统的幂等接口？', true)
    await checked(page.getByRole('status').filter({ hasText: '问题已定稿，等待停顿' })).toBeVisible()
    const editor = page.getByRole('textbox', { name: '转写文字 1', exact: true })
    await editor.click()
    await noNewAnswer(baseline)
    await page.getByLabel('当前问题', { exact: false }).focus()
    await checked(page.getByRole('status').filter({ hasText: '已取消这次自动回答' })).toBeVisible()
    await sentence(connection, 0, '请介绍你负责的支付系统。', true)
    const revised = '你如何设计支付系统的幂等接口？'
    await sentence(connection, 1, revised, true)
    await noNewAnswer(baseline)
    await screenshot('auto-dismissed-question.png')
    await answerSentence(revised)
    await completed(baseline + 1)
    assert.equal(payload(mock.requests.at(-1)).question, revised)
    const next = '你如何排查系统中的慢查询？'
    await sentence(connection, 2, next, true)
    await completed(baseline + 2)
    assert.equal(payload(mock.requests.at(-1)).question, next)
    report.pendingBatchClickDismissalTested = true
    await stop()
    await reset()
  })

  await checkpoint('editing an unfinished sentence keeps it manual after native and same-field window blur', async () => {
    const connection = await start()
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus() })
    await checked.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(true)
    const baseline = mock.requests.length
    await sentence(connection, 0, '你如何设计容灾', false)
    const editor = page.getByRole('textbox', { name: '转写文字 1', exact: true })
    const edited = '你如何设计跨地域容灾？'
    await editor.fill(edited)
    mock.sendSentence(connection, { sentenceId: 0, text: '你如何设计容灾？', isFinal: true })
    await noNewAnswer(baseline)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur())
    await checked.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(false)
    await noNewAnswer(baseline)
    report.nativeWindowBlurDismissalTested = true
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus() })
    await sentence(connection, 1, '你如何保证数据库迁移', false)
    const sameEditor = page.getByRole('textbox', { name: '转写文字 2', exact: true })
    await sameEditor.fill('你如何保证数据库迁移的数据一致性？')
    mock.sendSentence(connection, { sentenceId: 1, text: '你如何保证数据库迁移？', isFinal: true })
    await noNewAnswer(baseline)
    // A dispatched window event keeps the active textarea, unlike macOS's native blur here.
    // It isolates the return-to-the-same-field path without a new element focus event.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    assert.equal(await sameEditor.evaluate((element) => document.activeElement === element), true)
    const continued = '你如何保证数据库迁移时可以安全回滚？'
    await sameEditor.evaluate((element) => element.setSelectionRange(0, element.value.length))
    await page.keyboard.insertText(continued)
    await checked(sameEditor).toHaveValue(continued)
    await noNewAnswer(baseline)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await noNewAnswer(baseline)
    await answerSentence(continued)
    await completed(baseline + 1)
    assert.equal(payload(mock.requests.at(-1)).question, continued)
    await checked(editor).toHaveValue(edited)
    report.syntheticWindowBlurEventDismissalTested = true
    await stop()
    await reset()
  })

  await checkpoint('clicking an already answered sentence preserves an unrelated pending question', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    await sentence(connection, 0, '请介绍你负责的系统。', true)
    await completed(baseline + 1)
    const next = '你如何保证消息队列中的数据一致性？'
    await sentence(connection, 1, next, true)
    await page.getByRole('textbox', { name: '转写文字 1', exact: true }).click()
    await noNewAnswer(baseline + 1)
    await page.getByLabel('当前问题', { exact: false }).focus()
    await completed(baseline + 2)
    assert.equal(payload(mock.requests.at(-1)).question, next)
    report.oldSentencePendingIsolationTested = true
    await stop()
    await reset()
  })

  await checkpoint('a later automatic question queues until the current stream completes without cancellation', async () => {
    const connection = await start('系统音频', 'mock-held')
    const baseline = mock.requests.length
    const first = '请介绍你如何设计订单系统？'
    const second = '你如何排查系统的慢查询？'
    await sentence(connection, 0, first, true)
    await checked.poll(() => mock.requests.length).toBe(baseline + 1)
    await checked.poll(() => mock.isStreamHeld(baseline)).toBe(true)
    await sentence(connection, 1, second, true)
    await noNewAnswer(baseline + 1)
    assert.equal(mock.requests[baseline].completed, false)
    assert.equal(mock.requests[baseline].cancelled, false)
    await settingsPatch({ llm: { model: 'mock-ui' } })
    mock.finishStream(baseline)
    await completed(baseline + 2)
    assert.equal(payload(mock.requests[baseline]).question, first)
    assert.equal(payload(mock.requests[baseline + 1]).question, second)
    assert.equal(mock.requests[baseline].completed, true)
    assert.equal(mock.requests[baseline].cancelled, false)
    await screenshot('auto-answer.png')
    await stop()
    await reset()
  })

  await checkpoint('clicking a queued sentence dismisses it without cancelling the current answer stream', async () => {
    const connection = await start('系统音频', 'mock-held')
    const baseline = mock.requests.length
    await sentence(connection, 0, '你如何设计一个订单系统？', true)
    await checked.poll(() => mock.isStreamHeld(baseline)).toBe(true)
    await sentence(connection, 1, '你如何排查系统中的异常请求？', true)
    await checked(page.getByRole('status').filter({ hasText: '等当前回答完成' })).toBeVisible()
    await page.getByRole('textbox', { name: '转写文字 2', exact: true }).click()
    await page.getByLabel('当前问题', { exact: false }).focus()
    assert.equal(mock.requests[baseline].cancelled, false)
    await settingsPatch({ llm: { model: 'mock-ui' } })
    mock.finishStream(baseline)
    await completed(baseline + 1)
    await sentence(connection, 1, '你如何排查系统中的异常请求和错误日志？', true)
    await noNewAnswer(baseline + 1)
    assert.equal(mock.requests[baseline].cancelled, false)
    const next = '你如何设计缓存失效策略？'
    await sentence(connection, 2, next, true)
    await completed(baseline + 2)
    assert.equal(payload(mock.requests.at(-1)).question, next)
    report.queuedSentenceDismissalTested = true
    await stop()
    await reset()
  })

  await checkpoint('turning automatic answers off cancels a pending question', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    await sentence(connection, 0, '你如何设计高可用系统？', true)
    await toggle.setChecked(false)
    await checked.poll(() => page.evaluate(async () => (await window.copilot.getSettings()).autoAnswer.enabled)).toBe(false)
    await noNewAnswer(baseline)
    await stop()
    await reset()
  })

  await checkpoint('stopping transcription prevents a pending automatic answer', async () => {
    const connection = await start()
    const baseline = mock.requests.length
    await sentence(connection, 0, '你如何设计数据库索引？', true)
    await stop()
    await noNewAnswer(baseline)
    await reset()
  })

  await checkpoint('microphone transcription stays manual even when automatic answers are enabled', async () => {
    const connection = await start('麦克风')
    const baseline = mock.requests.length
    await sentence(connection, 0, '你如何设计消息队列？', true)
    await noNewAnswer(baseline)
    await stop()
    await reset()
    await setPauseMs(1500)
  })
}
