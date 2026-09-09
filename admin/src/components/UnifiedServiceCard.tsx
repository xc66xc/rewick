import { useEffect, useState } from 'react'
import type { ServiceForm } from '../hooks/unified-service'
import { capabilityNames } from '../types'
import styles from '../styles.module.css'
interface Props { value: ServiceForm; busy: boolean; saved: boolean; onSave: (value: ServiceForm, test?: boolean) => Promise<boolean>; onRemove: () => void; active: boolean }
export default function UnifiedServiceCard({ value, busy, saved, onSave, onRemove, active }: Props) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (!active) setDraft(current => ({ ...current, apiKey: undefined })) }, [active])
  const changedUrl = saved && draft.url.trim() !== value.url
  return <form className={styles.editorCard} aria-label={`模型服务 ${value.name || '新服务'}`} onSubmit={event => { event.preventDefault(); const testing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-test') === 'true'; void onSave(draft, testing).then(success => { if (success && !testing) setDraft(current => ({ ...current, apiKey: undefined })) }) }}>
    <div className={styles.sectionHeading}><h3>{value.name || `新${capabilityNames[value.kind]}`}</h3><span className={styles.badge}>{saved ? value.enabled ? '已启用' : '已停用' : '未保存'}</span></div>
    <div className={styles.twoColumns}><label className={styles.field}>显示名称<input disabled={busy} required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label className={styles.field}>{value.kind === 'knowledge' ? '百炼 Agent ID' : '模型名称'}<input disabled={busy} required maxLength={200} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label></div>
    <label className={styles.field}>接口地址<input disabled={busy} required type="url" maxLength={2048} value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label>
    <p className={styles.hint}>{value.kind === 'llm' ? '填写完整 Chat Completions 地址，以 /chat/completions 结尾。' : value.kind === 'asr' ? '填写 Fun-ASR WebSocket 地址；当前平台同时启用一项转写服务。' : '填写百炼检索地址；当前平台同时启用一项远程知识库。'}</p>
    <label className={styles.field}>API Key<input disabled={busy} type="password" autoComplete="new-password" required={!value.hasApiKey || changedUrl} value={draft.apiKey ?? ''} placeholder={value.hasApiKey ? '已保存，留空保留' : '请输入 API Key'} onChange={event => setDraft({ ...draft, apiKey: event.target.value })} /></label>
    {value.kind === 'llm' && <label className={styles.field}>最大输出 Token<input disabled={busy} type="number" required min={1} max={8192} value={draft.maxOutputTokens} onChange={event => setDraft({ ...draft, maxOutputTokens: Number(event.target.value) })} /></label>}
    {!saved && <label className={styles.check}><input disabled={busy} type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />启用，保存后在桌面端显示</label>}
    <div className={styles.actions}><button type="submit" disabled={busy} className={styles.primaryButton}>保存</button><button type="submit" disabled={busy || !draft.enabled} className={styles.secondaryButton} data-test="true">测试连接</button>{saved && <button type="button" disabled={busy || JSON.stringify(draft) !== JSON.stringify(value)} className={styles.secondaryButton} onClick={() => void onSave({ ...value, enabled: !value.enabled })}>{value.enabled ? '停用' : '启用'}</button>}<button type="button" disabled={busy} className={styles.linkDanger} onClick={onRemove}>删除</button></div>
  </form>
}
