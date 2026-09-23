import { EnvelopeSimple, LockKey, PlugsConnected } from '@phosphor-icons/react'
import type { EmailConfig } from '../types'
import styles from '../styles.module.css'
import layout from '../pages/EmailConfigPage.module.css'
interface Props { config: EmailConfig; busy: boolean; onTest: () => void }
export default function EmailConfigOverview({ config, busy, onTest }: Props) {
  const connection = [['SMTP 主机', config.host || '未配置'], ['端口', String(config.port)], ['连接方式', config.ssl ? 'SSL/TLS' : config.startTls ? 'STARTTLS' : '明文连接'], ['认证账号', config.username || '无需认证']]
  return <>
    <section className={layout.statusCard} aria-label="邮件服务状态"><span className={layout.icon}><EnvelopeSimple size={30} /></span><div className={layout.statusText}><h3>注册邮件服务</h3><p>用于发送注册验证码</p></div><span className={config.enabled ? styles.enabledBadge : styles.mutedBadge}>{config.enabled ? '已启用' : '未启用'}</span></section>
    <div className={layout.grid}>
      <section className={layout.panel} aria-label="连接配置"><h3>连接配置</h3><p className={layout.caption}>邮件服务器的连接信息</p><dl className={layout.facts}>{connection.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>授权凭据</dt><dd className={layout.credential}><LockKey size={18} />{!config.username ? '无需认证' : config.hasPassword ? '已配置' : '未配置'}</dd></div></dl></section>
      <section className={layout.panel} aria-label="发件身份"><h3>发件身份</h3><p className={layout.caption}>收件人看到的发件邮箱</p><dl className={layout.facts}><div><dt>发件邮箱</dt><dd>{config.from || '未配置'}</dd></div><div><dt>配置版本</dt><dd>{config.version}</dd></div></dl><div className={layout.mailPreview}><EnvelopeSimple size={32} /><div><strong>注册验证码</strong><p>{config.from || '请先配置发件邮箱'}</p></div></div></section>
    </div>
    <section className={layout.panel} aria-label="测试邮件连接"><h3>测试连接</h3><p className={layout.caption}>验证邮件服务器的连接与认证状态</p><div className={layout.testRow}><PlugsConnected size={25} /><div><strong>测试当前已保存配置</strong><p>不会发送邮件，也不会修改配置。</p></div><button type="button" className={styles.primaryButton} disabled={busy} onClick={onTest}>{busy ? '测试中…' : '测试连接'}</button></div></section>
  </>
}
