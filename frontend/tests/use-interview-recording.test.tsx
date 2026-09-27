// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopBridge } from '../src/shared/types'
import { useInterviewRecording } from '../src/renderer/src/hooks/useInterviewRecording'
const capture = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
vi.mock('../src/renderer/src/audio/mixed-recording-capture', () => ({ MixedRecordingCapture: class { start = capture.start; stop = capture.stop } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
function setup() {
  capture.start.mockResolvedValue(undefined); capture.stop.mockResolvedValue(undefined)
  const recordings = { start: vi.fn().mockResolvedValue(undefined), append: vi.fn().mockResolvedValue(undefined), info: vi.fn().mockResolvedValue(null), stop: vi.fn().mockResolvedValue({ bytes: 3200 }) }
  const bridge = { recordings, onEvent: () => () => undefined } as unknown as DesktopBridge
  return { recordings, bridge }
}
describe('interview recording lifecycle', () => {
  it('saves metadata before recording and flushes capture before closing file', async () => {
    const { recordings, bridge } = setup()
    const prepare = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useInterviewRecording(bridge, 'one', true, prepare))
    await waitFor(() => expect(result.current.state).toBe('recording'))
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(recordings.start.mock.invocationCallOrder[0])
    expect(result.current.state).toBe('recording')
    await act(() => result.current.stop())
    expect(capture.stop.mock.invocationCallOrder[0]).toBeLessThan(recordings.stop.mock.invocationCallOrder[0])
    expect(result.current.state).toBe('saved')
  })
  it('allows retry after permission failure produced an empty file', async () => {
    const { recordings, bridge } = setup()
    capture.start.mockRejectedValue(new Error('permission denied'))
    recordings.stop.mockResolvedValue({ bytes: 0 })
    const { result } = renderHook(() => useInterviewRecording(bridge, 'one', true, async () => undefined))
    await waitFor(() => expect(result.current.error).toContain('permission denied'))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.error).toContain('permission denied')
  })
  it('starts the next interview after closing the previous file', async () => {
    const { recordings, bridge } = setup()
    recordings.info.mockImplementation(async id => id === 'one' ? { bytes: 3200 } : null)
    const { result, rerender } = renderHook(({ id }) => useInterviewRecording(bridge, id, true, async () => undefined), { initialProps: { id: 'one' } })
    await waitFor(() => expect(result.current.state).toBe('recording'))
    rerender({ id: 'two' })
    await waitFor(() => expect(recordings.start).toHaveBeenLastCalledWith('two'))
    expect(recordings.stop.mock.invocationCallOrder[0]).toBeLessThan(recordings.start.mock.invocationCallOrder[1])
  })
})

describe('automatic recording', () => {
  it('starts once on entry and saves on interview end', async () => {
    const { recordings, bridge } = setup()
    const { result, rerender } = renderHook(({ active }) => useInterviewRecording(bridge, 'one', active, async () => undefined), { initialProps: { active: false } })
    expect(recordings.start).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(result.current.state).toBe('recording'))
    rerender({ active: true })
    expect(recordings.start).toHaveBeenCalledTimes(1)
    rerender({ active: false })
    await waitFor(() => expect(recordings.stop).toHaveBeenCalledTimes(1))
  })
  it('does not restart after failure until retried', async () => {
    const { recordings, bridge } = setup()
    capture.start.mockRejectedValueOnce(new Error('permission denied'))
    recordings.stop.mockResolvedValue({ bytes: 0 })
    const { result } = renderHook(() => useInterviewRecording(bridge, 'one', true, async () => undefined))
    await waitFor(() => expect(result.current.error).toContain('permission denied'))
    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(recordings.start).toHaveBeenCalledTimes(1)
    await act(() => result.current.start())
    expect(result.current.state).toBe('recording')
  })
  it('does not capture when the interview ends while opening the file', async () => {
    const { recordings, bridge } = setup()
    let opened: () => void = () => {}
    recordings.start.mockReturnValue(new Promise<void>(resolve => { opened = resolve }))
    const { rerender } = renderHook(({ active }) => useInterviewRecording(bridge, 'one', active, async () => undefined), { initialProps: { active: true } })
    await waitFor(() => expect(recordings.start).toHaveBeenCalledTimes(1))
    rerender({ active: false })
    await act(async () => opened())
    await waitFor(() => expect(recordings.stop).toHaveBeenCalledTimes(1))
    expect(capture.start).not.toHaveBeenCalled()
  })
})

describe('recording cancellation and recovery', () => {
  it('cancels a pending preparation without opening a recording', async () => {
    const { recordings, bridge } = setup()
    let prepared: () => void = () => {}
    const prepare = vi.fn(() => new Promise<void>(resolve => { prepared = resolve }))
    const { rerender } = renderHook(({ active }) => useInterviewRecording(bridge, 'one', active, prepare), { initialProps: { active: true } })
    await waitFor(() => expect(prepare).toHaveBeenCalled())
    rerender({ active: false })
    await act(async () => prepared())
    expect(recordings.start).not.toHaveBeenCalled()
  })
  it('retains the saved duration when retrying interrupted capture', async () => {
    const { recordings, bridge } = setup()
    const { result } = renderHook(() => useInterviewRecording(bridge, 'one', true, async () => undefined))
    await waitFor(() => expect(result.current.state).toBe('recording'))
    await act(async () => capture.start.mock.calls[0][1]())
    await waitFor(() => expect(result.current.state).toBe('saved'))
    expect(result.current.error).toContain('录音已中断')
    recordings.info.mockResolvedValue({ bytes: 320000, durationSeconds: 10 })
    await act(() => result.current.start())
    expect(result.current.state).toBe('recording')
    expect(result.current.seconds).toBe(10)
    expect(result.current.error).toBe('')
  })
})
