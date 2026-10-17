import { useRef, useState } from 'react'
import type { ApiClient } from '../api'
import { useMockSettings } from '../hooks/useMockSettings'
import { parseAllowedUsers } from '../mock-interviews'
import LoadState from '../components/LoadState'
import ConfirmDialog from '../components/ConfirmDialog'
import MockPlatformFields from '../components/mock/MockPlatformFields'
import MockTtsFields from '../components/mock/MockTtsFields'
import MockLimitsFields from '../components/mock/MockLimitsFields'
import styles from '../styles.module.css'
export default function MockInterviewConfigPage({ api }: { api: ApiClient }) {
  const editor = useMockSettings(api)
  const form = useRef<HTMLFormElement>(null)
  const [reload, setReload] = useState(false)
  const { draft, catalog, busy } = editor
  if (editor.loading) return <LoadState />
  if (!draft || !catalog) return <LoadState error={editor.error} onRetry={editor.reload} />
  return <section className={styles.pageBody} aria-label="模拟面试配置"><div className={styles.sectionHeading}><div><h2>模拟面试</h2><p>本地 2D 卡通面试官，平台统一服务与独立模拟余额</p></div><button className={styles.secondaryButton} disabled={busy} onClick={() => setReload(true)}>重新加载模拟配置</button></div>
    {editor.error && <p className={styles.error} role="alert">{editor.error}</p>}{editor.notice && <p className={styles.notice} role="status">{editor.notice}</p>}
    {editor.conflict && <p className={styles.warning}>配置已被其他管理员修改，当前草稿已保留。请先核对，再重新加载服务器配置。</p>}
    <form ref={form} onSubmit={event => { event.preventDefault(); void editor.submit() }}><fieldset disabled={busy || editor.conflict} className={styles.configStack}>
      <fieldset className={styles.editorCard}><legend>开放范围</legend><label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => editor.setDraft({ ...draft, enabled: event.target.checked })} />启用模拟面试</label><p className={styles.hint}>关闭后阻止新会话并暂停活动会话。灰度权限与“高级设置”授权独立。</p><label className={styles.field}>灰度用户 ID<textarea key={draft.version} defaultValue={draft.allowedUserIds.join(', ')} placeholder="例如 2, 5, 8" maxLength={16000} onChange={event => { const ids = parseAllowedUsers(event.target.value); event.target.setCustomValidity(ids ? '' : '请输入最多 1000 个有效正整数用户 ID'); if (ids) editor.setDraft({ ...draft, allowedUserIds: ids }) }} /></label><p className={styles.hint}>多个 ID 用逗号或换行分隔。留空表示所有普通用户开放，仍需有独立模拟余额。</p></fieldset>
      <MockPlatformFields value={draft} catalog={catalog} onChange={editor.setDraft} /><MockTtsFields value={draft} onChange={editor.setDraft} /><MockLimitsFields value={draft} onChange={editor.setDraft} />
    </fieldset><footer className={styles.publishBar}><p>首版一个卡通形象、仅麦克风作答、按钮打断。保存不会修改辅助面试余额。</p><div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={busy || editor.conflict} onClick={() => { if (form.current?.reportValidity()) void editor.submit(true) }}>测试 TTS 连接</button><button type="submit" className={styles.primaryButton} disabled={busy || editor.conflict}>{busy ? '处理中…' : '保存模拟配置'}</button></div></footer></form>
    {reload && <ConfirmDialog title="重新加载模拟配置" action="丢弃草稿并重新加载" onConfirm={() => { setReload(false); editor.reload() }} onClose={() => setReload(false)}><p>将丢弃未保存修改和 Key，以服务器配置替换。</p></ConfirmDialog>}
  </section>
}
