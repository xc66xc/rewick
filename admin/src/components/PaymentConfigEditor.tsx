import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { paymentConfigSchema, type PaymentConfig, type PaymentSecrets } from '../payments'
import styles from '../styles.module.css'
interface PaymentConfigEditorProps { api: ApiClient; config: PaymentConfig; onSaved: () => void }
const secretFields = [
  { key: 'merchantPrivateKey', label: '商户私钥（PEM）', saved: 'hasMerchantPrivateKey' },
  { key: 'apiV3Key', label: 'API v3 密钥', saved: 'hasApiV3Key' },
  { key: 'wechatPublicKey', label: '微信支付公钥（PEM）', saved: 'hasWechatPublicKey' }
] as const
const textFields = [
  { key: 'mchId', label: '商户号 MchID' }, { key: 'appId', label: 'AppID' },
  { key: 'merchantSerial', label: '商户证书序列号' }, { key: 'wechatPublicKeyId', label: '微信支付公钥 ID' },
  { key: 'notifyUrl', label: '支付通知地址（HTTP / HTTPS）' }
] as const
export default function PaymentConfigEditor({ api, config, onSaved }: PaymentConfigEditorProps) {
  const [draft, setDraft] = useState(config)
  const [secrets, setSecrets] = useState<PaymentSecrets>({ merchantPrivateKey: '', apiV3Key: '', wechatPublicKey: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try {
      await api.request('/admin/payment-config', paymentConfigSchema, { method: 'PUT', body: { version: config.version, enabled: draft.enabled, mchId: draft.mchId, appId: draft.appId, merchantSerial: draft.merchantSerial, wechatPublicKeyId: draft.wechatPublicKeyId, notifyUrl: draft.notifyUrl, ...secrets } })
      setSecrets({ merchantPrivateKey: '', apiV3Key: '', wechatPublicKey: '' }); onSaved()
    } catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className={styles.editorCard} disabled={busy}><legend>微信 Native 扫码支付</legend>
    <p className={styles.hint}>{config.configured ? '支付资料已配置。' : '支付资料尚未配置完整，桌面端会显示“支付暂未开放”。'} 当前版本 {config.version}。保存仅校验配置，不会发起真实扣款。</p>
    <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} />开放套餐支付</label>
    <div className={styles.twoColumns}>{textFields.map(field => <label key={field.key} className={styles.field}>{field.label}<input required={draft.enabled} type={field.key === 'notifyUrl' ? 'url' : 'text'} maxLength={1000} value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} autoComplete="off" /></label>)}</div>
    {secretFields.map(field => <label className={styles.field} key={field.key}><span>{field.label}{config[field.saved] && <span className={styles.badge}>已保存</span>}</span>{field.key === 'apiV3Key' ? <input type="password" autoComplete="new-password" required={draft.enabled && !config[field.saved]} value={secrets[field.key]} onChange={event => setSecrets(current => ({ ...current, [field.key]: event.target.value }))} placeholder={config[field.saved] ? '留空保留已有密钥' : '填写密钥'} /> : <textarea autoComplete="off" spellCheck={false} rows={5} required={draft.enabled && !config[field.saved]} value={secrets[field.key]} onChange={event => setSecrets(current => ({ ...current, [field.key]: event.target.value }))} placeholder={config[field.saved] ? '留空保留已有内容' : '粘贴 PEM 内容'} />}</label>)}
    <p className={styles.hint}>密钥仅在当前表单内存中保留，保存成功或离开此页后清除。关闭支付只阻止新订单，已创建订单继续处理支付通知和时长到账。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="submit" className={styles.primaryButton}>{busy ? '保存中…' : '保存支付设置'}</button></div>
  </fieldset></form>
}
