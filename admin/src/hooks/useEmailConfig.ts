import { useEffect, useRef, useState } from 'react'
import { ApiError, type ApiClient, message } from '../api'
import { cleanEmailPassword, emailConfigPayload, emailConfigSchema, testSchema, type EmailConfig } from '../types'

export function useEmailConfig(api: ApiClient, active: boolean) {
  const [draft, setDraft] = useState<EmailConfig | null>(null)
  const [saved, setSaved] = useState<EmailConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [revision, setRevision] = useState(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setNotice('')
    void api.request('/admin/email-config', emailConfigSchema, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setDraft(value); setSaved(value); setConflict(false) } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, revision])
  useEffect(() => { if (!active) setDraft(current => current ? cleanEmailPassword(current) : current) }, [active])
  useEffect(() => () => operation.current?.abort(), [])
  async function submit(test = false) {
    if (!draft || operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true); setError(''); setNotice('')
    const payload = emailConfigPayload(draft)
    try {
      if (test) {
        const result = await api.request('/admin/email-config/test', testSchema, { method: 'POST', body: { config: payload }, signal: controller.signal })
        if (controller.signal.aborted) return
        if (result.success) setNotice(`${result.message}（${result.latencyMs} ms）。仅验证连接与认证，未发送邮件，也未保存配置。`)
        else setError(`${result.message}（${result.latencyMs} ms）。配置草稿已保留。`)
      } else {
        const value = await api.request('/admin/email-config', emailConfigSchema, { method: 'PUT', body: payload, signal: controller.signal })
        if (controller.signal.aborted) return
        setDraft(value); setSaved(value); setConflict(false); setNotice(`邮件配置版本 ${value.version} 已保存。`)
      }
    } catch (reason) {
      if (!controller.signal.aborted) { setError(message(reason)); if (reason instanceof ApiError && reason.status === 409) setConflict(true) }
    } finally { operation.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  return { draft, saved, setDraft, loading, busy, error, setError, notice, conflict, submit, clearFeedback: () => { setNotice(''); setError('') }, reload: () => setRevision(value => value + 1) }
}
