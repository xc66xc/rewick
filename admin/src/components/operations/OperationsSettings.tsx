import { useEffect, useState } from 'react'
import { ApiError, type ApiClient, message } from '../../api'
import { settingsSchema, type OperationsSettings as Settings } from '../../operations'
import Modal from '../Modal'
import LoadState from '../LoadState'
import styles from '../../styles.module.css'
interface Props { api: ApiClient; onClose: () => void; onSaved: () => void }
const fields = [['firstContentP95Ms', '首段正文 P95 阈值（毫秒）', 1, 86400000, 1], ['errorRate', '失败率阈值（大于 0，至 1）', 0, 1, 'any'], ['degradedRate', '降级率阈值（大于 0，至 1）', 0, 1, 'any'], ['connectionUtilization', '连接利用率阈值（大于 0，至 1）', 0, 1, 'any'], ['minSamples', '最小样本数', 20, 10000, 1], ['sustainSeconds', '持续时间（秒）', 300, 86400, 1]] as const
export default function OperationsSettings({ api, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Settings | null>(null)
  const [users, setUsers] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void api.request('/admin/operations/settings', settingsSchema, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setDraft(value); setUsers(value.allowedUserIds.join('\n')) } }).catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [api])
  async function submit() {
    if (!draft || busy) return
    const value = settingsSchema.safeParse({ ...draft, allowedUserIds: [...new Set(users.split(/[\s,，]+/).map(item => item.trim()).filter(Boolean))] })
    if (!value.success) { setError('请检查灰度用户 ID 和阈值的范围。'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await api.request('/admin/operations/settings', settingsSchema, { method: 'PUT', body: value.data })
      setDraft(saved); setUsers(saved.allowedUserIds.join('\n')); setNotice(`版本 ${saved.version} 已保存。采集开关将在客户端与后端下次刷新后生效。`); onSaved()
    } catch (reason) { setError(reason instanceof ApiError && reason.status === 409 ? '版本冲突：其他管理员已修改。当前草稿已保留，请关闭后重新打开以加载新版本。' : message(reason)) }
    finally { setBusy(false) }
  }
  return <Modal title="运营观测设置" busy={busy} onClose={onClose}><div className={styles.modalBody}>{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}{!draft ? <LoadState error={error} /> : <form className={styles.formStack} onSubmit={event => { event.preventDefault(); void submit() }}><p className={styles.hint}>配置版本 {draft.version}。默认关闭；采集开启且灰度名单为空时采集所有用户，名单非空时仅采集所列用户。采集不包含问题、回答正文、Key 或 URL。</p><label className={styles.check}><input type="checkbox" disabled={busy} checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />开启采集</label><label className={styles.field}>灰度用户 ID<textarea disabled={busy} rows={3} maxLength={10000} value={users} onChange={event => setUsers(event.target.value)} /><span className={styles.hint}>每行一个数字用户 ID（最多 1000 个），也可用逗号分隔。留空表示采集所有用户。</span></label><fieldset className={styles.editorCard} disabled={busy}><legend>页面提醒阈值</legend><div className={styles.twoColumns}>{fields.map(([key, label, min, max, step]) => <label key={key} className={styles.field}>{label}<input type="number" required min={min} max={max} step={step} value={draft.thresholds[key]} onChange={event => setDraft({ ...draft, thresholds: { ...draft.thresholds, [key]: Number(event.target.value) } })} /></label>)}</div></fieldset><div className={styles.actions}><button className={styles.primaryButton} disabled={busy}>保存观测设置</button><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>关闭</button></div></form>}</div></Modal>
}
