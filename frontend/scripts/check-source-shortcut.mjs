import assert from 'node:assert/strict'
import { join } from 'node:path'
import { expect } from '@playwright/test'

export async function checkSourceShortcut({ page, application, output, supplierRequests, mock }) {
  const checks = []
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '模型与设置', exact: true })
  await dialog.getByLabel('切换系统音频 / 麦克风', { exact: true }).click()
  await page.keyboard.press('Control+Alt+q')
  await expect.poll(() => page.evaluate(() => window.copilot.getSourceShortcut())).toMatchObject({ accelerator: 'CommandOrControl+Alt+Q' })
  assert.equal(await application.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+Q')), true)
  await page.screenshot({ path: join(output, 'source-shortcut-settings.png') })
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: '开始面试', exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: '当前问题' })).toBeVisible()
  checks.push('settings UI persists and registers the device-local shortcut through real IPC')
  async function toggle() {
    await application.evaluate(({ webContents }, url) => {
      const target = webContents.getAllWebContents().find(contents => contents.getURL() === url)
      assertTarget(target)
      function assertTarget(value) { if (!value) throw new Error('Desktop webContents missing'); value.send('copilot:event', { kind: 'shortcut', action: 'toggle-source' }) }
    }, page.url())
  }
  const microphone = page.getByRole('button', { name: '麦克风', exact: true })
  const system = page.getByRole('button', { name: '系统音频', exact: true })
  await toggle(); await expect(microphone).toHaveAttribute('aria-pressed', 'true')
  await toggle(); await expect(system).toHaveAttribute('aria-pressed', 'true')
  assert.equal(mock.asrConnections.length, 0)
  assert.equal(supplierRequests.length, 0)
  checks.push('idle shortcut changes the selected source in both directions without ASR or LLM calls')
  await expect(page.getByRole('textbox', { name: '当前问题' })).toBeVisible()
  await page.getByRole('button', { name: '开始转写', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^正在转写$/ })).toBeVisible()
  await expect.poll(() => mock.asrConnections.length).toBe(1)
  await toggle()
  await expect(microphone).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => mock.asrConnections.length).toBe(2)
  await expect(page.getByRole('button', { name: '停止转写', exact: true })).toBeEnabled()
  assert.equal(mock.asrConnections[0].finished, true)
  assert.equal(mock.asrConnections[0].closed, true)
  await expect.poll(() => mock.asrConnections[1].audioMessages).toBeGreaterThan(0)
  checks.push('live platform ASR closes the system task before continuing microphone PCM')
  await toggle()
  await expect(system).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => mock.asrConnections.length).toBe(3)
  await expect.poll(() => mock.asrConnections[2].audioMessages).toBeGreaterThan(0)
  assert.equal(supplierRequests.length, 0)
  checks.push('microphone to system restores ASR without submitting any question or calling the LLM')
  await page.getByRole('button', { name: '停止转写', exact: true }).click()
  await page.getByRole('button', { name: '结束面试', exact: true }).click()
  await page.evaluate(() => window.copilot.saveSourceShortcut({ accelerator: '' }))
  assert.equal(await application.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+Q')), false)
  checks.push('clearing the shortcut unregisters the OS binding')
  return checks
}
