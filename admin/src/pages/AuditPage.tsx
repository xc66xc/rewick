import { Fragment, useState } from 'react'
import { ArrowClockwise, ClockCounterClockwise, MagnifyingGlass, X } from '@phosphor-icons/react'
import type { ApiClient } from '../api'
import { auditPageSchema, dateTime } from '../types'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import Pagination from '../components/Pagination'
import styles from '../styles.module.css'
import ui from './AuditPage.module.css'

const actionNames: Record<string, string> = {
  'user.create': '创建用户', 'user.update': '更新用户', 'user.password_reset': '重置用户密码',
  'user.tokens_revoke': '撤销登录凭证', 'payment.package.save': '保存套餐',
  'payment.package.archive': '归档套餐', 'payment.config.save': '保存微信支付配置',
  'payment.alipay.config.save': '保存支付宝配置', 'payment.zpay.config.save': '保存 ZPAY 配置',
  'platform.config.publish': '发布模型与服务配置', 'platform.config.test.success': '服务连接测试成功',
  'platform.config.test.failed': '服务连接测试失败', 'email.config.publish': '发布邮件配置',
  'email.config.test': '测试邮件服务', 'desktop.defaults.update': '更新客户端默认设置',
  'desktop.permission.update': '更新客户端权限', 'client_download_upload': '上传客户端',
  'client_download_save': '保存客户端下载配置', 'invitation_settings_update': '更新邀请奖励',
}
function dayLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知日期' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
interface AuditPageProps { api: ApiClient }
export default function AuditPage({ api }: AuditPageProps) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { state, reload } = useResource(api, `/admin/audit?page=${page}&size=20`, auditPageSchema)
  const items = state.kind === 'ready' ? state.data.items : []
  const visible = items.filter(item => (!action || item.action === action) && (!actor || item.actorId === actor) &&
    [item.actorDisplayName, item.actorId, item.action, actionNames[item.action] ?? '', item.target].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
  const selected = visible.find(item => item.id === selectedId)
  const groups = new Map<string, typeof items>()
  for (const item of visible) {
    const day = dayLabel(item.createdAt)
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  function clearFilters() { setQuery(''); setAction(''); setActor(''); setSelectedId(null) }
  return <section className={styles.pageBody} aria-label="操作日志">
    <div className={styles.sectionHeading}><div><h2>操作日志</h2><p>追溯管理操作与配置变更</p></div><button className={styles.primaryButton} onClick={() => { setSelectedId(null); reload() }}><ArrowClockwise size={18} />刷新日志</button></div>
    <div className={ui.panel}>
      <div className={ui.toolbar}>
        <label className={ui.search}><span>搜索当前页</span><div><MagnifyingGlass size={18} aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setSelectedId(null) }} placeholder="操作、目标或操作者" /></div></label>
        <label>操作类型<select value={action} onChange={event => { setAction(event.target.value); setSelectedId(null) }}><option value="">全部操作</option>{[...new Set(items.map(item => item.action))].map(value => <option key={value} value={value}>{actionNames[value] ?? value}</option>)}</select></label>
        <label>操作者<select value={actor} onChange={event => { setActor(event.target.value); setSelectedId(null) }}><option value="">全部操作者</option>{[...new Map(items.map(item => [item.actorId, item.actorDisplayName])).entries()].map(([id, name]) => <option key={id} value={id}>{name} · {id}</option>)}</select></label>
        <button className={styles.secondaryButton} onClick={clearFilters}>重置</button>
      </div>
      <p className={ui.scope}>筛选仅针对当前页 · 当前显示 {visible.length} 条</p>
      {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <div className={ui.layout} data-selected={Boolean(selected)}>
        <div className={ui.list}>
          {visible.length ? <div className={styles.tableScroll}><table className={ui.table}><caption className={styles.srOnly}>操作日志列表</caption><thead><tr><th>时间</th><th>操作内容</th><th>操作者</th><th>目标对象</th></tr></thead>
            {[...groups].map(([day, records]) => <tbody key={day}><tr className={ui.group}><th colSpan={4} scope="rowgroup">{day}<span>{records.length} 条记录</span></th></tr>{records.map(item => <tr key={item.id} className={selected?.id === item.id ? ui.selected : undefined}>
              <td className={ui.time}>{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</td>
              <th scope="row"><button className={ui.action} aria-label={`${actionNames[item.action] ?? item.action} ${item.action}`} onClick={() => setSelectedId(item.id)} aria-expanded={selected?.id === item.id} aria-controls="audit-detail"><span className={ui.icon}><ClockCounterClockwise size={18} /></span><span>{actionNames[item.action] ?? item.action}<small>{item.action}</small></span></button></th>
              <td>{item.actorDisplayName}<span className={styles.tableDetail}>ID {item.actorId}</span></td><td className={ui.target} title={item.target}>{item.target}</td>
            </tr>)}</tbody>)}
          </table></div> : <LoadState>{items.length ? '当前页没有匹配的操作记录。' : '尚无管理操作记录。'}</LoadState>}
          <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={value => { setPage(value); clearFilters() }} />
        </div>
        <aside id="audit-detail" className={ui.detail} aria-label="操作详情">
          <div className={ui.detailHeading}><h3>操作详情</h3>{selected && <button className={styles.linkButton} aria-label="关闭操作详情" onClick={() => setSelectedId(null)}><X size={18} /></button>}</div>
          {selected ? <><div className={ui.detailTitle}><span className={ui.icon}><ClockCounterClockwise size={22} /></span><h4>{actionNames[selected.action] ?? selected.action}</h4><p>{dateTime(selected.createdAt)}</p></div>
            <dl className={ui.facts}>{[['操作者', selected.actorDisplayName], ['操作者 ID', selected.actorId], ['操作时间', dateTime(selected.createdAt)], ['操作代码', selected.action], ['目标对象', selected.target], ['日志 ID', selected.id]].map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
          </> : <div className={ui.placeholder}><ClockCounterClockwise size={36} /><strong>查看操作详情</strong><p>点击左侧操作，查看完整记录。</p></div>}
        </aside>
      </div>}
    </div>
  </section>
}
