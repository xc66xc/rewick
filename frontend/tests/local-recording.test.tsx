// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocalRecording from '../src/renderer/src/components/LocalRecording'
import type { AppEvent, DesktopBridge } from '../src/shared/types'

vi.mock('../src/renderer/src/lib/window-scrim', () => ({ pushWindowScrim: vi.fn() }))
const resourceStatus = () => Promise.resolve({ ready: true, downloadBytes: 0, requiredBytes: 0 })
afterEach(cleanup)
describe('local recording export', () => {
  it.each([
    [{ path: '/tmp/interview.wav' }, '录音已保存：/tmp/interview.wav'],
    [null, null]
  ])('downloads audio independently and handles the save dialog result %s', async (result, notice) => {
    const download = vi.fn().mockResolvedValue(result)
    const exportReview = vi.fn()
    const bridge = { recordings: { resourceStatus, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), download, exportReview }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '下载录音' }))
    expect(download).toHaveBeenCalledWith('one')
    expect(exportReview).not.toHaveBeenCalled()
    if (notice) expect(await screen.findByRole('status')).toHaveProperty('textContent', notice)
    else expect(screen.queryByRole('status')).toBeNull()
  })
  it('reports download failure and allows retry', async () => {
    const download = vi.fn().mockRejectedValue(new Error('磁盘空间不足'))
    const bridge = { recordings: { resourceStatus, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), download }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '下载录音' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '磁盘空间不足')
    expect(screen.getByRole('button', { name: '下载录音' })).toHaveProperty('disabled', false)
  })
  it('shows saved local recording and explicitly starts review export', async () => {
    const exportReview = vi.fn().mockResolvedValue({ path: '/tmp/review.md' })
    const bridge = { recordings: { resourceStatus, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), exportReview }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    expect(await screen.findByText('面试录音')).toBeTruthy()
    expect(screen.getByText('根据录音分析面试表现，生成复盘报告。')).toBeTruthy()
    expect(exportReview).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '生成面试复盘' }))
    expect(await screen.findByText('复盘已导出：/tmp/review.md')).toBeTruthy()
    expect(exportReview).toHaveBeenCalledWith('one', { allowResourceDownload: false })
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
        resourceStatus,
        info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }),
        exportReview
      },
      onEvent: (callback: (event: AppEvent) => void) => { listener = callback; return () => { listener = undefined } }
    } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '生成面试复盘' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', `${label} 1 / 3`)
  })
  it('only asks to download on an explicit review request and never exports after cancelling consent', async () => {
    const status = vi.fn().mockResolvedValue({ ready: false, downloadBytes: 500 * 1024 ** 2, requiredBytes: 2 * 1024 ** 3 })
    const exportReview = vi.fn().mockResolvedValue(null)
    const bridge = { recordings: { info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), resourceStatus: status, exportReview }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    const button = await screen.findByRole('button', { name: '生成面试复盘' })
    expect(status).not.toHaveBeenCalled()
    await userEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: '下载本地语音资源' })
    expect(dialog.textContent).toContain('500.0 MB')
    expect(dialog.textContent).toContain('至少 2.0 GB')
    expect(exportReview).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /^取消$/ }))
    expect(exportReview).not.toHaveBeenCalled()
    await userEvent.click(button)
    await screen.findByRole('dialog', { name: '下载本地语音资源' })
    await userEvent.click(screen.getByRole('button', { name: '下载并继续' }))
    await waitFor(() => expect(exportReview).toHaveBeenCalledWith('one', { allowResourceDownload: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/复盘已导出/)).toBeNull()
  })
  it('renders byte progress, supports cancellation during resource preparation, and allows retry after failure', async () => {
    let listener: ((event: AppEvent) => void) | undefined
    let reject!: (error: Error) => void
    const exportReview = vi.fn(() => new Promise<null>((_resolve, fail) => { reject = fail }))
    const cancelExport = vi.fn(async () => { reject(new Error('已取消复盘导出。')) })
    const bridge = { recordings: { resourceStatus, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), exportReview, cancelExport }, onEvent: (callback: (event: AppEvent) => void) => { listener = callback; return () => { listener = undefined } } } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '生成面试复盘' }))
    act(() => listener?.({ kind: 'recording-progress', sessionId: 'one', stage: 'downloading', resourceId: 'runtime', downloadedBytes: 5 * 1024 ** 2, totalBytes: 10 * 1024 ** 2, completed: 0, total: 0 }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '正在下载语音环境 5.0 MB / 10.0 MB')
    act(() => listener?.({ kind: 'recording-progress', sessionId: 'one', stage: 'downloading', resourceId: 'runtime', downloadedBytes: 5 * 1024 ** 2, completed: 0, total: 0 }))
    expect(screen.getByRole('status')).toHaveProperty('textContent', '正在下载语音环境 5.0 MB')
    act(() => listener?.({ kind: 'recording-progress', sessionId: 'one', stage: 'downloading', resourceId: 'model-small', downloadedBytes: 2 * 1024 ** 2, totalBytes: 20 * 1024 ** 2, completed: 0, total: 0 }))
    expect(screen.getByRole('status')).toHaveProperty('textContent', '正在下载识别模型 2.0 MB / 20.0 MB')
    act(() => listener?.({ kind: 'recording-progress', sessionId: 'one', stage: 'checking', resourceId: 'runtime', completed: 0, total: 0 }))
    expect(screen.getByRole('status')).toHaveProperty('textContent', '正在检查语音环境')
    await userEvent.click(screen.getByRole('button', { name: '取消生成' }))
    expect(cancelExport).toHaveBeenCalledWith('one')
    await screen.findByText('已取消复盘导出。')
    expect(screen.getByRole('button', { name: '生成面试复盘' })).toHaveProperty('disabled', false)
    await userEvent.click(screen.getByRole('button', { name: '生成面试复盘' }))
    expect(exportReview).toHaveBeenCalledTimes(2)
  })
  it('does not start review after a resource status query completes for an unmounted session', async () => {
    let resolve!: (status: { ready: boolean; downloadBytes: number; requiredBytes: number }) => void
    const exportReview = vi.fn()
    const status = vi.fn(() => new Promise<{ ready: boolean; downloadBytes: number; requiredBytes: number }>(done => { resolve = done }))
    const bridge = { recordings: { resourceStatus: status, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), exportReview }, onEvent: () => () => undefined } as unknown as DesktopBridge
    const view = render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '生成面试复盘' }))
    view.unmount()
    await act(async () => resolve({ ready: true, downloadBytes: 0, requiredBytes: 0 }))
    expect(exportReview).not.toHaveBeenCalled()
  })
  it('does not resume export when a cancelled status query eventually completes', async () => {
    let resolve!: (status: { ready: boolean; downloadBytes: number; requiredBytes: number }) => void
    const exportReview = vi.fn()
    const status = vi.fn(() => new Promise<{ ready: boolean; downloadBytes: number; requiredBytes: number }>(done => { resolve = done }))
    const bridge = { recordings: { resourceStatus: status, info: vi.fn().mockResolvedValue({ sessionId: 'one', status: 'saved', durationSeconds: 60, bytes: 32000 }), exportReview, cancelExport: vi.fn() }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await userEvent.click(await screen.findByRole('button', { name: '生成面试复盘' }))
    await userEvent.click(screen.getByRole('button', { name: '取消生成' }))
    await act(async () => resolve({ ready: true, downloadBytes: 0, requiredBytes: 0 }))
    expect(exportReview).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '生成面试复盘' })).toHaveProperty('disabled', false)
  })
  it('does not offer export for a recording on another device', async () => {
    const info = vi.fn().mockResolvedValue(null)
    const bridge = { recordings: { info }, onEvent: () => () => undefined } as unknown as DesktopBridge
    render(<LocalRecording bridge={bridge} sessionId="one" />)
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: '生成面试复盘' })).toBeNull()
  })
})
