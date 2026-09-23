import { useState } from 'react'
import { AppleLogo, WindowsLogo, UploadSimple, Copy } from '@phosphor-icons/react'
import type { ApiClient } from '../api'
import { type ClientDownload, downloadNames, fileSize } from '../downloads'
import { dateTime } from '../types'
import ClientDownloadEditor from './ClientDownloadEditor'
import styles from '../styles.module.css'
import layout from '../pages/ClientDownloadsPage.module.css'
interface Props { api: ApiClient; initial: ClientDownload[] }
export default function ClientDownloadsOverview({ api, initial }: Props) {
  const [items, setItems] = useState(initial)
  const [selectedId, setSelectedId] = useState(initial[0]?.id)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  async function copyPath(item: ClientDownload) {
    try { await navigator.clipboard.writeText(`/downloads/${item.platform}/${item.architecture}`); setCopyNotice('下载路径已复制。') }
    catch { setCopyNotice('复制失败，请手动复制下载路径。') }
  }
  const selected = items.find(item => item.id === selectedId)
  function select(id: string, edit = false) { setSelectedId(id); setEditing(edit) }
  return <>
    <div className={layout.grid}>{items.map(item => {
      const Icon = item.platform === 'macos' ? AppleLogo : WindowsLogo
      const name = downloadNames[item.id] || item.id
      const status = !item.filename ? '未上传' : item.enabled ? '已发布' : '未启用'
      return <article key={item.id} className={layout.card} aria-label={name} data-selected={selectedId === item.id}>
        <header className={layout.header}><span className={layout.icon}><Icon size={32} /></span><div className={layout.identity}><h3>{item.id === 'macos-arm64' ? 'macOS Apple Silicon' : name}</h3><p>{item.platform === 'macos' ? item.architecture === 'arm64' ? '适用于 Apple 芯片的 Mac' : '适用于 Intel 芯片的 Mac' : '适用于 64 位 Windows 系统'}</p></div><span className={status === '已发布' ? styles.enabledBadge : styles.mutedBadge}>{status}</span></header>
        {item.filename ? <dl className={layout.facts}><div><dt>版本号</dt><dd>{item.version || '未填写'}</dd></div><div><dt>文件名</dt><dd>{item.filename}</dd></div><div><dt>文件大小</dt><dd>{fileSize(item.fileSize)}</dd></div><div><dt>更新时间</dt><dd>{dateTime(item.updatedAt)}</dd></div></dl> : <div className={layout.empty}><UploadSimple size={32} /><strong>尚未上传安装包</strong><span>{item.platform === 'macos' ? '.dmg' : '.exe'} 格式 · 最大 500 MB</span></div>}
        {item.filename && <div className={layout.downloadPath}><code>{`/downloads/${item.platform}/${item.architecture}`}</code><button type="button" className={styles.linkButton} aria-label={`复制下载路径 ${name}`} onClick={() => void copyPath(item)}><Copy size={18} /></button></div>}
        <footer className={layout.actions}><button type="button" disabled={busy} className={styles.primaryButton} aria-label={`编辑 ${name}`} onClick={() => select(item.id, true)}>{item.filename ? '更新版本 / 配置' : '上传安装包'}</button><button type="button" disabled={busy} className={styles.secondaryButton} aria-pressed={selectedId === item.id && !editing} aria-label={`查看详情 ${name}`} onClick={() => select(item.id)}>发布详情</button></footer>
      </article>
    })}</div>
    {copyNotice && <p role="status" className={styles.notice}>{copyNotice}</p>}
    {selected && (editing ? <section className={layout.panel} aria-label="编辑客户端发布"><ClientDownloadEditor key={selected.id} api={api} initial={selected} onCancel={() => setEditing(false)} onBusyChange={setBusy} onSaved={value => setItems(current => current.map(item => item.id === value.id ? value : item))} /></section> : <section className={layout.panel} aria-label="发布信息"><div className={layout.detailHeading}><div><h3>发布信息</h3><p>{downloadNames[selected.id] || selected.id}</p></div><button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>编辑发布信息</button></div><dl className={layout.details}><div><dt>版本号</dt><dd>{selected.version || '未填写'}</dd></div><div><dt>架构</dt><dd>{selected.architecture}</dd></div><div><dt>最低系统版本</dt><dd>{selected.minimumOsVersion || '未填写'}</dd></div><div><dt>文件名</dt><dd>{selected.filename || '尚未上传安装包'}</dd></div><div><dt>SHA-256</dt><dd>{selected.sha256 || '尚无校验值'}</dd></div><div><dt>更新说明</dt><dd className={layout.notes}>{selected.releaseNotes || '暂无更新说明'}</dd></div></dl></section>)}
    {!items.length && <p className={styles.empty}>暂无客户端发布配置。</p>}
  </>
}
