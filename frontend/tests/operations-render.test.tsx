// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOperationsTelemetry } from '../src/renderer/src/hooks/useOperationsTelemetry'
import type { DesktopBridge, SessionRecord } from '../src/shared/types'
import { newRecord } from '../src/renderer/src/hooks/sessionHelpers'
const requestId = 'answer-request'
const operationId = '4239d77b-c2af-4bd9-9133-87cfa4f7a506'
afterEach(cleanup)
function setup(enabled: boolean) {
  const report = vi.fn()
  const ready = vi.fn(async () => enabled)
  const bridge = { reportTelemetry: report, telemetryEnabled: ready } as unknown as DesktopBridge
  return { report, ready, bridge }
}
function answer(record: SessionRecord, text: string): SessionRecord {
  return { ...record, answers: [{ id: requestId, text, question: 'test', createdAt: new Date().toISOString(), status: 'streaming' }] }
}
describe('renderer committed first content telemetry', () => {
  it('records exactly one committed nonblank answer even when the window is hidden', async () => {
    const { report, ready, bridge } = setup(true)
    const initial = newRecord()
    const hook = renderHook(({ record }) => useOperationsTelemetry(bridge, record, 'one'), { initialProps: { record: initial } })
    await waitFor(() => expect(ready).toHaveBeenCalledOnce())
    await act(async () => { await Promise.resolve(); hook.result.current.begin(operationId, requestId) })
    hook.rerender({ record: answer(initial, ' ') })
    expect(report).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    hook.rerender({ record: answer(initial, 'answer') })
    hook.rerender({ record: answer(initial, 'answer continuation') })
    expect(report).toHaveBeenCalledOnce()
    expect(report.mock.calls[0][0]).toMatchObject({ operationId, stage: 'answer.first_render', durationMs: expect.any(Number) })
  })
  it('does not collect when disabled', async () => {
    const { report, bridge } = setup(false)
    const initial = newRecord()
    const hook = renderHook(({ record }) => useOperationsTelemetry(bridge, record), { initialProps: { record: initial } })
    await act(async () => { hook.result.current.begin(operationId, requestId); await Promise.resolve() })
    hook.rerender({ record: answer(initial, 'answer') })
    hook.result.current.feedback(3)
    expect(report).not.toHaveBeenCalled()
  })
  it('clears pending rendering on account changes', async () => {
    const { report, bridge } = setup(true)
    const initial = newRecord()
    const hook = renderHook(({ record, account }) => useOperationsTelemetry(bridge, record, account), { initialProps: { record: initial, account: 'one' } })
    await act(async () => { await Promise.resolve(); hook.result.current.begin(operationId, requestId) })
    hook.rerender({ record: answer(initial, 'answer'), account: 'two' })
    expect(report).not.toHaveBeenCalled()
  })
})
