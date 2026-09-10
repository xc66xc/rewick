import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

export async function checkServiceSelectors({ page, mock, knowledge, check }) {
  await check('all three selectors support separate custom drafts, real connection tests and explicit platform selection', async () => {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '启用平台服务' })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: /^资料检索向量模型/ })).toHaveCount(0)
    const cases = [
      { label: '回答模型', kind: 'llm', url: mock.llmBaseUrl, model: 'mock-fast', platformId: 'mock-fast' },
      { label: '实时语音转写', kind: 'asr', url: `${mock.asrUrl}?mode=manual`, model: 'fun-asr-realtime', platformId: 'initial-asr' },
      { label: '远程知识库', kind: 'knowledge', url: knowledge.url, agentId: 'aid-custom', platformId: 'initial-knowledge' },
    ]
    for (const [index, item] of cases.entries()) {
      const select = page.getByRole('combobox', { name: new RegExp(`^${item.label}`) })
      await select.selectOption('new')
      const modal = page.getByRole('dialog', { name: `添加${item.label}`, exact: true })
      await modal.getByLabel('配置名称', { exact: true }).fill(`自定义${item.label}`)
      await modal.getByLabel(item.kind === 'asr' ? 'WebSocket 地址' : 'API 地址', { exact: true }).fill(item.url)
      if (item.model) await modal.getByLabel('模型名称', { exact: true }).fill(item.model)
      if (item.agentId) await modal.getByLabel('Agent ID', { exact: true }).fill(item.agentId)
      await modal.getByLabel('API Key', { exact: true }).fill(`custom-${item.kind}-key`)
      const before = await page.evaluate(() => window.copilot.getSettings())
      await modal.getByRole('button', { name: '测试连接', exact: true }).click()
      await expect(modal.getByRole('status')).toContainText('测试未保存配置', { timeout: 30000 })
      assert.deepEqual(await page.evaluate(async () => (await window.copilot.getSettings()).customServices), before.customServices)
      await modal.getByRole('button', { name: '保存并选用', exact: true }).click()
      await expect(modal).not.toBeVisible()
      const saved = await page.evaluate(() => window.copilot.getSettings())
      assert.equal(saved.customServices.length, index + 1)
      assert.equal(saved.serviceSelections[item.kind].source, 'custom')
      assert.equal(JSON.stringify(saved).includes(`custom-${item.kind}-key`), false)
      if (item.platformId) await select.selectOption(`platform:${item.platformId}`)
    }
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '设置已保存' })).toBeVisible()
    await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  })
}
