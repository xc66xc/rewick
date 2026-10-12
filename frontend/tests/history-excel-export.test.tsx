// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryPage from '../src/renderer/src/components/HistoryPage'
import type { DesktopBridge, SessionRecord } from '../src/shared/types'

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

const record: SessionRecord = {
  id: 'excel-session', title: '测试面试', createdAt: '2026-10-12T12:00:00Z', segments: [],
  answers: [{ id: 'one', question: '测试问题', text: '测试回答', status: 'complete', createdAt: '2026-10-12T12:00:00Z' }],
}
async function setup(exportAnswersExcel = vi.fn(async () => true)) {
  const bridge = {
    getHistoryPage: vi.fn(async () => ({ records: [record], nextCursor: null })),
    getHistoryDetail: vi.fn(async () => record), exportAnswersExcel,
  } as unknown as DesktopBridge
  render(<HistoryPage bridge={bridge} records={[record]} activeSessionId="other" activeSessionLocked={false} onExport={vi.fn()} onDelete={vi.fn()} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '查看详情：测试面试' }))
  await screen.findByRole('button', { name: '返回记录' })
  return { user, exportAnswersExcel }
}

describe('development answer Excel export', () => {
  it('exports the selected server record and shows completion', async () => {
    vi.stubEnv('DEV', true)
    const { user, exportAnswersExcel } = await setup()
    await user.click(screen.getByRole('button', { name: '导出回答 Excel' }))
    expect(exportAnswersExcel).toHaveBeenCalledExactlyOnceWith(record.id)
    await screen.findByText('回答 Excel 已导出，reference 已留空，填写标准答案后可用于评估。')
  })

  it('does not show the action in production even when the bridge exposes it', async () => {
    vi.stubEnv('DEV', false)
    const { exportAnswersExcel } = await setup()
    expect(screen.queryByRole('button', { name: '导出回答 Excel' })).toBeNull()
    expect(exportAnswersExcel).not.toHaveBeenCalled()
  })

  it('shows export failure and allows retry', async () => {
    vi.stubEnv('DEV', true)
    const exporter = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error('单元格超过限制')).mockResolvedValueOnce(false)
    const { user } = await setup(exporter)
    await user.click(screen.getByRole('button', { name: '导出回答 Excel' }))
    await screen.findByText('单元格超过限制')
    await user.click(screen.getByRole('button', { name: '导出回答 Excel' }))
    expect(exporter).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Excel 已导出/)).toBeNull()
  })
})
