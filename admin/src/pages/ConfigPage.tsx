import { useRef, useState } from 'react'
import type { ApiClient } from '../api'
import { capabilityNames, type Capability } from '../types'
import { useConfig } from '../hooks/useConfig'
import LoadState from '../components/LoadState'
import ConfirmDialog from '../components/ConfirmDialog'
import ProviderEditor from '../components/ProviderEditor'
import ModelEditor from '../components/ModelEditor'
import ServiceSelectors from '../components/ServiceSelectors'
import styles from '../styles.module.css'
interface ConfigPageProps { api: ApiClient; active?: boolean }
type Confirmation = { kind: 'reload' } | { kind: 'provider' | 'model'; id: string; name: string }
export default function ConfigPage({ api, active = true }: ConfigPageProps) {
  const editor = useConfig(api, active)
  const form = useRef<HTMLFormElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const { draft, saved, setDraft, busy } = editor
  if (editor.loading) return <LoadState />
  if (!draft) return <LoadState error={editor.error} onRetry={editor.reload} />
  function addProvider(kind: Capability) {
    if (!draft) return
    setDraft({ ...draft, providers: [...draft.providers, { id: `service-${crypto.randomUUID().slice(0, 8)}`, name: '', kind, url: '', enabled: true }] })
  }
  function requestRemoval(kind: 'provider' | 'model', id: string, name: string) {
    if (!draft) return
    if (kind === 'provider' && (draft.models.some(model => model.providerId === id) || draft.asr.providerId === id || draft.knowledge.providerId === id)) { editor.setError('请先移除该服务的模型，或清除转写与知识库的服务关联。'); feedback.current?.scrollIntoView({ block: 'nearest' }); return }
    if (kind === 'model' && draft.defaultModelId === id) { editor.setError('请先更换默认模型；若不再提供回答能力，请停用全部模型并将默认模型设为未设置。'); feedback.current?.scrollIntoView({ block: 'nearest' }); return }
    setConfirmation({ kind, id, name })
  }
  function confirm() {
    if (!confirmation || !draft) return
    if (confirmation.kind === 'reload') editor.reload()
    else if (confirmation.kind === 'provider') setDraft({ ...draft, providers: draft.providers.filter(provider => provider.id !== confirmation.id) })
    else setDraft({ ...draft, models: draft.models.filter(model => model.id !== confirmation.id) })
    setConfirmation(null)
  }
  async function submit(test?: { capability: Capability; modelId?: string }) {
    if (!form.current?.reportValidity()) return
    await editor.submit(test)
    feedback.current?.scrollIntoView({ block: 'nearest' })
  }
  return <section className={styles.pageBody} aria-label="平台配置"><div className={styles.sectionHeading}><div><h2>模型与服务</h2><p>编辑整份配置，测试通过后再发布。当前版本 <strong>{saved?.version}</strong>。</p></div><button className={styles.secondaryButton} disabled={busy} onClick={() => setConfirmation({ kind: 'reload' })}>重新加载配置</button></div>
    <div ref={feedback} className={styles.feedback}>{editor.notice && <p className={styles.notice} role="status">{editor.notice}</p>}{editor.error && <p className={styles.error} role="alert">{editor.error}</p>}{editor.conflict && <p className={styles.warning}>配置已被其他管理员更新。你的草稿仍在，重新加载会丢弃此草稿，请先核对需要保留的内容。</p>}</div>
    <form ref={form} onSubmit={event => { event.preventDefault(); void submit() }}><div className={styles.configStack}>
      <div className={styles.sectionHeading}><div><h3>01 · 供应商连接</h3><p>密钥只保留在当前草稿内存；发布成功或离开此页后清除。</p></div><div className={styles.actions}>{(['llm', 'asr', 'knowledge'] as const).map(kind => <button key={kind} type="button" className={styles.secondaryButton} disabled={busy || draft.providers.length >= 50} onClick={() => addProvider(kind)}>添加{capabilityNames[kind]}服务</button>)}</div></div>
      {!draft.providers.length && <p className={styles.empty}>尚无服务，先添加一个供应商连接。</p>}
      {draft.providers.map(provider => <ProviderEditor key={provider.id} provider={provider} original={saved?.providers.find(item => item.id === provider.id)} disabled={busy} onChange={value => setDraft({ ...draft, providers: draft.providers.map(item => item.id === provider.id ? value : item) })} onRemove={() => requestRemoval('provider', provider.id, provider.name || provider.id)} />)}
      <div className={styles.sectionHeading}><div><h3>02 · 开放模型目录</h3><p>显示名称供用户选择；供应商模型名称用于实际请求。</p></div><button type="button" className={styles.secondaryButton} disabled={busy || draft.models.length >= 100} onClick={() => setDraft({ ...draft, models: [...draft.models, { id: `model-${crypto.randomUUID().slice(0, 8)}`, name: '', providerId: '', model: '', enabled: true, maxOutputTokens: 2048 }] })}>添加模型</button></div>
      {!draft.models.length && <p className={styles.empty}>尚无开放模型。</p>}
      {draft.models.map(model => <ModelEditor key={model.id} model={model} providers={draft.providers} disabled={busy} onChange={value => setDraft({ ...draft, models: draft.models.map(item => item.id === model.id ? value : item) })} actions={{ remove: () => requestRemoval('model', model.id, model.name || model.id), test: () => void submit({ capability: 'llm', modelId: model.id }) }} />)}
      <div className={styles.sectionHeading}><div><h3>03 · 平台能力</h3><p>配置发布后，停用的能力不会回退到环境配置。</p></div></div>
      <ServiceSelectors config={draft} onChange={setDraft} onTest={capability => void submit({ capability })} disabled={busy} />
    </div><footer className={styles.publishBar}><p>发布应用于新请求，已建立的流式会话保持原配置。</p><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '处理中…' : '发布配置'}</button></footer></form>
    {confirmation && <ConfirmDialog title={confirmation.kind === 'reload' ? '重新加载服务器配置' : `移除${confirmation.kind === 'provider' ? '服务' : '模型'} · ${confirmation.name}`} action={confirmation.kind === 'reload' ? '丢弃草稿并重新加载' : '从草稿移除'} onConfirm={confirm} onClose={() => setConfirmation(null)}><p>{confirmation.kind === 'reload' ? '这会丢弃当前未发布的修改和未提交密钥，以服务器配置替换。' : '只从当前草稿移除，发布配置后生效。已建立的流式会话不会中断。'}</p></ConfirmDialog>}
  </section>
}
