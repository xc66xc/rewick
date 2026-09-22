// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocalRecording from '../src/renderer/src/components/LocalRecording'
import type { AppEvent, DesktopBridge } from '../src/shared/types'

afterEach(cleanup)
describe('local recording export', () => {
  it('shows saved local recording and explicitly starts review export', async () => {
    const exportReview = vi.fn().mockResolvedValue({ path: '/tmp/review.md' })
    const bridge = { recordings: { info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), exportReview }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    expect(await screen.findByText('本机录音')).toBeTruthy()
    expect(screen.getByText('录音在本机识别，不上传音频；仅将转写文字发送给回答模型生成复盘。识别速度取决于录音长度和电脑性能。')).toBeTruthy()
    expect(exportReview).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '导出面试复盘' }))
    expect(await screen.findByText('复盘已导出：/tmp/review.md')).toBeTruthy()
    expect(exportReview).toHaveBeenCalledWith('one')
  })
  it.each([
    ['transcribing', '正在本机识别录音'],
    ['summarizing', '正在生成复盘'],
    ['exporting', '正在导出']
  ] as const)('shows the %s export stage', async (stage, label) => {
    let listener: ((event: AppEvent) => void) | undefined
    const exportReview = vi.fn(() => {
      listener?.({ kind: 'recording-progress', sessionId: 'one', stage, completed: 1, total: 3 })
      return new Promise<null>(() => undefined)
    })
    const bridge = {
      recordings: {
        info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }),
        exportReview
      },
      onEvent: (callback: (event: AppEvent) => void) => { listener = callback; return () => { listener = undefined } }
    } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '导出面试复盘' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', `${label} 1 / 3`)
  })
  it('does not offer export for a recording on another device', async () => {
    const info = vi.fn().mockResolvedValue(null)
    const bridge = { recordings: { info }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: '导出面试复盘' })).toBeNull()
  })
})
