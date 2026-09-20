// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryPage from '../src/renderer/src/components/HistoryPage'
import type { SessionRecord } from '../src/shared/types'

beforeEach(() => {
  // jsdom does not implement native dialogs; Electron E2E covers native focus trapping and Escape.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false } },
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function record(id: string, title: string): SessionRecord {
  return { id, title, createdAt: '2026-09-07T10:00:00.000Z', segments: [], answers: [] }
}
const initialRecords = [record('current', '当前面试'), record('past', '上一场面试')]
function setup(onDelete = vi.fn<(_id: string) => Promise<void>>().mockResolvedValue(undefined), locked = false) {
  function Harness() {
    const [records, setRecords] = useState(initialRecords)
    async function handleDelete(id: string) { await onDelete(id); setRecords(current => current.filter(value => value.id !== id)) }
    return <HistoryPage records={records} activeSessionId="current" activeSessionLocked={locked} onDelete={handleDelete} onExport={vi.fn(async () => undefined)} />
  }
  render(<Harness />)
  return { user: userEvent.setup(), onDelete }
}

describe('deleting a session from history', () => {
  it('lets the user cancel a titled confirmation without deleting and restores the delete-button focus', async () => {
    const { user, onDelete } = setup()
    const opener = screen.getByRole('button', { name: '删除会话：上一场面试' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: '删除会话记录' })
    expect(within(dialog).getByText('「上一场面试」')).toBeDefined()
    expect(within(dialog).getByText(/全部转写、回答和本次发送内容，无法撤销/)).toBeDefined()
    await user.click(within(dialog).getByRole('button', { name: '取消' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('deletes from detail, returns to the remaining records, and focuses the page title', async () => {
    const { user, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: /^上一场面试/ }))
    await user.click(screen.getByRole('button', { name: '删除会话' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await screen.findByText('已删除「上一场面试」。')
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('past')
    expect(screen.queryByRole('button', { name: '返回记录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除会话：上一场面试' })).toBeNull()
    expect(screen.getByRole('button', { name: '删除会话：当前面试' })).toBeDefined()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '会话记录', level: 1 })))
  })

  it('blocks duplicate deletion and closing while pending, then keeps a failed record available for retry', async () => {
    let rejectDelete: (reason: Error) => void = () => undefined
    const pending = new Promise<void>((_resolve, reject) => { rejectDelete = reject })
    const onDelete = vi.fn<(_id: string) => Promise<void>>().mockReturnValueOnce(pending).mockResolvedValueOnce(undefined)
    const { user } = setup(onDelete)
    await user.click(screen.getByRole('button', { name: '删除会话：上一场面试' }))
    await user.dblClick(screen.getByRole('button', { name: '确认删除' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: '删除中…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true)

    rejectDelete(new Error('暂时无法写入会话记录'))
    expect((await screen.findByRole('alert')).textContent).toContain('暂时无法写入会话记录')
    expect(within(screen.getByRole('dialog', { name: '删除会话记录' })).getByText('「上一场面试」')).toBeDefined()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await screen.findByText('已删除「上一场面试」。')
    expect(onDelete).toHaveBeenCalledTimes(2)
  })

  it('locks only the active recording or generating session while other records remain deletable', async () => {
    const { user, onDelete } = setup(undefined, true)
    const active = screen.getByRole('button', { name: '删除会话：当前面试' }) as HTMLButtonElement
    expect(active.disabled).toBe(true)
    await user.click(active)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: '删除会话：上一场面试' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await screen.findByText('已删除「上一场面试」。')
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('past')
  })

  it('explains that deleting the idle current session resets the workbench', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '删除会话：当前面试' }))
    expect(within(screen.getByRole('dialog', { name: '删除会话记录' })).getByText(/清空工作台并开始新会话/)).toBeDefined()
    expect((screen.getByRole('button', { name: '确认删除' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('server history', () => {
  it('shows the saved interview type in the list and details', async () => {
    const saved: SessionRecord = { ...record('general', '综合面记录'), interviewEnvironment: {
      id: 'env', name: '原始环境', interviewType: 'general', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [],
    } }
    render(<HistoryPage records={[saved]} activeSessionId="other" activeSessionLocked={false} onDelete={vi.fn()} onExport={vi.fn()} />)
    expect(screen.getByText('综合面试')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: '查看详情：综合面记录' }))
    expect(within(screen.getByLabelText('面试环境与目标详情')).getByText('综合面试')).toBeTruthy()
  })
  it('loads summaries by page and fetches body only when opened', async () => {
    const summary = { ...record('cloud', '服务器面试'), answerCount: 2, segmentCount: 3 }
    const getHistoryPage = vi.fn(async (cursor?: number) => ({ records: cursor ? [record('older', '更早面试')] : [summary], nextCursor: cursor ? null : 123 }))
    const getHistoryDetail = vi.fn(async () => ({ ...summary, segments: [{ id: 's', text: '服务器完整转写', startMs: 0, isFinal: true }] }))
    const bridge = { getHistoryPage, getHistoryDetail } as unknown as import('../src/shared/types').DesktopBridge
    render(<HistoryPage bridge={bridge} records={[]} activeSessionId="other" activeSessionLocked={false} onDelete={vi.fn()} onExport={vi.fn()} />)
    await screen.findByText('服务器面试')
    expect(getHistoryDetail).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '查看详情：服务器面试' }))
    await screen.findByText('服务器完整转写')
    expect(getHistoryDetail).toHaveBeenCalledWith('cloud')
    await userEvent.click(screen.getByRole('button', { name: '返回记录' }))
    await userEvent.click(screen.getByRole('button', { name: '下一页' }))
    await screen.findByText('更早面试')
    expect(getHistoryPage).toHaveBeenLastCalledWith(123)
  })
})
