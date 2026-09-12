import { useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import { packagesSchema, type TimePackage } from '../payments'
import { useResource } from '../hooks/useResource'
import PackageEditor from '../components/PackageEditor'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadState from '../components/LoadState'
import styles from '../styles.module.css'
interface PackagesPageProps { api: ApiClient }
export default function PackagesPage({ api }: PackagesPageProps) {
  const { state, reload } = useResource(api, '/admin/packages', packagesSchema)
  const [updated, setUpdated] = useState<TimePackage[]>([])
  const [archived, setArchived] = useState<number[]>([])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<TimePackage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function archive() {
    if (!removing) return
    setBusy(true); setError('')
    try { await api.request(`/admin/packages/${removing.id}`, z.undefined(), { method: 'DELETE' }); setArchived(current => [...current, removing.id]); setRemoving(null); setNotice('套餐已归档，原有订单不受影响。') }
    catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  function saved(item: TimePackage) { setUpdated(current => [...current.filter(value => value.id !== item.id), item]); setAdding(false); setNotice('套餐已保存。启用的套餐将展示在桌面端。') }
  const items = state.kind === 'ready' ? [...state.data.filter(item => !updated.some(value => value.id === item.id)), ...updated].filter(item => !archived.includes(item.id)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) : []
  return <section className={styles.pageBody} aria-label="套餐管理"><div className={styles.sectionHeading}><div><h2>面试时长套餐</h2><p>每条套餐单独保存。购买时长长期有效，可重复购买并累加。</p></div><button className={styles.primaryButton} disabled={adding} onClick={() => setAdding(true)}>添加套餐</button></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {adding && <PackageEditor api={api} onSaved={saved} onDelete={() => setAdding(false)} />}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : items.length ? items.map(item => <PackageEditor key={item.id} api={api} item={item} onSaved={saved} onDelete={() => { setError(''); setRemoving(item) }} />) : <LoadState>尚无套餐，请添加。</LoadState>}
    {removing && <ConfirmDialog title="归档套餐" action="确认归档" busy={busy} error={error} onConfirm={() => void archive()} onClose={() => setRemoving(null)}><p>归档「{removing.name}」后不能再创建新订单；已经创建的订单继续按原套餐内容处理。</p></ConfirmDialog>}
  </section>
}
