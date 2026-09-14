import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { zpayConfigSchema, type ZpayConfig } from '../payments'
import styles from '../styles.module.css'

interface ZpayConfigEditorProps { api: ApiClient; config: ZpayConfig; onSaved: () => void }
const fields = [
  { key: 'pid', label: 'ZPAY 商户 ID（PID）', type: 'text' },
  { key: 'gatewayUrl', label: 'API 下单地址（完整 mapi.php 地址）', type: 'url' },
  { key: 'queryUrl', label: '订单查询地址（完整 api.php 地址）', type: 'url' },
  { key: 'notifyUrl', label: 'ZPAY 支付通知地址（HTTPS）', type: 'url' },
  { key: 'returnUrl', label: '支付完成返回地址（HTTPS）', type: 'url' },
  { key: 'cid', label: '指定支付渠道 CID（选填）', type: 'text' }
] as const

export default function ZpayConfigEditor({ api, config, onSaved }: ZpayConfigEditorProps) {
  const [draft, setDraft] = useState(() => ({ ...config,
    gatewayUrl: config.gatewayUrl || 'https://zpayz.cn/mapi.php',
    queryUrl: config.queryUrl || 'https://zpayz.cn/api.php',
    notifyUrl: config.notifyUrl || 'https://api.junshi.icu/api/v1/payments/zpay/notify',
    returnUrl: config.returnUrl || 'https://junshi.icu/payment/result'
  }))
  const [merchantKey, setMerchantKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try {
      await api.request('/admin/payment-config/zpay', zpayConfigSchema, { method: 'PUT', body: {
        version: config.version, enabled: draft.enabled, pid: draft.pid, paymentType: draft.paymentType,
        gatewayUrl: draft.gatewayUrl, queryUrl: draft.queryUrl, notifyUrl: draft.notifyUrl,
        returnUrl: draft.returnUrl, cid: draft.cid, merchantKey
      } })
      setMerchantKey(''); onSaved()
    } catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}>
    <fieldset className={styles.editorCard} disabled={busy}><legend>ZPAY 支付</legend>
      <p className={styles.hint}>{config.configured ? 'ZPAY 资料已配置。' : 'ZPAY 资料尚未配置完整，当前渠道暂未开放。'} 当前版本 {config.version}。保存仅校验配置，不会发起真实扣款。</p>
      <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} />开放 ZPAY 支付</label>
      <label className={styles.field}>ZPAY 收款方式<select value={draft.paymentType} onChange={event => { const value = event.target.value; if (value === 'alipay' || value === 'wxpay') setDraft(current => ({ ...current, paymentType: value })) }}><option value="alipay">支付宝</option><option value="wxpay">微信支付</option></select></label>
      <div className={styles.twoColumns}>{fields.map(field => <label key={field.key} className={styles.field}>{field.label}<input type={field.type} required={draft.enabled && field.key !== 'cid'} maxLength={1000} autoComplete="off" value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} /></label>)}</div>
      <label className={styles.field}><span>ZPAY 商户密钥{config.hasMerchantKey && <span className={styles.badge}>已保存</span>}</span><input type="password" autoComplete="new-password" required={draft.enabled && !config.hasMerchantKey} value={merchantKey} onChange={event => setMerchantKey(event.target.value)} placeholder={config.hasMerchantKey ? '留空保留已有密钥' : '填写商户密钥'} /></label>
      <p className={styles.hint}>桌面端直接显示 ZPAY 付款二维码，下单接口需要返回 qrcode。请填写完整 mapi.php 地址。密钥只在当前表单内存中保留，保存成功或切换渠道后清除。取消或超时仅关闭本地订单，原付款链接可能仍然有效，收到有效付款通知后仍会入账。</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><button type="submit" className={styles.primaryButton}>{busy ? '保存中…' : '保存 ZPAY 设置'}</button></div>
    </fieldset>
  </form>
}
