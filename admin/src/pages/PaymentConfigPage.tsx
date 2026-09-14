import { useState } from 'react'
import type { ApiClient } from '../api'
import { alipayConfigSchema, paymentConfigSchema, zpayConfigSchema } from '../payments'
import { useResource } from '../hooks/useResource'
import PaymentConfigEditor from '../components/PaymentConfigEditor'
import AlipayConfigEditor from '../components/AlipayConfigEditor'
import ZpayConfigEditor from '../components/ZpayConfigEditor'
import LoadState from '../components/LoadState'
import styles from '../styles.module.css'
interface PaymentConfigPageProps { api: ApiClient }
export default function PaymentConfigPage({ api }: PaymentConfigPageProps) {
  const [channel, setChannel] = useState<'wechat' | 'alipay' | 'zpay'>('wechat')
  return <section className={styles.pageBody} aria-label="支付设置"><div className={styles.sectionHeading}><div><h2>支付渠道设置</h2><p>微信、支付宝与 ZPAY 分别配置和启用，共用套餐与用户可用时长。</p></div></div>
    <div className={styles.actions} role="group" aria-label="选择支付渠道"><button type="button" aria-pressed={channel === 'wechat'} className={channel === 'wechat' ? styles.primaryButton : styles.secondaryButton} onClick={() => setChannel('wechat')}>微信支付</button><button type="button" aria-pressed={channel === 'alipay'} className={channel === 'alipay' ? styles.primaryButton : styles.secondaryButton} onClick={() => setChannel('alipay')}>支付宝支付</button><button type="button" aria-pressed={channel === 'zpay'} className={channel === 'zpay' ? styles.primaryButton : styles.secondaryButton} onClick={() => setChannel('zpay')}>ZPAY</button></div>
    {channel === 'wechat' ? <WechatSettings api={api} /> : channel === 'alipay' ? <AlipaySettings api={api} /> : <ZpaySettings api={api} />}
  </section>
}
function WechatSettings({ api }: PaymentConfigPageProps) {
  const { state, reload } = useResource(api, '/admin/payment-config', paymentConfigSchema)
  const [notice, setNotice] = useState('')
  return <section aria-label="微信支付设置"><div className={styles.sectionHeading}><div><h3>微信支付设置</h3><p>商户开通 Native 支付并绑定 AppID 后，在这里配置支付资料。</p></div></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <PaymentConfigEditor key={state.data.version} api={api} config={state.data} onSaved={() => { setNotice('支付设置已保存。'); reload() }} />}
  </section>
}

function AlipaySettings({ api }: PaymentConfigPageProps) {
  const { state, reload } = useResource(api, '/admin/payment-config/alipay', alipayConfigSchema)
  const [notice, setNotice] = useState('')
  return <section aria-label="支付宝支付设置"><div className={styles.sectionHeading}><div><h3>支付宝支付设置</h3><p>开通电脑网站支付产品后，填写应用与收款商家资料。</p></div></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <AlipayConfigEditor key={state.data.version} api={api} config={state.data} onSaved={() => { setNotice('支付宝设置已保存。'); reload() }} />}
  </section>
}

function ZpaySettings({ api }: PaymentConfigPageProps) {
  const { state, reload } = useResource(api, '/admin/payment-config/zpay', zpayConfigSchema)
  const [notice, setNotice] = useState('')
  return <section aria-label="ZPAY 支付设置">
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <ZpayConfigEditor key={state.data.version} api={api} config={state.data} onSaved={() => { setNotice('ZPAY 设置已保存。'); reload() }} />}
  </section>
}
