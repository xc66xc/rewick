// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryDrafts from '../src/renderer/src/components/HistoryDrafts'
import type { DesktopBridge } from '../src/shared/types'
vi.mock('../src/renderer/src/lib/window-scrim', () => ({ pushWindowScrim: vi.fn() }))
vi.mock('../src/renderer/src/components/ui/toast', () => ({ toast: { show: vi.fn() } }))
afterEach(cleanup)
it('exports local content and only recovers when explicitly clicked, restoring actions after failure', async () => {
  const local = { id: 'local', title: 'synthetic draft', createdAt: '2026-10-01T00:00:00Z', segments: [], answers: [] }
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const recover = vi.fn(async () => { await gate; throw new Error('offline') })
  const exportSession = vi.fn(async () => true)
  const bridge = { getHistoryDrafts: vi.fn(async () => [{ id: 'local', title: local.title, createdAt: local.createdAt, reason: 'record_deleted' }]), getHistoryDraft: vi.fn(async () => local), recoverHistoryDraft: recover, exportSession } as unknown as DesktopBridge
  const user = userEvent.setup()
  render(<HistoryDrafts bridge={bridge} onRecovered={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /处理本地草稿/ }))
  await screen.findByRole('heading', { name: local.title })
  expect(recover).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '导出本地草稿' }))
  expect(exportSession).toHaveBeenCalledWith(local, { includeAiAnswers: true, includeTranscript: true, includeInterviewInfo: true })
  const button = screen.getByRole('button', { name: '另存为新会话记录' }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  await user.click(button)
  expect(button.disabled).toBe(true)
  await user.click(button)
  expect(recover).toHaveBeenCalledTimes(1)
  release()
  await waitFor(() => expect(button.disabled).toBe(false))
  expect(screen.getByText('服务器记录已删除')).toBeTruthy()
})
