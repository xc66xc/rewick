import { useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import { Plus } from '@phosphor-icons/react'
import Modal from '../components/Modal'
import PackageCard, { packageDuration } from '../components/PackageCard'
import layout from './PackagesPage.module.css'
import { money, packageSchema, packagesSchema, type TimePackage } from '../payments'
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
  const [editing, setEditing] = useState<TimePackage | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [toggling, setToggling] = useState<TimePackage | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<TimePackage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function archive() {
    if (!removing) return
    setBusy(true); setError('')
    try { await api.request(`/admin/packages/${removing.id}`, z.undefined(), { method: 'DELETE' }); setArchived(current => [...current, removing.id]); setRemoving(null); setEditing(null); setNotice('套餐已归档，原有订单不受影响。') }
    catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  function saved(item: TimePackage) { setUpdated(current => [...current.filter(value => value.id !== item.id), item]); setAdding(false); setEditing(null); setSelectedId(item.id); setNotice('套餐已保存。启用的套餐将展示在桌面端。') }
  const items = state.kind === 'ready' ? [...state.data.filter(item => !updated.some(value => value.id === item.id)), ...updated].filter(item => !archived.includes(item.id)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) : []
  const selected = items.find(item => item.id === selectedId) ?? items[0]
  async function toggle() {
    if (!toggling) return
    setBusy(true); setError('')
    const { id, priceCents: _price, ...draft } = toggling
    try { const result = await api.request(`/admin/packages/${id}`, packageSchema, { method: 'PUT', body: { ...draft, enabled: !draft.enabled } }); saved(result); setToggling(null) }
    catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <section className={styles.pageBody} aria-label="套餐管理">
    <div className={styles.sectionHeading}><div><h2>套餐管理</h2><p>管理在售套餐与面试时长</p></div><button className={styles.primaryButton} onClick={() => setAdding(true)}><Plus size={18} />添加套餐</button></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : items.length ? <>
      <div className={layout.grid}>{items.map(item => <PackageCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelectedId(item.id)} onEdit={() => setEditing(item)} onToggle={() => { setError(''); setToggling(item) }} />)}</div>
      <section className={layout.panel} aria-label="套餐展示顺序"><div className={layout.panelHeader}><div><h3>套餐展示顺序</h3><p>按排序从小到大展示，编辑套餐可调整顺序。</p></div><span className={styles.mutedBadge}>共 {items.length} 个套餐</span></div><div className={styles.tableScroll}><table><thead><tr><th>排序</th><th>套餐名称</th><th>售价</th><th>面试时长</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.sortOrder}</td><th scope="row">{item.name}</th><td>{money(item.priceCents)}</td><td>{packageDuration(item.durationSeconds)}</td><td><span className={item.enabled ? styles.enabledBadge : styles.mutedBadge}>{item.enabled ? '已上架' : '已下架'}</span></td><td><button className={styles.linkButton} onClick={() => setEditing(item)} aria-label={`修改排序 ${item.name}`}>编辑</button></td></tr>)}</tbody></table></div></section>
      {selected && <section className={layout.panel} aria-label="套餐信息"><div className={layout.panelHeader}><h3>套餐信息</h3><button className={styles.linkButton} onClick={() => setEditing(selected)}>修改资料</button></div><dl className={layout.details}><div><dt>当前查看</dt><dd>{selected.name}</dd></div><div><dt>原价</dt><dd>{money(selected.originalPriceCents)}</dd></div><div><dt>折扣</dt><dd>{selected.discountBps / 1000} 折</dd></div><div><dt>时效</dt><dd>长期有效</dd></div><div className={layout.full}><dt>套餐说明</dt><dd>{selected.description || '暂无套餐说明'}</dd></div></dl></section>}
    </> : <LoadState>尚无套餐，请添加。</LoadState>}
    {(adding || editing) && <Modal title={editing ? `编辑套餐 · ${editing.name}` : '添加套餐'} busy={editorBusy} onClose={() => { setAdding(false); setEditing(null) }}><PackageEditor api={api} item={editing ?? undefined} onBusyChange={setEditorBusy} onSaved={saved} onDelete={() => { if (editing) { setError(''); setRemoving(editing) } else setAdding(false) }} /></Modal>}
    {toggling && <ConfirmDialog title={toggling.enabled ? '下架套餐' : '上架套餐'} action={toggling.enabled ? '确认下架' : '确认上架'} busy={busy} error={error} onConfirm={() => void toggle()} onClose={() => setToggling(null)}><p>{toggling.enabled ? `下架「${toggling.name}」后，用户将无法购买此套餐，已有订单不受影响。` : `上架「${toggling.name}」后，将以 ${money(toggling.priceCents)} 在桌面端出售。`}</p></ConfirmDialog>}
    {removing && <ConfirmDialog title="归档套餐" action="确认归档" busy={busy} error={error} onConfirm={() => void archive()} onClose={() => setRemoving(null)}><p>归档「{removing.name}」后不能再创建新订单；已经创建的订单继续按原套餐内容处理。</p></ConfirmDialog>}
  </section>
}
