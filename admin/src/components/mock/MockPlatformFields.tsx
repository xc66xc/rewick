import type { Config } from '../../types'
import type { MockSettings } from '../../mock-interviews'
import styles from '../../styles.module.css'
interface Props { value: MockSettings; catalog: Config; onChange: (value: MockSettings) => void }
export default function MockPlatformFields({ value, catalog, onChange }: Props) {
  const models = catalog.models.filter(model => model.enabled && catalog.providers.some(provider => provider.id === model.providerId && provider.enabled && provider.kind === 'llm'))
  const services = catalog.providers.filter(provider => provider.enabled && provider.kind === 'asr')
  return <fieldset className={styles.editorCard}><legend>平台模型与语音识别</legend><p className={styles.hint}>引用“模型与服务”中已发布的服务，不复制其密钥。用户自定义模型不可用于模拟面试。</p><div className={styles.twoColumns}>
    {(['llmModelId'] as const).map(key => <label key={key} className={styles.field}>主持模型<select required={value.enabled} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })}><option value="">请选择平台模型</option>{value[key] && !models.some(model => model.id === value[key]) && <option value={value[key]} disabled>当前模型已停用或移除</option>}{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>)}
    <label className={styles.field}>ASR 服务<select required={value.enabled} value={value.asrServiceId} onChange={event => onChange({ ...value, asrServiceId: event.target.value })}><option value="">请选择语音识别服务</option>{value.asrServiceId && !services.some(provider => provider.id === value.asrServiceId) && <option value={value.asrServiceId} disabled>当前服务已停用或移除</option>}{services.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
  </div></fieldset>
}
