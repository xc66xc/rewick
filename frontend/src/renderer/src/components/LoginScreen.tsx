import InvitationField from './invitation/InvitationField'
import { CheckRow } from './ui/check-row'
import { Sparkle } from '@phosphor-icons/react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import { useEmailAuth } from '../hooks/useEmailAuth'
import styles from '../styles/App.module.css'
import authStyles from '../styles/Account.module.css'

interface LoginScreenProps {
  settings: Settings; bridge: DesktopBridge | undefined; checking: boolean; error: string
  onSave: (input: SettingsInput) => Promise<Settings>; onAuthenticated: (settings: Settings) => void; onRetry: () => void
}
export default function LoginScreen({ settings, bridge, checking, error: externalError, onSave, onAuthenticated, onRetry }: LoginScreenProps) {
  const { invitationCode, setInvitationCode, rememberMe, setRememberMe, mode, email, setEmail, password, setPassword, confirmation, setConfirmation, code, setCode, busy, error, notice, remaining, emailInput, perform, changeMode } = useEmailAuth({ settings, bridge, checking, onSave, onAuthenticated })
  return <main className={authStyles.screen}>
    <div className={authStyles.dragBar}>Interview Copilot</div>
    <section className={authStyles.card} aria-labelledby="login-title" aria-busy={busy || checking}>
      <Sparkle className={authStyles.mark} size={30} weight="bold" aria-hidden="true" />
      <span className={styles.eyebrow}>为下一句，准备好思路</span><h1 id="login-title">{mode === 'reset' ? '找回密码' : '登录面试工作台'}</h1>
      <p className={authStyles.description}>登录账号后，使用平台模型或连接你自己的服务。</p>
      {mode !== 'reset' && <div className={authStyles.tabs} role="tablist" aria-label="账号操作">
        {(['login', 'register'] as const).map(value => <button key={value} id={`auth-${value}`} type="button" role="tab" aria-selected={mode === value} aria-controls="auth-form" tabIndex={mode === value ? 0 : -1}
          disabled={busy || checking} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : value === 'login' ? 'register' : 'login'; changeMode(next); document.getElementById(`auth-${next}`)?.focus() } }}
          onClick={() => changeMode(value)}>{value === 'login' ? '邮箱登录' : '注册账号'}</button>)}
      </div>}
      <form id="auth-form" role={mode === 'reset' ? undefined : 'tabpanel'} aria-labelledby={mode === 'reset' ? 'login-title' : `auth-${mode}`} onSubmit={event => { event.preventDefault(); void perform('submit') }}>
        <fieldset className={styles.settingsFields} disabled={busy || checking || !bridge}>
          <label className={styles.field}>邮箱<input ref={emailInput} type="email" autoComplete="username" autoFocus required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className={styles.field}>{mode === 'reset' ? '新密码' : '密码'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'reset' && <label className={styles.field}>确认密码<input type="password" autoComplete="new-password" required maxLength={200} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
          {mode !== 'login' && <><p className={styles.fieldHint}>至少 12 个字符，最多 72 个 UTF-8 字节。</p><div className={styles.field}><label htmlFor="email-code">邮箱验证码</label>
            <span className={authStyles.codeRow}><input id="email-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} />
              <button type="button" className={styles.secondaryButton} disabled={remaining > 0 || !email.trim()} onClick={() => void perform('code')}>{remaining > 0 ? `${remaining} 秒后重发` : '发送验证码'}</button></span></div></>}
          {mode === 'login' && <CheckRow label="记住我" checked={rememberMe} onChange={setRememberMe} disabled={busy || checking || !bridge} />}
          <button className={`${styles.primaryButton} ${authStyles.submit}`} type="submit">{busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'reset' ? '确认修改密码' : '注册并登录'}</button>
        {mode === 'register' && bridge && <InvitationField bridge={bridge} value={invitationCode} onChange={setInvitationCode} />}
        </fieldset>
      </form>
      <button type="button" className={styles.textButton} disabled={busy || checking} onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? '返回登录' : '找回密码'}</button>
      {checking && <p className={styles.formNote} role="status">正在验证登录状态…</p>}
      {!bridge && <p className={styles.formNote} role="status">请打开桌面应用以登录和使用面试工作台。</p>}
      {notice && <p className={styles.successNotice} role="status">{notice}</p>}
      {(error || externalError) && <p className={styles.inlineError} role="alert">{error || externalError}</p>}
      {!checking && externalError && settings.platform?.authenticated && <button type="button" className={styles.textButton} onClick={onRetry}>重新验证登录</button>}
    </section>
  </main>
}
