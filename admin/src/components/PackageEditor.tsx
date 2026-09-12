import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { money, packageSchema, type PackageDraft, type TimePackage } from '../payments'
import DurationInput from './DurationInput'
import styles from '../styles.module.css'
interface PackageEditorProps { api: ApiClient; item?: TimePackage; onSaved: (item: TimePackage) => void; onDelete: () => void }
export default function PackageEditor({ api, item: initialItem, onSaved, onDelete }: PackageEditorProps) {
  const [item, setItem] = useState(initialItem)
  const [draft, setDraft] = useState<PackageDraft>(item ?? { name: '', description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 10000, sortOrder: 0, enabled: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function change<K extends keyof PackageDraft>(key: K, value: PackageDraft[K]) { setDraft(current => ({ ...current, [key]: value })) }
  async function save() {
    if (draft.durationSeconds <= 0) { setError('套餐时长必须大于 0。'); return }
    setBusy(true); setError('')
    try { const saved = await api.request(item ? `/admin/packages/${item.id}` : '/admin/packages', packageSchema, { method: item ? 'PUT' : 'POST', body: { ...draft, ...(item ? { version: item.version } : {}) } }); setItem(saved); onSaved(saved) }
    catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className={styles.editorCard} disabled={busy}><legend>{item?.name ?? '新套餐'}</legend>
    <div className={styles.twoColumns}><label className={styles.field}>套餐名称<input required maxLength={100} value={draft.name} onChange={event => change('name', event.target.value)} /></label><label className={styles.field}>排序<input type="number" required min={0} step={1} value={draft.sortOrder} onChange={event => change('sortOrder', Number(event.target.value))} /></label></div>
    <label className={styles.field}>套餐说明<textarea maxLength={500} value={draft.description} onChange={event => change('description', event.target.value)} /></label>
    <DurationInput value={draft.durationSeconds} onChange={value => change('durationSeconds', value)} label="购买时长（长期有效）" />
    <div className={styles.twoColumns}><label className={styles.field}>原价（元）<input required type="number" min={0.01} max={1000000} step={0.01} value={draft.originalPriceCents / 100} onChange={event => change('originalPriceCents', Math.round(Number(event.target.value) * 100))} /></label><label className={styles.field}>折扣（折，10 为原价）<input required type="number" min={0.001} max={10} step={0.001} value={draft.discountBps / 1000} onChange={event => change('discountBps', Math.round(Number(event.target.value) * 1000))} /></label></div>
    <p className={styles.hint}>预计售价 {money(Math.floor((draft.originalPriceCents * draft.discountBps + 5000) / 10000))}，保存后以服务端计算为准。{item && ` 当前售价 ${money(item.priceCents)}。`}</p>
    <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => change('enabled', event.target.checked)} />启用，保存后在桌面端显示</label>
    {error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className={styles.primaryButton} type="submit">{busy ? '保存中…' : '保存套餐'}</button><button className={styles.linkDanger} type="button" onClick={onDelete}>{item ? '归档套餐' : '取消新增'}</button></div>
  </fieldset></form>
}
