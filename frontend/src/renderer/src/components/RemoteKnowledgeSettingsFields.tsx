import type { Settings, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface RemoteKnowledgeSettingsFieldsProps { draft: SettingsInput; saved: Settings; onChange: (draft: SettingsInput) => void; onTest: () => void; disabled: boolean }
export default function RemoteKnowledgeSettingsFields({ draft, saved, onChange, onTest, disabled }: RemoteKnowledgeSettingsFieldsProps) {
  const remote = draft.remoteKnowledge
  const hasOwnKey = Boolean(remote.apiKey?.trim() || (remote.apiKey !== '' && saved.remoteKnowledge.hasApiKey))
  const usesPlatform = Boolean(draft.platform?.enabled && !hasOwnKey)
  return <fieldset className={styles.settingsGroup}>
    <legend>百炼远程知识库<span>使用已发布 Agent 的知识检索接口</span></legend>
    <label className={styles.referenceGlobalToggle}><input type="checkbox" checked={remote.enabled} onChange={event => onChange({ ...draft, remoteKnowledge: { ...remote, enabled: event.target.checked } })} />启用远程知识库</label>
    <p className={styles.formNote}>对所有面试环境生效。开启后只检索百炼，暂停本地知识库检索；关闭后按本地设置恢复。远程检索范围由百炼 Agent 决定。</p>
    {usesPlatform && <p className={styles.formNote}>当前使用平台知识库，无需填写检索地址、Agent ID 或供应商 Key。如需连接自己的知识库，可填写下方自带配置。</p>}
    <fieldset className={styles.settingsFields} disabled={!remote.enabled}>
      <label className={styles.field}>远程检索请求地址<input type="url" value={remote.url} required={remote.enabled && !usesPlatform} placeholder="https://{workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/indices/knowledge/search"
        onChange={event => onChange({ ...draft, remoteKnowledge: { ...remote, url: event.target.value } })} /></label>
      <p className={styles.fieldHint}>填写完整知识检索请求地址，地域、业务空间和 Key 需匹配。</p>
      <label className={styles.field}>远程知识库 Agent ID<input value={remote.agentId} required={remote.enabled && !usesPlatform} placeholder="填写已发布 Agent 的 ID"
        onChange={event => onChange({ ...draft, remoteKnowledge: { ...remote, agentId: event.target.value } })} /></label>
      <label className={styles.field}><span>远程知识库 API Key{saved.remoteKnowledge.hasApiKey && <span className={styles.savedBadge}>已保存</span>}</span>
        <input type="password" autoComplete="new-password" value={remote.apiKey ?? ''} required={remote.enabled && !hasOwnKey && !usesPlatform} placeholder={saved.remoteKnowledge.hasApiKey ? '留空保留已保存的 Key' : '填写远程知识库专用 API Key'}
          onChange={event => onChange({ ...draft, remoteKnowledge: { ...remote, apiKey: event.target.value || undefined } })} /></label>
      {saved.remoteKnowledge.hasApiKey && <button type="button" className={styles.secondaryButton} disabled={remote.apiKey === ''}
        onClick={() => onChange({ ...draft, remoteKnowledge: { ...remote, apiKey: '' } })}>{remote.apiKey === '' ? '保存后清除知识库 Key' : '清除自带知识库 Key'}</button>}
    </fieldset>
    <p className={styles.fieldHint}>Key 独立保存，不会复用转写、回答或向量模型的 Key。留空保留原值。启用后发送当前问题进行检索；测试使用固定问题。</p>
    <p className={styles.formNote}>远程检索失败、超时或没有结果时，不会自动改用本地资料。已选简历和岗位 JD 仍直接提供给回答模型。</p>
    <button type="button" className={styles.secondaryButton} disabled={disabled || !remote.enabled} onClick={onTest}>保存并测试远程知识库</button>
  </fieldset>
}
