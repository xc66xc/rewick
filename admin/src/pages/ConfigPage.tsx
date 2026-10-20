import { Plus } from '@phosphor-icons/react'
import layout from './ConfigPage.module.css'
import { useEffect, useState } from 'react'
import { createServiceId } from '../service-id'
import { ApiError, type ApiClient, message } from '../api'
import { capabilityNames, configPayload, configSchema, testSchema, type Capability, type Config } from '../types'
import { applyService, serviceForms, type ServiceForm } from '../hooks/unified-service'
import ReferencePolicy from '../components/ReferencePolicy'
import DesktopSettingsPolicy from '../components/DesktopSettingsPolicy'
import ErrorBoundary from '../components/ErrorBoundary'
import UnifiedServiceCard from '../components/UnifiedServiceCard'
import LoadState from '../components/LoadState'
import ConfirmDialog from '../components/ConfirmDialog'
import styles from '../styles.module.css'
interface Props { api: ApiClient; active?: boolean }
export default function ConfigPage({ api, active = true }: Props) {
  const [category, setCategory] = useState<Capability | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const [showDesktopPolicy, setShowDesktopPolicy] = useState(false)
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
    setCategory('all'); setShowAdd(false)
    const id = createServiceId()
    setItems(current => [...current, { id, providerId: id, kind, name: '', model: '', url: kind === 'web-search' ? 'https://api.tavily.com/search' : '', topK: 5, searchDepth: 'advanced', timeoutMs: 8000, includeAnswer: 'none', maxOutputTokens: 2048, thinkingMode: 'default', thinkingProtocol: 'none', dimensions: 1024, enabled: true }])
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
        setConfig(value); setNotice(remove ? '已删除。' : item.enabled ? item.kind === 'web-search' ? '已保存并启用联网搜索，已授权用户可在桌面设置中开启。' : item.kind === 'embedding' ? '已保存并启用，平台资料索引与检索使用此服务。' : '已保存并启用，桌面端刷新服务列表后可见。' : '已停用，桌面端不再提供此项。')
      }
      return true
    } catch (reason) { setError(message(reason) + (reason instanceof ApiError && reason.status === 409 ? ' 请重新加载配置后重试。' : '')); return false }
    finally { setBusy(false) }
  }
  return <section className={styles.pageBody} aria-label="平台配置"><div className={styles.sectionHeading}><div><h2>模型与服务</h2><p>配置回答模型、语音转写、向量与联网搜索服务</p></div><div className={layout.add}><button className={styles.primaryButton} disabled={busy} aria-expanded={showAdd} onClick={() => setShowAdd(value => !value)}><Plus size={18} />添加服务</button>{showAdd && <div className={layout.addMenu}>{(['llm', 'asr', 'embedding', 'web-search'] as const).map(kind => <button type="button" key={kind} disabled={busy} onClick={() => add(kind)}>添加{capabilityNames[kind]}</button>)}</div>}</div></div>
    <div className={layout.tabs} role="group" aria-label="服务分类">{(['all', 'llm', 'asr', 'embedding', 'web-search'] as const).map(kind => <button key={kind} aria-pressed={category === kind} onClick={() => setCategory(kind)}>{kind === 'all' ? '全部' : capabilityNames[kind]}</button>)}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={layout.grid}>{items.map(item => <div key={item.id} hidden={category !== 'all' && item.kind !== category}><UnifiedServiceCard value={item} busy={busy} saved={config.providers.some(provider => provider.id === item.providerId)} active={active && (category === 'all' || item.kind === category)} onSave={save} onRemove={() => setRemoving(item)} /></div>)}</div>
    {!items.some(item => category === 'all' || item.kind === category) && <p className={styles.empty}>此分类尚无模型或服务，请添加。</p>}
    <section className={layout.policies} aria-label="平台相关设置"><h3>平台相关设置</h3><div className={layout.policyActions}><button type="button" className={styles.secondaryButton} aria-expanded={showPolicy} onClick={() => setShowPolicy(value => !value)}>资料上传配额</button><button type="button" className={styles.secondaryButton} aria-expanded={showDesktopPolicy} onClick={() => setShowDesktopPolicy(value => !value)}>桌面高级设置权限</button><button type="button" disabled={busy} className={styles.linkButton} onClick={() => { if (window.confirm('重新加载会丢弃未保存内容，是否继续？')) setRevision(value => value + 1) }}>重新加载配置</button></div></section>
    {showPolicy && <ReferencePolicy api={api} />}
    {showDesktopPolicy && <ErrorBoundary><DesktopSettingsPolicy api={api} config={config} /></ErrorBoundary>}
    {removing && <ConfirmDialog title={`删除 ${removing.name || '新服务'}`} action="确认删除" onClose={() => setRemoving(null)} onConfirm={() => { if (config.providers.some(provider => provider.id === removing.providerId)) void save(removing, false, true); else setItems(current => current.filter(item => item.id !== removing.id)); setRemoving(null) }}><p>删除后桌面端不再提供此项。</p></ConfirmDialog>}
  </section>
}
