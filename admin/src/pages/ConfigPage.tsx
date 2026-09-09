import { useEffect, useState } from 'react'
import { createServiceId } from '../service-id'
import { ApiError, type ApiClient, message } from '../api'
import { capabilityNames, configPayload, configSchema, testSchema, type Capability, type Config } from '../types'
import { applyService, serviceForms, type ServiceForm } from '../hooks/unified-service'
import UnifiedServiceCard from '../components/UnifiedServiceCard'
import LoadState from '../components/LoadState'
import ConfirmDialog from '../components/ConfirmDialog'
import styles from '../styles.module.css'
interface Props { api: ApiClient; active?: boolean }
export default function ConfigPage({ api, active = true }: Props) {
  const [config, setConfig] = useState<Config | null>(null)
  const [items, setItems] = useState<ServiceForm[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [removing, setRemoving] = useState<ServiceForm | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void api.request('/admin/config', configSchema, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setConfig(value); setItems(serviceForms(value)); setError('') } }).catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [api, revision])
  if (!config) return <LoadState error={error} onRetry={() => setRevision(value => value + 1)} />
  function add(kind: Capability) {
    const id = createServiceId()
    setItems(current => [...current, { id, providerId: id, kind, name: '', model: '', url: '', maxOutputTokens: 2048, enabled: true }])
  }
  async function save(item: ServiceForm, test = false, remove = false): Promise<boolean> {
    if (!config || busy) return false
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = configPayload(applyService(config, item, remove))
      if (test) {
        const modelId = payload.models.find(model => model.providerId === item.providerId && (model.id === item.id || model.id === `model-${item.providerId}`))?.id
        const result = await api.request('/admin/config/test', testSchema, { method: 'POST', body: { config: payload, capability: item.kind, ...(modelId ? { modelId } : {}) } })
        if (!result.success) throw new Error(result.message)
        setNotice(`${result.message}，未保存配置。`)
      } else {
        const value = await api.request('/admin/config', configSchema, { method: 'PUT', body: payload })
        const fresh = serviceForms(value)
        setItems(current => [
          ...fresh.map(row => { const old = current.find(candidate => candidate.id === row.id); return old && JSON.stringify(old) === JSON.stringify(row) ? old : row }),
          ...current.filter(row => row.id !== item.id && !config.providers.some(provider => provider.id === row.providerId)),
        ])
        setConfig(value); setNotice(remove ? '已删除。' : item.enabled ? '已保存并启用，桌面端刷新服务列表后可见。' : '已停用，桌面端不再提供此项。')
      }
      return true
    } catch (reason) { setError(message(reason) + (reason instanceof ApiError && reason.status === 409 ? ' 请重新加载配置后重试。' : '')); return false }
    finally { setBusy(false) }
  }
  return <section className={styles.pageBody} aria-label="平台配置"><div className={styles.sectionHeading}><div><h2>模型与服务</h2><p>每个模型只需填写一张表单，启用后向桌面端提供。</p></div><div className={styles.actions}>{(['llm', 'asr', 'knowledge'] as const).map(kind => <button type="button" key={kind} className={styles.secondaryButton} disabled={busy} onClick={() => add(kind)}>添加{capabilityNames[kind]}</button>)}</div></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <button type="button" disabled={busy} className={styles.secondaryButton} onClick={() => { if (window.confirm('重新加载会丢弃未保存内容，是否继续？')) setRevision(value => value + 1) }}>重新加载配置</button>
    {!items.length && <p className={styles.empty}>尚无模型或服务，请添加。</p>}
    {items.map(item => <UnifiedServiceCard key={item.id} value={item} busy={busy} saved={config.providers.some(provider => provider.id === item.providerId)} active={active} onSave={save} onRemove={() => setRemoving(item)} />)}
    {removing && <ConfirmDialog title={`删除 ${removing.name || '新服务'}`} action="确认删除" onClose={() => setRemoving(null)} onConfirm={() => { if (config.providers.some(provider => provider.id === removing.providerId)) void save(removing, false, true); else setItems(current => current.filter(item => item.id !== removing.id)); setRemoving(null) }}><p>删除后桌面端不再提供此项。</p></ConfirmDialog>}
  </section>
}
