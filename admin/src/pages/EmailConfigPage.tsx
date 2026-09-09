import { useRef, useState } from 'react'
import type { ApiClient } from '../api'
import { useEmailConfig } from '../hooks/useEmailConfig'
import ConfirmDialog from '../components/ConfirmDialog'
import EmailConfigEditor from '../components/EmailConfigEditor'
import LoadState from '../components/LoadState'
import styles from '../styles.module.css'

interface EmailConfigPageProps { api: ApiClient; active?: boolean }
export default function EmailConfigPage({ api, active = true }: EmailConfigPageProps) {
  const editor = useEmailConfig(api, active)
  const form = useRef<HTMLFormElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const [confirmReload, setConfirmReload] = useState(false)
  const { draft, saved, busy } = editor
  if (editor.loading) return <LoadState />
  if (!draft) return <LoadState error={editor.error} onRetry={editor.reload} />
  async function submit(test = false) {
    if (!draft || !form.current?.reportValidity()) return
    if (test && (!draft.host.trim() || !draft.from.trim())) {
      editor.setError('测试连接前，请填写 SMTP 主机和发件邮箱。')
      feedback.current?.scrollIntoView({ block: 'nearest' }); return
    }
    await editor.submit(test)
    feedback.current?.scrollIntoView({ block: 'nearest' })
  }
  return <section className={styles.pageBody} aria-label="邮件服务配置">
    <div className={styles.sectionHeading}><div><h2>注册邮件服务</h2><p>先测试连接，再保存供平台使用。当前版本 <strong>{saved?.version}</strong>。</p></div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirmReload(true)}>重新加载邮件配置</button></div>
    <div ref={feedback} className={styles.feedback}>
      {editor.notice && <p className={styles.notice} role="status">{editor.notice}</p>}
      {editor.error && <p className={styles.error} role="alert">{editor.error}</p>}
      {editor.conflict && <p className={styles.warning}>邮件配置已被其他管理员更新。当前草稿仍在，重新加载将丢弃未保存内容，请先核对。</p>}
    </div>
    <form ref={form} onSubmit={event => { event.preventDefault(); void submit() }}>
      <EmailConfigEditor config={draft} saved={saved} disabled={busy} onChange={editor.setDraft} />
      <footer className={styles.publishBar}><p>连接测试只验证连接与认证，不会发送邮件，也不会保存配置。</p><div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void submit(true)}>测试连接</button>
        <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '处理中…' : '保存邮件配置'}</button>
      </div></footer>
    </form>
    {confirmReload && <ConfirmDialog title="重新加载邮件配置" action="丢弃草稿并重新加载" onConfirm={() => { setConfirmReload(false); editor.reload() }} onClose={() => setConfirmReload(false)}><p>这会丢弃未保存的修改和密码，以服务器配置替换。</p></ConfirmDialog>}
  </section>
}
