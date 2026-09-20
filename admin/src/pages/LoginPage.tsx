import { useState } from 'react'
import { ShieldCheck } from '@phosphor-icons/react'
import styles from '../styles.module.css'
interface LoginPageProps { busy: boolean; error: string; onLogin: (identifier: string, password: string) => Promise<void> }
export default function LoginPage({ busy, error, onLogin }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  async function submit() { try { await onLogin(identifier.trim(), password) } finally { setPassword('') } }
  return <main className={styles.login}><section className={styles.loginIntro}><div className={styles.brand}><span className={styles.brandMark}>R</span><span>掌灯 Rewick</span></div><div><p className={styles.eyebrow}>PLATFORM CONSOLE</p><h1>把平台服务，<br />管理得井井有条。</h1><p className={styles.lead}>用户、开放模型和服务连接，<br />在一个清楚的工作台里统一管理。</p></div><p className={styles.loginFoot}>平台管理 · 管理员专用</p></section>
    <section className={styles.loginPanel}><div className={styles.loginCard}><ShieldCheck size={32} weight="duotone" /><h2>登录管理后台</h2><p className={styles.hint}>使用已配置的管理员账号。登录状态仅保存在当前页面，刷新后需重新登录。</p><form onSubmit={event => { event.preventDefault(); void submit() }}><fieldset className={styles.formStack} disabled={busy}>
      <label className={styles.field}>管理员账号<input autoComplete="username" autoFocus required maxLength={64} value={identifier} onChange={event => setIdentifier(event.target.value)} /></label><label className={styles.field}>登录密码<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}<button type="submit" className={styles.primaryButton}>{busy ? '验证中…' : '登录管理后台'}</button>
    </fieldset></form><p className={styles.hint}>只有 ADMIN 角色可访问管理功能。</p></div></section>
  </main>
}
