import { useState } from 'react'
import type { ApiClient } from '../api'
import { paymentConfigSchema } from '../payments'
import { useResource } from '../hooks/useResource'
import PaymentConfigEditor from '../components/PaymentConfigEditor'
import LoadState from '../components/LoadState'
import styles from '../styles.module.css'
interface PaymentConfigPageProps { api: ApiClient }
export default function PaymentConfigPage({ api }: PaymentConfigPageProps) {
  const { state, reload } = useResource(api, '/admin/payment-config', paymentConfigSchema)
  const [notice, setNotice] = useState('')
  return <section className={styles.pageBody} aria-label="支付设置"><div className={styles.sectionHeading}><div><h2>微信支付设置</h2><p>商户开通 Native 支付并绑定 AppID 后，在这里配置支付资料。</p></div></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <PaymentConfigEditor key={state.data.version} api={api} config={state.data} onSaved={() => { setNotice('支付设置已保存。'); reload() }} />}
  </section>
}
