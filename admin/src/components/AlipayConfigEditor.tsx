import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { alipayConfigSchema, type AlipayConfig } from '../payments'
import styles from '../styles.module.css'
interface AlipayConfigEditorProps { api: ApiClient; config: AlipayConfig; onSaved: () => void; onCancel?: () => void }
const textFields = [{ key: 'appId', label: '支付宝 AppID' }, { key: 'sellerId', label: '收款商家 PID' }, { key: 'notifyUrl', label: '支付宝支付通知地址（HTTPS）' }, { key: 'returnUrl', label: '支付完成返回地址（HTTPS）' }] as const
const secretFields = [{ key: 'appPrivateKey', label: '应用私钥（PKCS#8）', saved: 'hasAppPrivateKey' }, { key: 'alipayPublicKey', label: '支付宝公钥（PEM）', saved: 'hasAlipayPublicKey' }] as const
export default function AlipayConfigEditor({ api, config, onSaved, onCancel }: AlipayConfigEditorProps) {
  const [draft, setDraft] = useState(() => ({ ...config, gatewayUrl: config.gatewayUrl || 'https://openapi.alipay.com/gateway.do' }))
  const [secrets, setSecrets] = useState({ appPrivateKey: '', alipayPublicKey: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try {
      await api.request('/admin/payment-config/alipay', alipayConfigSchema, { method: 'PUT', body: { version: config.version, enabled: draft.enabled, appId: draft.appId, sellerId: draft.sellerId, gatewayUrl: draft.gatewayUrl, notifyUrl: draft.notifyUrl, returnUrl: draft.returnUrl, ...secrets } })
      setSecrets({ appPrivateKey: '', alipayPublicKey: '' }); onSaved()
    } catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className={styles.editorCard} disabled={busy}><legend>支付宝电脑网站支付</legend>
    <p className={styles.hint}>{config.configured ? '支付宝资料已配置。' : '支付宝资料尚未配置完整，当前渠道暂未开放。'} 当前版本 {config.version}。保存仅校验配置，不会发起真实扣款。</p>
    <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} />开放支付宝支付</label>
    <label className={styles.field}>支付环境<select value={draft.gatewayUrl} onChange={event => setDraft(current => ({ ...current, gatewayUrl: event.target.value }))}><option value="https://openapi.alipay.com/gateway.do">正式环境</option><option value="https://openapi-sandbox.dl.alipaydev.com/gateway.do">沙箱环境（测试）</option></select></label>
    {draft.gatewayUrl.includes('sandbox') && <p className={styles.warning}>沙箱环境仅用于测试，不会产生真实收款。上线前请更换正式环境及对应商户资料。</p>}
    <div className={styles.twoColumns}>{textFields.map(field => <label key={field.key} className={styles.field}>{field.label}<input required={draft.enabled} type={(field.key === 'notifyUrl' || field.key === 'returnUrl') ? 'url' : 'text'} maxLength={1000} value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} autoComplete="off" /></label>)}</div>
    {secretFields.map(field => <label className={styles.field} key={field.key}><span>{field.label}{config[field.saved] && <span className={styles.badge}>已保存</span>}</span><textarea autoComplete="off" spellCheck={false} rows={5} required={draft.enabled && !config[field.saved]} value={secrets[field.key]} onChange={event => setSecrets(current => ({ ...current, [field.key]: event.target.value }))} placeholder={config[field.saved] ? '留空保留已有内容' : '粘贴 PEM 内容'} /></label>)}
    <p className={styles.hint}>使用 RSA2 签名，应用私钥使用 PKCS#8 格式；私钥和支付宝公钥均可填写 PEM 或 Base64 内容。请填写支付宝公钥，不是应用公钥。密钥仅在当前表单内存中保留，保存成功、切换渠道或离开此页后清除。关闭渠道只阻止新订单，已创建订单继续处理支付通知和时长到账。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}>{onCancel && <button type="button" className={styles.secondaryButton} onClick={onCancel}>取消编辑</button>}<button type="submit" className={styles.primaryButton}>{busy ? '保存中…' : '保存支付宝设置'}</button></div>
  </fieldset></form>
}
