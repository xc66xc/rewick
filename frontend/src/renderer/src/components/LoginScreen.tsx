import { platformBaseUrl } from '../../../shared/defaults'
import { useEffect, useRef, useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import styles from '../styles/App.module.css'
import authStyles from '../styles/Account.module.css'

interface LoginScreenProps {
  settings: Settings; bridge: DesktopBridge | undefined; checking: boolean; error: string
  onSave: (input: SettingsInput) => Promise<Settings>; onAuthenticated: (settings: Settings) => void; onRetry: () => void
}
export default function LoginScreen({ settings, bridge, checking, error: externalError, onSave, onAuthenticated, onRetry }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const inFlight = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    update()
    if (!retryAt) return
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  async function perform(action: 'code' | 'submit') {
    if (!bridge || inFlight.current || checking) return
    if (action === 'code' && !emailInput.current?.reportValidity()) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await onSave({ ...settingsInput(settings), platform: { enabled: true, baseUrl: settings.platform?.baseUrl ?? platformBaseUrl } })
      if (action === 'code') {
        const result = await bridge.requestEmailCode({ email: email.trim() })
        setRetryAt(Date.now() + result.retryAfterSeconds * 1000)
        setNotice(`验证码已发送，${Math.ceil(result.expiresInSeconds / 60)} 分钟内有效。`)
      } else {
        const value = mode === 'login' ? await bridge.platformLogin({ identifier: email.trim(), password })
          : await bridge.platformRegister({ email: email.trim(), password, code: code.trim() })
        setPassword(''); setCode(''); onAuthenticated(value)
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main className={authStyles.screen}>
    <div className={authStyles.dragBar}>Interview Copilot</div>
    <section className={authStyles.card} aria-labelledby="login-title" aria-busy={busy || checking}>
      <Sparkle className={authStyles.mark} size={30} weight="bold" aria-hidden="true" />
      <span className={styles.eyebrow}>为下一句，准备好思路</span><h1 id="login-title">登录面试工作台</h1>
      <p className={authStyles.description}>登录账号后，使用平台模型或连接你自己的服务。</p>
      <div className={authStyles.tabs} role="tablist" aria-label="账号操作">
        {(['login', 'register'] as const).map(value => <button key={value} id={`auth-${value}`} type="button" role="tab" aria-selected={mode === value} aria-controls="auth-form" tabIndex={mode === value ? 0 : -1}
          disabled={busy || checking} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : value === 'login' ? 'register' : 'login'; setMode(next); document.getElementById(`auth-${next}`)?.focus() } }}
          onClick={() => { setMode(value); setError(''); setNotice(''); setPassword(''); setCode('') }}>{value === 'login' ? '邮箱登录' : '注册账号'}</button>)}
      </div>
      <form id="auth-form" role="tabpanel" aria-labelledby={`auth-${mode}`} onSubmit={event => { event.preventDefault(); void perform('submit') }}>
        <fieldset className={styles.settingsFields} disabled={busy || checking || !bridge}>
          <label className={styles.field}>邮箱<input ref={emailInput} type="email" autoComplete="username" autoFocus required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className={styles.field}>密码<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'register' && <><p className={styles.fieldHint}>至少 12 个字符，最多 72 个 UTF-8 字节。</p><div className={styles.field}><label htmlFor="email-code">邮箱验证码</label>
            <span className={authStyles.codeRow}><input id="email-code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} />
              <button type="button" className={styles.secondaryButton} disabled={remaining > 0 || !email.trim()} onClick={() => void perform('code')}>{remaining > 0 ? `${remaining} 秒后重发` : '发送验证码'}</button></span></div></>}
          <button className={`${styles.primaryButton} ${authStyles.submit}`} type="submit">{busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}</button>
        </fieldset>
      </form>
      {checking && <p className={styles.formNote} role="status">正在验证登录状态…</p>}
      {!bridge && <p className={styles.formNote} role="status">请打开桌面应用以登录和使用面试工作台。</p>}
      {notice && <p className={styles.successNotice} role="status">{notice}</p>}
      {(error || externalError) && <p className={styles.inlineError} role="alert">{error || externalError}</p>}
      {!checking && externalError && settings.platform?.authenticated && <button type="button" className={styles.textButton} onClick={onRetry}>重新验证登录</button>}
    </section>
  </main>
}
