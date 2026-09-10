import { useEffect, useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import styles from '../styles.module.css'

const policySchema = z.object({ maxFiles: z.number().int().min(1).max(100), maxTotalBytes: z.number().int().min(1048576).max(1073741824), maxChunks: z.number().int().min(1).max(50000) })
interface Props { api: ApiClient }
export default function ReferencePolicy({ api }: Props) {
  const [policy, setPolicy] = useState<z.infer<typeof policySchema> | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void api.request('/admin/reference-policy', policySchema, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setPolicy(value); setError('') } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [api, revision])
  async function save() {
    if (!policy || busy) return
    setBusy(true); setSaved(false); setError('')
    try {
      await api.request('/admin/reference-policy', z.undefined(), { method: 'PUT', body: policy })
      setSaved(true)
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <section aria-label="资料上传配额" className={styles.editorCard}>
    <h3>资料上传配额</h3>
    <p className={styles.hint}>按每位用户限制。单个文件最大 10 MB，支持 PDF、TXT、MD；调低配额不会删除已上传资料。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {saved && <p role="status" className={styles.notice}>资料配额已保存。</p>}
    {!policy ? <button type="button" className={styles.secondaryButton} onClick={() => setRevision(value => value + 1)}>{error ? '重新加载配额' : '正在加载配额…'}</button> :
      <form aria-label="资料配额设置" onSubmit={event => { event.preventDefault(); void save() }}>
        <div className={styles.twoColumns}>
          <label className={styles.field}>每用户文件数量<input type="number" min={1} max={100} required disabled={busy} value={policy.maxFiles} onChange={event => { setSaved(false); setPolicy({ ...policy, maxFiles: Number(event.target.value) }) }} /></label>
          <label className={styles.field}>每用户资料总容量（MB）<input type="number" min={1} max={1024} step="any" required disabled={busy} value={policy.maxTotalBytes / 1048576} onChange={event => { setSaved(false); setPolicy({ ...policy, maxTotalBytes: Math.round(Number(event.target.value) * 1048576) }) }} /></label>
          <label className={styles.field}>每用户文本片段数量<input type="number" min={1} max={50000} required disabled={busy} value={policy.maxChunks} onChange={event => { setSaved(false); setPolicy({ ...policy, maxChunks: Number(event.target.value) }) }} /></label>
        </div>
        <button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? '保存中…' : '保存资料配额'}</button>
      </form>}
  </section>
}
