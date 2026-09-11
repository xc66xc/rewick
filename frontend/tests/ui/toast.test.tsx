// @vitest-environment jsdom
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppToastProvider, toast } from '../../src/renderer/src/components/ui/toast'

afterEach(() => cleanup())

describe('toast 轻提示', () => {
  it('toast.show 从组件树外弹出标题,并携带类型到 data-type', async () => {
    const user = userEvent.setup()
    render(
      <AppToastProvider>
        <button
          type="button"
          onClick={() => {
            toast.show('已保存设置')
            toast.show('索引构建完成', { type: 'success' })
          }}
        >
          触发
        </button>
      </AppToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: '触发' }))
    expect(await screen.findByText('索引构建完成')).toBeTruthy()
    // 根节点是 div[data-type],Toast.Title 自身是 h2[data-type],须按 div 取根
    const successRoot = document.querySelector('div[data-type="success"]')
    expect(successRoot?.className).toContain('bg-success')
    expect(successRoot?.querySelector('svg')).toBeTruthy()
    const infoRoot = document.querySelector('div[data-type="info"]')
    expect(infoRoot?.className).toContain('bg-overlay')
    expect(infoRoot?.querySelector('svg')).toBeNull()
  })

  it('action 按钮回调后 toast 关闭', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    render(
      <AppToastProvider>
        <button
          type="button"
          onClick={() => toast.show('已移除资料', { type: 'success', action: { label: '撤销', onClick: onUndo } })}
        >
          触发
        </button>
      </AppToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: '触发' }))
    await user.click(await screen.findByRole('button', { name: '撤销' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByText('已移除资料')).toBeNull()
    })
  })

  it('duration 0 不自动消失,toast.dismiss(id) 手动关闭', async () => {
    vi.useFakeTimers()
    try {
      render(<AppToastProvider><div /></AppToastProvider>)
      toast.show('常驻提示', { duration: 0 })
      await vi.advanceTimersByTimeAsync(0)
      expect(screen.getByText('常驻提示')).toBeTruthy()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(screen.getByText('常驻提示')).toBeTruthy()

      const id = toast.show('目标提示', { duration: 0 })
      await vi.advanceTimersByTimeAsync(0)
      expect(screen.getByText('目标提示')).toBeTruthy()
      toast.dismiss(id)
      // 结束动画 150ms + 移除
      await vi.advanceTimersByTimeAsync(600)
      expect(screen.queryByText('目标提示')).toBeNull()
      expect(screen.getByText('常驻提示')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
