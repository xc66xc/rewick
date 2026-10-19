import { useEffect, useState } from 'react'
import { type ApiClient, message } from '../api'
import type { Config } from '../types'
import { desktopSettingsSchema, type DesktopSettings } from '../desktop-settings'
import DesktopDefaultsForm from './DesktopDefaultsForm'
import AdvancedSettingsUsers from './AdvancedSettingsUsers'
import LoadState from './LoadState'
import styles from '../styles.module.css'

interface Props { api: ApiClient; config: Config }
export default function DesktopSettingsPolicy({ api, config }: Props) {
  const [value, setValue] = useState<DesktopSettings | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void api.request('/admin/desktop-settings', desktopSettingsSchema, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setValue(data); setError('') } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [api, revision])
  async function save() {
    if (!value || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await api.request('/admin/desktop-settings', desktopSettingsSchema, { method: 'PUT', body: value })
      setValue(saved); setNotice('默认服务已保存。')
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <section className={styles.editorCard} aria-label="桌面高级设置权限">
    <div className={styles.sectionHeading}><h2>桌面高级设置权限</h2><button type="button" disabled={busy} className={styles.secondaryButton} onClick={() => { setNotice(''); setRevision(current => current + 1) }}>重新加载默认服务</button></div>
    {error && value && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {value ? <DesktopDefaultsForm config={config} value={value} busy={busy} onChange={next => { setValue(next); setNotice('') }} onSave={() => void save()} /> : <LoadState error={error} onRetry={() => setRevision(current => current + 1)} />}
    <AdvancedSettingsUsers api={api} />
  </section>
}
