// @vitest-environment jsdom
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../../src/renderer/src/components/ui/dialog'
import { Button } from '../../src/renderer/src/components/ui/button'

afterEach(() => cleanup())

function openModal(onOpenChange: (open: boolean) => void) {
  return render(
    <Modal
      open
      onOpenChange={onOpenChange}
      title="开始新会话"
      footer={<Button onClick={() => onOpenChange(false)}>取消</Button>}
    >
      <p>当前转写与回答会先存入面试记录。</p>
    </Modal>,
  )
}

describe('Modal 弹窗', () => {
  it('open=false 时不渲染,open 后出现标题/内容/关闭钮', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <Modal open={false} onOpenChange={onOpenChange} title="开始新会话">
        内容
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(
      <Modal open onOpenChange={onOpenChange} title="开始新会话">
        内容
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('开始新会话')).toBeTruthy()
    expect(screen.getByText('内容')).toBeTruthy()
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy()
  })

  it('点击右上角关闭或 Esc 均回调 onOpenChange(false)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    openModal(onClose)
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('Esc 关闭', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    openModal(onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledWith(false)
  })
})
