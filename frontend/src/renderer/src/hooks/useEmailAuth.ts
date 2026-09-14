import { useEffect, useRef, useState } from 'react'
import { platformBaseUrl } from '../../../shared/defaults'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from './useSettings'

interface EmailAuthOptions {
  settings: Settings; bridge: DesktopBridge | undefined; checking: boolean
  onSave: (input: SettingsInput) => Promise<Settings>; onAuthenticated: (settings: Settings) => void
}
export function useEmailAuth({ settings, bridge, checking, onSave, onAuthenticated }: EmailAuthOptions) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
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
  useEffect(() => {
    if (!bridge) return
    let active = true
    void bridge.getRememberedLogin().then(value => {
      if (!active || !value) return
      setEmail(value.identifier); setPassword(value.password); setRememberMe(true)
    }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge])
  async function perform(action: 'code' | 'submit') {
    if (!bridge || inFlight.current || checking) return
    if (action === 'code' && !emailInput.current?.reportValidity()) return
    if (mode === 'reset') {
      if (password.length < 12 || new TextEncoder().encode(password).length > 72) { setError('新密码至少 12 个字符，最多 72 个 UTF-8 字节。'); return }
      if (password !== confirmation) { setError('两次输入的密码不一致。'); return }
    }
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await onSave({ ...settingsInput(settings), platform: { enabled: true, baseUrl: settings.platform?.baseUrl ?? platformBaseUrl } })
      if (action === 'code') {
        const result = mode === 'reset' ? await bridge.requestPasswordResetCode({ email: email.trim() })
          : await bridge.requestEmailCode({ email: email.trim() })
        setRetryAt(Date.now() + result.retryAfterSeconds * 1000)
        setNotice(`验证码已发送，${Math.ceil(result.expiresInSeconds / 60)} 分钟内有效。`)
      } else if (mode === 'reset') {
        await bridge.resetPassword({ email: email.trim(), password, code: code.trim() })
        changeMode('login')
        setNotice('密码修改成功，请使用新密码登录。')
      } else {
        const value = mode === 'login' ? await bridge.platformLogin({ identifier: email.trim(), password, rememberMe })
          : await bridge.platformRegister({ email: email.trim(), password, code: code.trim(), ...(invitationCode.trim() ? { invitationCode: invitationCode.trim().toUpperCase() } : {}) })
        setPassword(''); setCode(''); onAuthenticated(value)
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function changeMode(value: 'login' | 'register' | 'reset') {
    setMode(value); setError(''); setNotice(''); setPassword(''); setConfirmation(''); setCode(''); setRetryAt(0)
    emailInput.current?.focus()
  }
  return { invitationCode, setInvitationCode, rememberMe, setRememberMe, mode, email, setEmail, password, setPassword, confirmation, setConfirmation, code, setCode, busy, error, notice, remaining, emailInput, perform, changeMode }
}
