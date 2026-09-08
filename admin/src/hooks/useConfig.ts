import { useEffect, useState } from 'react'
import { ApiError, type ApiClient, message } from '../api'
import { cleanSecrets, configPayload, configSchema, testSchema, type Capability, type Config } from '../types'
export function useConfig(api: ApiClient, active: boolean) {
  const [draft, setDraft] = useState<Config | null>(null)
  const [saved, setSaved] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setNotice('')
    void api.request('/admin/config', configSchema, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setDraft(value); setSaved(value); setConflict(false) } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, revision])
  useEffect(() => { if (!active) setDraft(current => current ? cleanSecrets(current) : current) }, [active])
  async function submit(test?: { capability: Capability; modelId?: string }) {
    if (!draft || busy) return
    setBusy(true); setError(''); setNotice('')
    const payload = configPayload(draft)
    try {
      if (test) {
        const result = await api.request('/admin/config/test', testSchema, { method: 'POST', body: { config: payload, ...test } })
        if (result.success) setNotice(`${result.message}（${result.latencyMs} ms）。测试未发布配置。`)
        else setError(`${result.message}（${result.latencyMs} ms）。配置草稿已保留。`)
      } else {
        const value = await api.request('/admin/config', configSchema, { method: 'PUT', body: payload })
        setDraft(value); setSaved(value); setConflict(false); setNotice(`版本 ${value.version} 已发布。新请求使用新配置，已建立的流式会话继续使用原配置。`)
      }
    } catch (reason) { setError(message(reason)); if (reason instanceof ApiError && reason.status === 409) setConflict(true) }
    finally { setBusy(false) }
  }
  return { draft, saved, setDraft, loading, busy, error, setError, notice, conflict, submit, reload: () => setRevision(value => value + 1) }
}
