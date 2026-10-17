import { useEffect, useRef, useState } from 'react'
import { ApiError, message, type ApiClient } from '../api'
import { configSchema, type Config } from '../types'
import { mockSettingsPayload, mockSettingsSchema, mockTestSchema, type MockSettings } from '../mock-interviews'

export function useMockSettings(api: ApiClient) {
  const [draft, setDraft] = useState<MockSettings | null>(null)
  const [catalog, setCatalog] = useState<Config | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setNotice('')
    void Promise.all([api.request('/admin/mock-interviews/settings', mockSettingsSchema, { signal: controller.signal }), api.request('/admin/config', configSchema, { signal: controller.signal })])
      .then(([settings, services]) => { if (!controller.signal.aborted) { setDraft(settings); setCatalog(services); setConflict(false) } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, revision])
  useEffect(() => () => operation.current?.abort(), [])
  async function submit(test = false) {
    if (!draft || operation.current || conflict) return
    const controller = new AbortController()
    operation.current = controller; setBusy(true); setError(''); setNotice('')
    try {
      const body = mockSettingsPayload(draft)
      if (test) {
        const result = await api.request('/admin/mock-interviews/settings/test', mockTestSchema, { method: 'POST', body, signal: controller.signal })
        if (!controller.signal.aborted) { if (result.success) setNotice(`${result.message}。测试会合成一段固定语音，不保存草稿。`); else setError(result.message) }
      } else {
        const result = await api.request('/admin/mock-interviews/settings', mockSettingsSchema, { method: 'PUT', body, signal: controller.signal })
        if (!controller.signal.aborted) { setDraft(result); setNotice(`模拟面试配置版本 ${result.version} 已保存。`) }
      }
    } catch (reason) { if (!controller.signal.aborted) { setError(message(reason)); if (reason instanceof ApiError && reason.status === 409) setConflict(true) } }
    finally { operation.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  return { draft, setDraft, catalog, busy, loading, error, notice, conflict, submit, reload: () => setRevision(value => value + 1) }
}
