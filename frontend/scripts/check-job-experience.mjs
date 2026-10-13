import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { expect } from '@playwright/test'

export async function checkJobExperience({ page, application, output, baseUrl, token, supplierRequests, llmUrl }) {
  const checks = []
  const levels = [
    ['no_experience', '无经验'], ['one_to_three_years', '1–3年经验'],
    ['three_to_five_years', '3–5年经验'], ['five_plus_years', '5年经验以上'],
  ]
  const library = () => page.evaluate(() => window.copilot.getInterviewLibrary())
  const current = async () => { const value = await library(); return value.environments.find(row => row.id === value.activeEnvironmentId) }
  const legacyContent = row => ({ name: row.name, interviewType: row.interviewType, resumeId: row.resumeId, targetId: row.targetId, referenceIds: row.referenceIds, hotwords: row.hotwords ?? [] })
  async function api(id, body) {
    const response = await fetch(`${baseUrl}/api/v1/background/environments/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
    return { status: response.status, value: await response.json() }
  }
  async function saveApi(row, content) {
    return api(row.id, { version: row.version, mutationId: randomUUID(), content })
  }
  async function reload() {
    await page.reload()
    await page.evaluate(() => window.copilot.getSettings())
  }
  async function editor() {
    const row = await current()
    await page.getByRole('button', { name: `编辑环境 ${row.name}`, exact: true }).click()
    return page.getByRole('dialog', { name: '编辑面试准备', exact: true })
  }
  async function setLevel(label) {
    const dialog = await editor()
    await dialog.getByRole('radio', { name: new RegExp(`^${label}`) }).click()
    await dialog.getByRole('button', { name: '保存环境', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1220, 1000))
  assert.equal((await current()).jobExperienceLevel ?? null, null)
  for (const [value, label] of levels) {
    await setLevel(label)
    assert.equal((await current()).jobExperienceLevel, value)
  }
  checks.push('four job requirement levels persist through real UI/IPC/Java')
  const cleared = await editor()
  await cleared.getByRole('button', { name: '不设置', exact: true }).click()
  await cleared.getByRole('button', { name: '保存环境', exact: true }).click()
  await expect(cleared).toHaveCount(0)
  assert.equal((await current()).jobExperienceLevel, null)
  await setLevel('3–5年经验')
  let row = await current()
  assert.equal((await saveApi(row, legacyContent(row))).status, 200)
  assert.equal((await current()).jobExperienceLevel, 'three_to_five_years')
  row = await current()
  assert.equal((await saveApi(row, { ...legacyContent(row), jobExperienceLevel: 'invalid' })).status, 400)
  await reload()
  const draft = await editor()
  await draft.getByRole('radio', { name: /^1–3年经验/ }).click()
  row = await current()
  assert.equal((await saveApi(row, { ...legacyContent(row), jobExperienceLevel: 'five_plus_years' })).status, 200)
  await draft.getByRole('button', { name: '保存环境', exact: true }).click()
  await expect(draft.getByRole('radio', { name: /^1–3年经验/ })).toBeChecked()
  await expect(draft.getByRole('alert')).toContainText('草稿未保存')
  await draft.getByRole('button', { name: '取消', exact: true }).click()
  await reload()
  await setLevel('3–5年经验')
  checks.push('clear, old-client preservation, invalid input and version conflict protect drafts')
  const dialog = await editor()
  await page.screenshot({ path: join(output, 'job-experience-dialog.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  row = await current()
  await page.evaluate(async row => { await window.copilot.saveEnvironmentStamp({ id: row.id, version: row.version, stamp: { text: '正在等待第二轮中', color: 'amber' } }) }, row)
  await reload()
  await page.screenshot({ path: join(output, 'job-experience-cards.png') })
  await application.evaluate(({ BaseWindow }) => { const window = BaseWindow.getAllWindows()[0]; window.setMinimumSize(380, 560); window.setSize(448, 1000) })
  const article = page.getByRole('article', { name: `面试环境 ${row.name}`, exact: true })
  const initialBox = await article.boundingBox()
  assert.ok(initialBox)
  await application.evaluate(({ BaseWindow }, difference) => { const window = BaseWindow.getAllWindows()[0], bounds = window.getBounds(); window.setSize(Math.round(bounds.width + difference), bounds.height) }, 320 - initialBox.width)
  await expect.poll(async () => Math.round((await article.boundingBox()).width)).toBe(320)
  const box = await article.boundingBox(), stamp = await article.getByRole('button', { name: /编辑印章/ }).boundingBox(), resources = await article.locator('dl').boundingBox()
  assert.ok(box && stamp && resources)
  assert.ok(stamp.x >= box.x && stamp.x + stamp.width <= box.x + box.width)
  assert.ok(stamp.y + stamp.height <= resources.y)
  const labels = await article.locator('.environment-card__tags').locator('span').evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { right: box.right, top: box.top, bottom: box.bottom } }))
  for (const label of labels) assert.ok(label.right <= stamp.x || label.bottom <= stamp.y || label.top >= stamp.y + stamp.height, 'Status label overlaps stamp')
  await article.screenshot({ path: join(output, 'job-experience-card-320.png') })
  checks.push('320px card fits interview type, job level and eight-character stamp')
  await application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].setSize(1220, 1000))
  await page.evaluate(async row => { await window.copilot.saveEnvironment({ name: '其他岗位验证', interviewType: 'general', resumeId: row.resumeId, targetId: null, referenceIds: [], jobExperienceLevel: 'one_to_three_years' }) }, row)
  await reload()
  await article.getByRole('button', { name: '开始面试', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '当前问题' })).toBeVisible()
  const frozen = await page.evaluate(() => window.copilot.getSettings())
  assert.equal(frozen.interviewEnvironment.jobExperienceLevel, 'three_to_five_years')
  row = await current()
  assert.equal((await saveApi(row, { ...legacyContent(row), jobExperienceLevel: 'five_plus_years' })).status, 409)
  assert.equal((await current()).jobExperienceLevel, 'three_to_five_years')
  checks.push('active interview locks the frozen job requirement on the server')
  const walletBefore = await page.evaluate(() => window.copilot.getWallet())
  await page.getByRole('button', { name: '准备面试', exact: true }).click()
  await page.getByRole('button', { name: '编辑环境 其他岗位验证', exact: true }).click()
  const otherDialog = page.getByRole('dialog', { name: '编辑面试准备', exact: true })
  await otherDialog.getByRole('radio', { name: /^5年经验以上/ }).click()
  await otherDialog.getByRole('button', { name: '保存环境', exact: true }).click()
  await expect(otherDialog).toHaveCount(0)
  const walletAfter = await page.evaluate(() => window.copilot.getWallet())
  assert.equal(walletAfter.session.id, walletBefore.session.id)
  assert.equal(walletAfter.session.status, 'active')
  assert.equal((await page.evaluate(() => window.copilot.getSettings())).interviewEnvironment.jobExperienceLevel, 'three_to_five_years')
  assert.equal((await library()).environments.find(value => value.name === '其他岗位验证').jobExperienceLevel, 'five_plus_years')
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  checks.push('editing another environment through the UI preserves the active session and frozen background')
  const question = '合成验收：缓存如何设计？'
  async function answer() {
    await page.evaluate(() => { window.__experienceCleanup?.(); window.__experienceEvents = []; window.__experienceCleanup = window.copilot.onEvent(event => window.__experienceEvents.push(event)) })
    await page.getByRole('textbox', { name: '当前问题' }).fill(question)
    await page.getByRole('button', { name: /^生成回答/ }).click()
    await expect.poll(() => page.evaluate(() => {
      const request = window.__experienceEvents.find(event => event.kind === 'answer-request')
      return Boolean(request && window.__experienceEvents.some(event => event.kind === 'answer-done' && event.requestId === request.requestId && event.cancelled !== true))
    })).toBe(true)
    const events = await page.evaluate(() => window.__experienceEvents)
    const snapshot = events.find(event => event.kind === 'answer-request').modelInput
    assert.equal(events.some(event => event.kind === 'answer-error'), false)
    assert.deepEqual(snapshot.messages, supplierRequests.at(-1).messages)
    const user = JSON.parse(snapshot.messages.find(message => message.role === 'user').content)
    assert.equal(user.jobExperienceLevel, 'three_to_five_years')
    return snapshot
  }
  const platform = await answer()
  await page.screenshot({ path: join(output, 'job-experience-workbench.png') })
  await page.getByRole('button', { name: '结束面试', exact: true }).click()
  let recorded
  await expect.poll(async () => {
    const records = await page.evaluate(() => window.copilot.getHistory())
    for (const record of records) {
      const detail = await page.evaluate(id => window.copilot.getHistoryDetail(id), record.id)
      if (detail.interviewSessionId === walletBefore.session.id && detail.answers?.some(answer => answer.question === question)) { recorded = detail; return true }
    }
    return false
  }).toBe(true)
  const storedAnswer = recorded.answers.find(answer => answer.question === question)
  assert.equal(recorded.interviewEnvironment.jobExperienceLevel, 'three_to_five_years')
  assert.equal(storedAnswer.status, 'complete')
  assert.ok(storedAnswer.text.trim())
  assert.equal(storedAnswer.interviewEnvironment.jobExperienceLevel, 'three_to_five_years')
  assert.deepEqual(storedAnswer.modelInput.messages, platform.messages)
  checks.push('saved session and answer snapshots preserve the actual request job level')
  await page.getByRole('button', { name: '准备面试', exact: true }).click()
  await page.evaluate(async llmUrl => { await window.copilot.saveCustomService({ name: '本地合成模型', kind: 'llm', url: llmUrl, model: 'mock-fast', apiKey: 'synthetic-custom-key' }) }, llmUrl)
  await reload()
  await page.getByRole('article', { name: `面试环境 ${row.name}`, exact: true }).getByRole('button', { name: '开始面试', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '当前问题' })).toBeVisible()
  const custom = await answer()
  assert.deepEqual(custom.messages, platform.messages)
  assert.equal(supplierRequests.at(-1).headers['x-operation-id'], undefined)
  await page.getByRole('button', { name: '结束面试', exact: true }).click()
  await page.evaluate(() => window.__experienceCleanup?.())
  checks.push('platform and custom models receive identical job-level messages and snapshots')
  return checks
}
