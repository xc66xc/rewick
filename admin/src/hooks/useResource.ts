import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { type ApiClient, message } from '../api'
export type Resource<T> = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; data: T }
export function useResource<T>(api: ApiClient, path: string, schema: z.ZodType<T>) {
  const [state, setState] = useState<Resource<T>>({ kind: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })
    void api.request(path, schema, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ kind: 'ready', data }) })
      .catch(reason => { if (!controller.signal.aborted) setState({ kind: 'error', error: message(reason) }) })
    return () => controller.abort()
  }, [api, path, schema, revision])
  return { state, reload: () => setRevision(value => value + 1) }
}
