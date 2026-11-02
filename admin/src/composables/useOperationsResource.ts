import { onActivated, onDeactivated, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { z } from 'zod'
import { ApiError, message, type ApiClient } from '../api'
import type { Resource } from './useResource'
export function useOperationsResource<T>(api: ApiClient, path: MaybeRefOrGetter<string>, schema: z.ZodType<T>, enabled: MaybeRefOrGetter<boolean> = true) {
  const state = shallowRef<Resource<T>>({ kind: 'loading' }), revision = ref(0), visible = ref(true)
  onActivated(() => { visible.value = true }); onDeactivated(() => { visible.value = false })
  watch([() => toValue(path), () => toValue(enabled) && visible.value, revision], ([url, active], _, onCleanup) => {
    if (!active) return
    let disposed = false, inflight: AbortController | null = null
    async function refresh() {
      if (disposed || document.visibilityState === 'hidden' || inflight) return
      const request = new AbortController(); inflight = request
      try { const data = await api.request(url, schema, { signal: request.signal }); if (!disposed && !request.signal.aborted) state.value = { kind: 'ready', data } }
      catch (reason) { if (!disposed && !request.signal.aborted) state.value = { kind: 'error', error: reason instanceof ApiError && reason.status === 503 ? '运营观测暂不可用，请检查监控存储与采集服务。业务服务仍可继续使用。' : message(reason) } }
      finally { if (inflight === request) inflight = null }
    }
    const visibility = () => { if (document.hidden) { inflight?.abort(); inflight = null } else void refresh() }
    state.value = { kind: 'loading' }; void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    document.addEventListener('visibilitychange', visibility)
    onCleanup(() => { disposed = true; inflight?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility) })
  }, { immediate: true })
  return { state, reload: () => { revision.value++ } }
}
