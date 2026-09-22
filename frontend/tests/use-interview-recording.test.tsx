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
    await act(() => result.current.start())
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
    await act(() => result.current.start())
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toContain('permission denied')
  })
  it('resets saved state for the next interview', async () => {
    const { recordings, bridge } = setup()
    recordings.info.mockImplementation(async id => id === 'one' ? { bytes: 3200 } : null)
    const { result, rerender } = renderHook(({ id }) => useInterviewRecording(bridge, id, true, async () => undefined), { initialProps: { id: 'one' } })
    await waitFor(() => expect(result.current.state).toBe('saved'))
    rerender({ id: 'two' })
    await waitFor(() => expect(result.current.state).toBe('idle'))
  })
})
