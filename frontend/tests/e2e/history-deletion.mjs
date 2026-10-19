import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Deletes only records created inside the runner's isolated, synthetic profile. */
export async function checkHistoryDeletion(options) {
  let { app, page } = options
  const { mock, checked, checkpoint, screenshot, restart, report } = options
  const fixtures = ['列表取消与删除', '详情删除', '失败后重试', '生成期间其他记录', '录音期间其他记录', '保留的历史记录'].map((name, index) => {
    const createdAt = new Date(Date.now() - (index + 1) * 60_000).toISOString()
    return { id: randomUUID(), createdAt, title: `合成历史：${name}`, segments: [], answers: [{
      id: randomUUID(), createdAt, question: `合成提问：${name}？`, text: `这是仅用于删除回归的合成回答：${name}。`, status: 'complete',
    }] }
  })
  const deleted = []
  let savedSettings
  let current

  async function records() { return page.evaluate(() => window.copilot.getHistory()) }
  async function workspace() { await page.getByRole('button', { name: '工作台', exact: true }).click() }
  async function history() { await page.getByRole('button', { name: '会话记录', exact: true }).click() }
  function listDelete(record) { return page.getByRole('button', { name: `删除会话：${record.title}`, exact: true }) }
  function dialog() { return page.getByRole('dialog', { name: '删除会话记录', exact: true }) }
  async function absent(record) {
    await checked.poll(async () => (await records()).some(value => value.id === record.id)).toBe(false)
    await checked(listDelete(record)).toHaveCount(0)
  }
  async function open(record) {
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: record.title, exact: true }) }).click()
    await checked(page.getByRole('button', { name: '返回记录', exact: true })).toBeVisible()
  }
  async function remove(record, { detail = false, currentSession = false } = {}) {
    await (detail ? page.getByRole('button', { name: '删除会话', exact: true }) : listDelete(record)).click()
    await checked(dialog()).toBeVisible()
    await checked(dialog()).toContainText(record.title)
    if (currentSession) await checked(dialog()).toContainText('清空工作台并开始新会话')
    await dialog().getByRole('button', { name: '确认删除', exact: true }).click()
    await checked(dialog()).toHaveCount(0)
    await absent(record)
    deleted.push(record)
  }
  async function configureModel(model) {
    await page.evaluate(async model => {
      const settings = await window.copilot.getSettings()
      await window.copilot.saveSettings({ ...settings, llm: { ...settings.llm, model } })
    }, model)
  }
  async function generate(question, { held = false } = {}) {
    await workspace()
    await configureModel(held ? 'mock-held' : 'mock-ui')
    const index = mock.requests.length
    await page.getByLabel('当前问题', { exact: false }).fill(question)
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await checked.poll(() => mock.requests.length).toBe(index + 1)
    assert.equal(JSON.parse(mock.requests[index].body.messages.find(value => value.role === 'user').content).question, question)
    if (held) {
      await checked.poll(() => mock.isStreamHeld(index)).toBe(true)
      return mock.requests[index]
    }
    await checked(page.getByRole('article').last().getByText('已完成', { exact: true })).toBeVisible()
    await checked.poll(async () => (await records()).some(record => record.answers.some(answer => answer.question === question && answer.status === 'complete'))).toBe(true)
    return (await records()).find(record => record.answers.some(answer => answer.question === question))
  }
  async function emptyWorkspace() {
    await workspace()
    await checked(page.getByRole('article')).toHaveCount(0)
    await checked(page.getByRole('textbox', { name: /^转写文字 / })).toHaveCount(0)
    await checked(page.getByLabel('当前问题', { exact: false })).toHaveValue('')
    const settings = await page.evaluate(() => window.copilot.getSettings())
    for (const key of ['interviewEnvironment', 'context', 'interviewTarget']) assert.deepEqual(settings[key], savedSettings[key], `${key} must survive deleting the current session`)
  }
  async function replayDeletedSnapshots() {
    // Reproduce a stale autosave arriving after deletion through the actual public IPC.
    await page.evaluate(async snapshots => {
      for (const record of snapshots) await window.copilot.saveSession(record)
    }, deleted)
    const ids = new Set((await records()).map(record => record.id))
    for (const record of deleted) assert.equal(ids.has(record.id), false, `late autosave must not recreate ${record.title}`)
  }

  await checkpoint('history deletion fixtures and selected interview environment stay inside the isolated profile', async () => {
    savedSettings = await page.evaluate(async ({ url, asrUrl }) => {
      const bridge = window.copilot
      let library = await bridge.saveResume({ name: '合成删除测试简历', text: '合成候选人参与过缓存系统开发。' })
      const resume = library.resumes.find(value => value.name === '合成删除测试简历')
      library = await bridge.saveTarget({ name: '合成删除测试岗位', companyName: '合成删除测试公司', roleName: '合成工程师', jobDescription: '关注缓存一致性，仅作测试。' })
      const target = library.targets.find(value => value.name === '合成删除测试岗位')
      library = await bridge.saveEnvironment({ name: '历史删除隔离环境', resumeId: resume.id, targetId: target.id, referenceIds: [] })
      const environment = library.environments.find(value => value.name === '历史删除隔离环境')
      const settings = await bridge.activateEnvironment(environment.id)
      return bridge.saveSettings({ ...settings,
        llm: { ...settings.llm, baseUrl: url, model: 'mock-ui', apiKey: 'sk-history-delete-synthetic-llm-only' },
        asr: { ...settings.asr, url: asrUrl, apiKey: 'sk-history-delete-synthetic-asr-only' },
        autoAnswer: { enabled: false, pauseMs: 1500 }, retrieval: { enabled: false },
      })
    }, { url: mock.llmBaseUrl, asrUrl: `${mock.asrUrl}?mode=manual` })
    for (const record of fixtures) {
      record.interviewEnvironment = savedSettings.interviewEnvironment
      record.answers[0].interviewEnvironment = savedSettings.interviewEnvironment
      record.answers[0].interviewTarget = savedSettings.interviewTarget
    }
    await page.evaluate(async fixtures => { for (const record of fixtures) await window.copilot.saveSession(record) }, fixtures)
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot?.removeSession))
    await history()
    await checked(listDelete(fixtures[0])).toBeEnabled()
    assert.equal((await records()).length, fixtures.length)
  })

  await checkpoint('cancel and Escape close deletion confirmation without changing any record', async () => {
    const before = await records()
    await listDelete(fixtures[0]).click()
    await checked(dialog()).toContainText(fixtures[0].title)
    await checked(dialog().getByRole('button', { name: '取消', exact: true })).toBeFocused()
    await dialog().getByRole('button', { name: '取消', exact: true }).click()
    await checked(dialog()).toHaveCount(0)
    await checked(listDelete(fixtures[0])).toBeFocused()
    assert.deepEqual(await records(), before)
    await listDelete(fixtures[0]).click()
    await page.keyboard.press('Escape')
    await checked(dialog()).toHaveCount(0)
    await checked(listDelete(fixtures[0])).toBeFocused()
    assert.deepEqual(await records(), before)
  })

  await checkpoint('list deletion removes one record and detail deletion returns to the history list', async () => {
    await remove(fixtures[0])
    assert.deepEqual(new Set((await records()).map(record => record.id)), new Set(fixtures.slice(1).map(record => record.id)))
    await open(fixtures[1])
    await checked(page.getByRole('article').getByText(fixtures[1].answers[0].text, { exact: true })).toBeVisible()
    await remove(fixtures[1], { detail: true })
    await checked(page.getByRole('button', { name: '返回记录', exact: true })).toHaveCount(0)
    await checked(page.getByRole('heading', { name: '会话记录', exact: true })).toBeFocused()
    await screenshot('history-deletion-list.png')
  })

  await checkpoint('a failed deletion preserves its record and confirmation so the user can retry', async () => {
    await app.evaluate(({ ipcMain }) => {
      const original = ipcMain._invokeHandlers.get('history:remove')
      if (!original) throw new Error('Missing history removal handler')
      let first = true
      ipcMain.removeHandler('history:remove')
      ipcMain.handle('history:remove', (...args) => {
        if (first) { first = false; throw new Error('合成磁盘写入失败，请重试。') }
        return original(...args)
      })
      globalThis.__restoreHistoryDeleteHandler = () => {
        ipcMain.removeHandler('history:remove'); ipcMain.handle('history:remove', original)
        delete globalThis.__restoreHistoryDeleteHandler
      }
    })
    try {
      await listDelete(fixtures[2]).click()
      await dialog().getByRole('button', { name: '确认删除', exact: true }).click()
      await checked(dialog().getByRole('alert')).toContainText('合成磁盘写入失败')
      assert.ok((await records()).some(record => record.id === fixtures[2].id))
      await checked(dialog().getByRole('button', { name: '确认删除', exact: true })).toBeEnabled()
      await screenshot('history-deletion-retry.png')
      await dialog().getByRole('button', { name: '确认删除', exact: true }).click()
      await checked(dialog()).toHaveCount(0)
      await absent(fixtures[2])
      deleted.push(fixtures[2])
    } finally { await app.evaluate(() => globalThis.__restoreHistoryDeleteHandler?.()) }
  })

  await checkpoint('deleting the idle current session clears its draft and starts a new ID while keeping interview selections', async () => {
    const idle = await generate('删除测试：请介绍你如何设计缓存系统？')
    await page.getByLabel('当前问题', { exact: false }).fill('这份未保存的问题草稿也应清空。')
    await history()
    await remove(idle, { currentSession: true })
    await emptyWorkspace()
    await replayDeletedSnapshots()
    current = await generate('新会话测试：你如何检查缓存命中率？')
    assert.notEqual(current.id, idle.id)
    assert.deepEqual(current.interviewEnvironment, savedSettings.interviewEnvironment)
    assert.equal(current.answers.some(answer => answer.question === idle.answers[0].question), false)
    report.currentIdleDeletionResetsSessionTested = true
  })

  await checkpoint('generating protects the current record while allowing deletion of another history item', async () => {
    const stream = await generate('忙碌生成测试：缓存失效时如何恢复？', { held: true })
    await history()
    await checked(listDelete(current)).toBeDisabled()
    await open(current)
    await checked(page.getByRole('button', { name: '删除会话', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '返回记录', exact: true }).click()
    await remove(fixtures[3])
    assert.equal(stream.cancelled, false)
    assert.equal(stream.completed, false)
    assert.ok((await records()).some(record => record.id === current.id))
    await screenshot('history-deletion-generating.png')
    await workspace()
    await checked(page.getByRole('article').last().getByText('正在生成', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '停止生成', exact: true }).click()
    await checked.poll(() => stream.cancelled).toBe(true)
    report.generatingHistoryProtectionTested = true
  })

  await checkpoint('recording protects the current history item and deleting another item leaves transcription running', async () => {
    await page.getByRole('button', { name: '麦克风', exact: true }).click()
    const index = mock.asrConnections.length
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await checked.poll(() => mock.asrConnections.length).toBe(index + 1)
    await checked.poll(() => mock.asrConnections[index].hasNonzeroPcm).toBe(true)
    mock.sendSentence(index, { sentenceId: 0, text: '这是删除回归中的合成转写内容。', isFinal: true })
    await checked(page.getByRole('textbox', { name: '转写文字 1', exact: true })).toHaveValue('这是删除回归中的合成转写内容。')
    await history()
    await checked(listDelete(current)).toBeDisabled()
    await remove(fixtures[4])
    assert.equal(mock.asrConnections[index].finished, false)
    assert.equal(mock.asrConnections[index].closed, false)
    await workspace()
    await checked(page.getByText('正在转写', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await checked(page.getByRole('button', { name: '开始转写', exact: true })).toBeEnabled()
    current = (await records()).find(record => record.id === current.id)
    assert.equal(current.segments.length, 1)
    report.recordingHistoryProtectionTested = true
    report.syntheticMicrophoneCaptureTested = true
  })

  await checkpoint('deleting the now-idle recorded session clears transcript and answers and rejects stale autosaves', async () => {
    await page.getByLabel('当前问题', { exact: false }).fill('删除含转写会话后的旧草稿。')
    await history()
    await open(current)
    await remove(current, { detail: true, currentSession: true })
    await emptyWorkspace()
    await replayDeletedSnapshots()
    assert.deepEqual((await records()).map(record => record.id), [fixtures[5].id])
    report.lateAutosaveCannotResurrectTested = true
    await screenshot('history-deletion-empty-workspace.png')
  })

  await checkpoint('refresh and a full app restart do not resurrect deleted history or overwrite interview settings', async () => {
    await page.reload()
    await page.waitForFunction(() => Boolean(window.copilot?.removeSession))
    await emptyWorkspace()
    assert.deepEqual((await records()).map(record => record.id), [fixtures[5].id])
    ;({ app, page } = await restart())
    await emptyWorkspace()
    await history()
    await checked(listDelete(fixtures[5])).toBeEnabled()
    assert.deepEqual((await records()).map(record => record.id), [fixtures[5].id])
    for (const record of deleted) await checked(listDelete(record)).toHaveCount(0)
    await screenshot('history-deletion-restarted.png')
    report.historyDeletionPersistenceTested = true
  })
}
