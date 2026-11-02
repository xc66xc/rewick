import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { render, screen } from '@testing-library/vue'
import { z } from 'zod'
import { ApiClient } from '../src/api'
import { useOperationsResource } from '../src/composables/useOperationsResource'
import { response } from './fixtures'

const Consumer = defineComponent({
  props: { active: { type: Boolean, default: true } },
  setup(props) {
    const resource = useOperationsResource(new ApiClient('test'), '/admin/operations/overview', z.object({ label: z.string() }), () => props.active)
    return () => h('p', { role: 'status' }, resource.state.value.kind === 'ready' ? resource.state.value.data.label : resource.state.value.kind === 'error' ? resource.state.value.error : '正在获取')
  }
})
function visibility(value: 'hidden' | 'visible') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(value === 'hidden')
  document.dispatchEvent(new Event('visibilitychange'))
}
afterEach(() => { vi.useRealTimers() })
describe('Vue operations polling lifecycle', () => {
  it('polls only while active and stops after unmount', async () => {
    vi.useFakeTimers(); const fetch = vi.fn(async () => response({ label: '最新指标' })); vi.stubGlobal('fetch', fetch)
    const view = render(Consumer); await flushPromises(); expect(screen.getByRole('status').textContent).toBe('最新指标'); expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30000); expect(fetch).toHaveBeenCalledTimes(2)
    await view.rerender({ active: false }); await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledTimes(2)
    await view.rerender({ active: true }); await flushPromises(); expect(fetch).toHaveBeenCalledTimes(3)
    view.unmount(); await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('does not overlap slow requests and aborts hidden work before refreshing on visibility', async () => {
    vi.useFakeTimers(); const requests: AbortSignal[] = []
    const pending: { resolve?: (value: Response) => void } = {}
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => { requests.push(options.signal as AbortSignal); return new Promise<Response>(resolve => { pending.resolve = resolve }) }))
    const view = render(Consumer); await nextTick(); await vi.advanceTimersByTimeAsync(90000); expect(requests).toHaveLength(1)
    visibility('hidden'); expect(requests[0].aborted).toBe(true); await vi.advanceTimersByTimeAsync(60000); expect(requests).toHaveLength(1)
    visibility('visible'); await nextTick(); expect(requests).toHaveLength(2)
    pending.resolve?.(response({ label: '恢复后的指标' })); await flushPromises(); expect(screen.getByRole('status').textContent).toBe('恢复后的指标')
    view.unmount(); expect(requests[1].aborted).toBe(false)
  })
  it('uses a recoverable 503 message without claiming that business services are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'storage unavailable' }, 503)))
    render(Consumer); await flushPromises(); expect(screen.getByRole('status').textContent).toContain('业务服务仍可继续使用')
  })
})
