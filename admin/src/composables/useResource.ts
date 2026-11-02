import { onActivated, onDeactivated, onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { z } from 'zod'
import { message, type ApiClient } from '../api'
export type Resource<T> = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; data: T }
export function useResource<T>(api: ApiClient, path: MaybeRefOrGetter<string>, schema: z.ZodType<T>, enabled: MaybeRefOrGetter<boolean> = true) {
  const state = shallowRef<Resource<T>>({ kind: 'loading' })
  const visible = shallowRef(true)
  onActivated(() => { visible.value = true })
  onDeactivated(() => { visible.value = false; controller?.abort() })
  const revision = shallowRef(0)
  let controller: AbortController | undefined
  watch([() => toValue(path), revision, () => toValue(enabled) && visible.value], async ([url, , active], _, onCleanup) => {
    controller?.abort()
    if (!active) return
    const request = new AbortController(); controller = request
    onCleanup(() => request.abort())
    state.value = { kind: 'loading' }
    try { const data = await api.request(url, schema, { signal: request.signal }); if (!request.signal.aborted) state.value = { kind: 'ready', data } }
    catch (error) { if (!request.signal.aborted) state.value = { kind: 'error', error: message(error) } }
  }, { immediate: true })
  onScopeDispose(() => controller?.abort())
  return { state, reload: () => { revision.value++ } }
}
