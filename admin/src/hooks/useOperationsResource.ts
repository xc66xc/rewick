import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { ApiError, type ApiClient, message } from '../api'
import type { Resource } from './useResource'
export function useOperationsResource<T>(api: ApiClient, path: string, schema: z.ZodType<T>, active = true) {
  const [state, setState] = useState<Resource<T>>({ kind: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!active) return
    let disposed = false
    let inflight: AbortController | null = null
    async function refresh() {
      if (disposed || document.visibilityState === 'hidden' || inflight) return
      const controller = new AbortController()
      inflight = controller
      try {
        const data = await api.request(path, schema, { signal: controller.signal })
        if (!disposed && !controller.signal.aborted) setState({ kind: 'ready', data })
      } catch (reason) {
        if (!disposed && !controller.signal.aborted) setState({ kind: 'error', error: reason instanceof ApiError && reason.status === 503 ? '运营观测暂不可用，请检查监控存储与采集服务。业务服务仍可继续使用。' : message(reason) })
      } finally { if (inflight === controller) inflight = null }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') { inflight?.abort(); inflight = null } else void refresh() }
    setState({ kind: 'loading' })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    document.addEventListener('visibilitychange', visibility)
    return () => { disposed = true; inflight?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [api, path, schema, active, revision])
  return { state, reload: () => setRevision(value => value + 1) }
}
