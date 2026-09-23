import { useState } from 'react'
import { CaretRight, CreditCard, Wallet, WechatLogo } from '@phosphor-icons/react'
import type { ApiClient } from '../api'
import { alipayConfigSchema, paymentConfigSchema, zpayConfigSchema } from '../payments'
import { useResource } from '../hooks/useResource'
import PaymentConfigEditor from '../components/PaymentConfigEditor'
import AlipayConfigEditor from '../components/AlipayConfigEditor'
import ZpayConfigEditor from '../components/ZpayConfigEditor'
import PaymentConfigOverview from '../components/PaymentConfigOverview'
import LoadState from '../components/LoadState'
import styles from '../styles.module.css'
import layout from './PaymentConfigPage.module.css'
interface PaymentConfigPageProps { api: ApiClient }
const channels = [
  { id: 'wechat', name: '微信支付', subtitle: '微信官方支付渠道', description: 'Native 扫码支付', Icon: WechatLogo },
  { id: 'alipay', name: '支付宝支付', subtitle: '支付宝官方支付渠道', description: '电脑网站支付', Icon: Wallet },
  { id: 'zpay', name: 'ZPAY', subtitle: '第三方支付渠道', description: '选择支付宝或微信收款', Icon: CreditCard },
] as const
export default function PaymentConfigPage({ api }: PaymentConfigPageProps) {
  const [channel, setChannel] = useState<'wechat' | 'alipay' | 'zpay'>('wechat')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const wechat = useResource(api, '/admin/payment-config', paymentConfigSchema)
  const alipay = useResource(api, '/admin/payment-config/alipay', alipayConfigSchema)
  const zpay = useResource(api, '/admin/payment-config/zpay', zpayConfigSchema)
  const resources = { wechat, alipay, zpay }
  const selected = resources[channel]
  function saved() { setNotice(channel === 'wechat' ? '支付设置已保存。' : channel === 'alipay' ? '支付宝设置已保存。' : 'ZPAY 设置已保存。'); selected.reload() }
  return <section className={styles.pageBody} aria-label="支付设置">
    <div className={styles.sectionHeading}><div><h2>支付设置</h2><p>管理支付渠道，配置收款方式</p></div></div>
    <div className={layout.channels} role="group" aria-label="选择支付渠道">{channels.map(({ id, name, subtitle, description, Icon }) => {
      const state = resources[id].state
      const status = state.kind === 'loading' ? '加载中' : state.kind === 'error' ? '加载失败' : state.data.enabled && state.data.configured ? '已启用' : !state.data.configured ? '待配置' : '未启用'
      return <button key={id} type="button" className={layout.channel} aria-label={name} aria-pressed={channel === id} onClick={() => { setChannel(id); setEditing(false); setNotice('') }}>
        <span className={layout.channelTop}><span className={layout.icon}><Icon size={30} /></span><span className={layout.identity}><strong>{name}</strong><span>{subtitle}</span></span><span className={status === '已启用' ? styles.enabledBadge : styles.mutedBadge}>{status}</span></span>
        <span className={layout.channelBottom}><span>{description}</span><span className={layout.configure}>配置<CaretRight size={16} /></span></span>
      </button>
    })}</div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {selected.state.kind === 'loading' ? <LoadState /> : selected.state.kind === 'error' ? <LoadState error={selected.state.error} onRetry={selected.reload} /> : <>
      {!editing && <PaymentConfigOverview key={channel} config={selected.state.data} channel={channel} onEdit={() => setEditing(true)} />}
      {editing && <section key={channel} aria-label="编辑支付配置">
        {channel === 'wechat' && wechat.state.kind === 'ready' && <PaymentConfigEditor key={wechat.state.data.version} api={api} config={wechat.state.data} onSaved={saved} onCancel={() => setEditing(false)} />}
        {channel === 'alipay' && alipay.state.kind === 'ready' && <AlipayConfigEditor key={alipay.state.data.version} api={api} config={alipay.state.data} onSaved={saved} onCancel={() => setEditing(false)} />}
        {channel === 'zpay' && zpay.state.kind === 'ready' && <ZpayConfigEditor key={zpay.state.data.version} api={api} config={zpay.state.data} onSaved={saved} onCancel={() => setEditing(false)} />}
      </section>}
    </>}
  </section>
}
