import InvitationField from './invitation/InvitationField'
import { CheckRow } from './ui/check-row'
import { Eyebrow } from './ui/pill'
import { Button, LinkButton } from './ui/button'
import { TextField } from './ui/field'
import { Waveform } from '@phosphor-icons/react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import { useEmailAuth } from '../hooks/useEmailAuth'
import { cn } from '../lib/cn'

/* v30 登录页(2026-09-20 换皮):顶栏品牌块与 Topbar 同构(mac 红绿灯让位 pl-90,Windows WCO 悬浮右上无内容遮挡),
   卡片/输入/按钮全部走 tokens.css 语义类。旧 Account.module.css / App.module.css / global.css 随之删除。 */
const isMacOS = navigator.userAgent.includes('Macintosh')

interface LoginScreenProps {
  settings: Settings; bridge: DesktopBridge | undefined; checking: boolean; error: string
  onSave: (input: SettingsInput) => Promise<Settings>; onAuthenticated: (settings: Settings) => void; onRetry: () => void
}
export default function LoginScreen({ settings, bridge, checking, error: externalError, onSave, onAuthenticated, onRetry }: LoginScreenProps) {
  const { invitationCode, setInvitationCode, rememberMe, setRememberMe, mode, email, setEmail, password, setPassword, confirmation, setConfirmation, code, setCode, busy, error, notice, remaining, emailInput, perform, changeMode } = useEmailAuth({ settings, bridge, checking, onSave, onAuthenticated })
  return <main className="flex min-h-dvh flex-col bg-canvas">
    <div className={cn('flex h-[50px] shrink-0 items-center gap-2.5 bg-page pl-4 select-none [-webkit-app-region:drag]', isMacOS && 'pl-[90px]')} aria-label="掌灯 Rewick">
      <span className="brand-gradient grid size-6 shrink-0 place-items-center rounded-control text-text-on-fill"><Waveform size={16} aria-hidden="true" /></span>
      <strong className="text-[14px] font-semibold tracking-[-0.01em] text-text-primary">掌灯 Rewick</strong>
    </div>
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <section className="w-full max-w-[420px] rounded-card border border-border bg-card p-8 shadow-card [@media(max-height:700px)]:p-5" aria-labelledby="login-title" aria-busy={busy || checking}>
        <Eyebrow>为下一句，准备好思路</Eyebrow>
        <h1 id="login-title" className="mb-2 text-[22px] leading-[1.3] font-semibold tracking-[-0.02em] text-text-heading">{mode === 'reset' ? '找回密码' : '登录面试工作台'}</h1>
        <p className="mb-6 text-xs leading-relaxed text-text-secondary">登录账号后，使用平台模型或连接你自己的服务。</p>
        {mode !== 'reset' && <div className="mb-6 flex gap-0.5 rounded-chip border border-border bg-subtle p-0.5" role="tablist" aria-label="账号操作">
          {(['login', 'register'] as const).map(value => <button key={value} id={`auth-${value}`} type="button" role="tab" aria-selected={mode === value} aria-controls="auth-form" tabIndex={mode === value ? 0 : -1}
          disabled={busy || checking} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : value === 'login' ? 'register' : 'login'; changeMode(next); document.getElementById(`auth-${next}`)?.focus() } }}
          onClick={() => changeMode(value)}
          className={cn('flex-1 rounded-[4px] border border-transparent px-2 py-[5px] text-[11.5px] font-medium text-text-secondary transition-colors hover:text-text-primary', mode === value && 'border-accent-line bg-card font-semibold text-accent-text')}>{value === 'login' ? '邮箱登录' : '注册账号'}</button>)}
        </div>}
        <form id="auth-form" role={mode === 'reset' ? undefined : 'tabpanel'} aria-labelledby={mode === 'reset' ? 'login-title' : `auth-${mode}`} onSubmit={event => { event.preventDefault(); void perform('submit') }}>
          <fieldset className="min-w-0" disabled={busy || checking || !bridge}>
            <div className="flex flex-col gap-4">
              <TextField id="auth-email" label="邮箱" requiredMark={false} ref={emailInput} type="email" autoComplete="username" autoFocus required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
              <TextField id="auth-password" label={mode === 'reset' ? '新密码' : '密码'} requiredMark={false} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} maxLength={200} value={password} onChange={event => setPassword(event.target.value)} />
              {mode === 'reset' && <TextField id="auth-confirmation" label="确认密码" requiredMark={false} type="password" autoComplete="new-password" required maxLength={200} value={confirmation} onChange={event => setConfirmation(event.target.value)} />}
              {mode !== 'login' && <>
                <p className="text-[11px] leading-relaxed text-text-secondary">至少 12 个字符，最多 72 个 UTF-8 字节。</p>
                <div className="flex items-end gap-2">
                  <TextField id="email-code" label="邮箱验证码" requiredMark={false} className="min-w-0 flex-1" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} />
                  <Button type="button" className="shrink-0" disabled={remaining > 0 || !email.trim()} onClick={() => void perform('code')}>{remaining > 0 ? `${remaining} 秒后重发` : '发送验证码'}</Button>
                </div>
              </>}
              {mode === 'login' && <CheckRow label="记住我" checked={rememberMe} onChange={setRememberMe} disabled={busy || checking || !bridge} />}
              <Button variant="primary" className="w-full" type="submit">{busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'reset' ? '确认修改密码' : '注册并登录'}</Button>
              {mode === 'register' && bridge && <InvitationField bridge={bridge} value={invitationCode} onChange={setInvitationCode} />}
            </div>
          </fieldset>
        </form>
        <div className="mt-5 flex flex-col gap-3">
          <LinkButton type="button" className="self-start" disabled={busy || checking} onClick={() => changeMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? '返回登录' : '找回密码'}</LinkButton>
          {checking && <p className="text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]" role="status">正在验证登录状态…</p>}
          {!bridge && <p className="text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]" role="status">请打开桌面应用以登录和使用面试工作台。</p>}
          {notice && <p className="rounded-chip bg-success-subtle p-3 text-xs text-success [overflow-wrap:anywhere]" role="status">{notice}</p>}
          {(error || externalError) && <p className="rounded-chip bg-danger-subtle p-3 text-xs text-danger [overflow-wrap:anywhere]" role="alert">{error || externalError}</p>}
          {!checking && externalError && settings.platform?.authenticated && <LinkButton type="button" className="self-start" onClick={onRetry}>重新验证登录</LinkButton>}
        </div>
      </section>
    </div>
  </main>
}
