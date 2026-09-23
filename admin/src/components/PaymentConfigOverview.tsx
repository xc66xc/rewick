import { useState } from 'react'
import { CheckCircle, Circle, Copy, LockKey, PencilSimple } from '@phosphor-icons/react'
import type { AlipayConfig, PaymentConfig, ZpayConfig } from '../payments'
import styles from '../styles.module.css'
import layout from '../pages/PaymentConfigPage.module.css'
interface Props { config: PaymentConfig | AlipayConfig | ZpayConfig; channel: 'wechat' | 'alipay' | 'zpay'; onEdit: () => void }
export default function PaymentConfigOverview({ config, channel, onEdit }: Props) {
  const [copyStatus, setCopyStatus] = useState('')
  const name = channel === 'wechat' ? '微信支付' : channel === 'alipay' ? '支付宝' : 'ZPAY'
  const merchant = 'mchId' in config ? Boolean(config.mchId && config.appId && config.merchantSerial && config.wechatPublicKeyId) : 'sellerId' in config ? Boolean(config.appId && config.sellerId && config.gatewayUrl) : Boolean(config.pid && config.gatewayUrl && config.queryUrl)
  const keys = 'hasMerchantKey' in config ? config.hasMerchantKey : 'hasAppPrivateKey' in config ? config.hasAppPrivateKey && config.hasAlipayPublicKey : config.hasMerchantPrivateKey && config.hasApiV3Key && config.hasWechatPublicKey
  const callbacks = Boolean(config.notifyUrl && (!('returnUrl' in config) || config.returnUrl))
  const rows: [string, string][] = 'mchId' in config
    ? [['商户号 MchID', config.mchId], ['AppID', config.appId], ['商户证书序列号', config.merchantSerial], ['微信支付公钥 ID', config.wechatPublicKeyId], ['支付方式', 'Native 扫码支付']]
    : 'sellerId' in config
      ? [['收款商家 PID', config.sellerId], ['支付宝 AppID', config.appId], ['支付环境', config.gatewayUrl ? config.gatewayUrl.includes('sandbox') ? '沙箱环境' : '正式环境' : '未配置'], ['网关地址', config.gatewayUrl]]
      : [['商户编号', config.pid], ['下单地址', config.gatewayUrl], ['支付方式', config.paymentType === 'alipay' ? '支付宝' : '微信支付']]
  const checks = [{ label: '商户与接口信息', ok: merchant }, { label: '密钥配置', ok: keys }, { label: '回调与返回地址', ok: callbacks }]
  async function copy() {
    try { await navigator.clipboard.writeText(config.notifyUrl); setCopyStatus('回调地址已复制。') }
    catch { setCopyStatus('复制失败，请手动选择地址复制。') }
  }
  return <>
    <div className={layout.detailGrid}>
      <section className={layout.panel} aria-label={`${name}配置概览`}>
        <header className={layout.panelHeader}><div><h3>{name}配置</h3><p>已保存的渠道配置 · 版本 {config.version}</p></div><button className={styles.primaryButton} type="button" onClick={onEdit}><PencilSimple size={18} />编辑配置</button></header>
        <dl className={layout.facts}><div><dt>渠道状态</dt><dd>{config.enabled ? config.configured ? '已启用' : '已开启 · 配置不完整' : '未启用'}</dd></div>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '未配置'}</dd></div>)}<div><dt>支付密钥</dt><dd className={layout.key}><LockKey size={18} />{keys ? '已配置' : '待完善'}</dd></div></dl>
      </section>
      <aside className={layout.panel} aria-label="接入检查"><h3>接入检查</h3><p className={layout.caption}>根据已保存配置检查必填项</p><ul className={layout.checks}>{checks.map(check => <li key={check.label}>{check.ok ? <CheckCircle size={25} className={layout.complete} /> : <Circle size={25} />}<div><strong>{check.label}</strong><span>{check.ok ? '已填写' : '待完善'}</span></div></li>)}</ul><p className={layout.caption}>{config.configured ? '渠道配置完整' : '渠道配置尚未完整'}。此检查不代表支付连通性验证。</p></aside>
    </div>
    <section className={layout.panel} aria-label="支付回调信息"><h3>回调信息</h3><p className={layout.caption}>支付完成后，{name}向此地址发送支付结果通知</p><div className={layout.callback}><code>{config.notifyUrl || '尚未配置支付通知地址'}</code><button type="button" disabled={!config.notifyUrl} className={styles.linkButton} onClick={() => void copy()}><Copy size={18} />复制</button></div>{copyStatus && <p role="status" className={layout.caption}>{copyStatus}</p>}</section>
  </>
}
