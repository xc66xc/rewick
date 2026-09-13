import type { Config } from '../types'
import type { DesktopSettings } from '../desktop-settings'
import styles from '../styles.module.css'

interface Props {
  config: Config
  value: DesktopSettings
  busy: boolean
  onChange: (value: DesktopSettings) => void
  onSave: () => void
}
export default function DesktopDefaultsForm({ config, value, busy, onChange, onSave }: Props) {
  const providers = config.providers.filter(provider => provider.enabled)
  const models = config.models.filter(model => model.enabled && providers.some(provider => provider.kind === 'llm' && provider.id === model.providerId))
  const asr = providers.filter(provider => provider.kind === 'asr' && config.asr.enabled && config.asr.providerId === provider.id)
  const knowledge = providers.filter(provider => provider.kind === 'knowledge' && config.knowledge.enabled && config.knowledge.providerId === provider.id)
  return <form aria-label="普通用户默认服务" onSubmit={event => { event.preventDefault(); onSave() }}>
    <h3>普通用户默认服务</h3>
    <p className={styles.hint}>普通用户只调整回答风格，回答、转写和检索使用以下平台配置。请先添加并启用所需服务。</p>
    <fieldset disabled={busy} className={styles.twoColumns}>
      <legend className={styles.srOnly}>默认模型与检索设置</legend>
      <label className={styles.field}>默认回答模型<select required value={value.llmModelId} onChange={event => onChange({ ...value, llmModelId: event.target.value })}>
        <option value="">请选择回答模型</option>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label>
      <label className={styles.field}>默认生成温度<input type="number" min={0} max={2} step={0.1} required value={value.temperature} onChange={event => onChange({ ...value, temperature: Number(event.target.value) })} /></label>
      <label className={styles.field}>默认语音转写服务<select required value={value.asrServiceId} onChange={event => onChange({ ...value, asrServiceId: event.target.value })}>
        <option value="">请选择语音转写服务</option>{asr.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select></label>
      <label className={styles.field}>默认检索方式<select value={value.retrievalMode} onChange={event => onChange({ ...value, retrievalMode: event.target.value === 'remote' ? 'remote' : 'local' })}>
        <option value="local">平台资料检索</option><option value="remote">远程知识库</option>
      </select></label>
      {value.retrievalMode === 'remote' && <label className={styles.field}>默认远程知识库<select required value={value.knowledgeServiceId} onChange={event => onChange({ ...value, knowledgeServiceId: event.target.value })}>
        <option value="">请选择远程知识库</option>{knowledge.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select></label>}
    </fieldset>
    <button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? '保存中…' : '保存默认服务'}</button>
  </form>
}
