import { useState } from 'react'
import type { Settings, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface Credentials { username: string; password: string }
interface PlatformSettingsFieldsProps {
  draft: SettingsInput
  saved: Settings
  onChange: (draft: SettingsInput) => void
  actions: { login: (credentials: Credentials) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void> }
  disabled: boolean
  feedback?: { message: string; isError: boolean }
}

export default function PlatformSettingsFields({ draft, saved, onChange, actions, disabled, feedback }: PlatformSettingsFieldsProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const platform = draft.platform ?? { enabled: false, baseUrl: 'http://127.0.0.1:8080' }
  const account = saved.platform
  const sameServer = platform.baseUrl.replace(/\/+$/, '') === account?.baseUrl.replace(/\/+$/, '')
  const authenticated = sameServer && account?.authenticated

  async function handleLogin() {
    try { await actions.login({ username: username.trim(), password }) }
    finally { setPassword('') }
  }

  return <fieldset className={styles.settingsGroup} disabled={disabled}>
    <legend>平台服务<span>使用平台账号连接独立后端</span></legend>
    <label className={styles.referenceGlobalToggle}><input type="checkbox" checked={platform.enabled}
      onChange={event => onChange({ ...draft, platform: { ...platform, enabled: event.target.checked } })} />启用平台服务</label>
    <p className={styles.formNote}>未填写自带 Key 的转写、回答和远程知识库使用平台服务。已保存的自带 Key 继续优先使用，本地模型保持本机连接。</p>
    <fieldset className={styles.settingsFields} disabled={!platform.enabled}>
      <label className={styles.field}>平台服务地址<input type="url" value={platform.baseUrl} required={platform.enabled}
        placeholder="https://你的服务域名" onChange={event => onChange({ ...draft, platform: { ...platform, baseUrl: event.target.value } })} /></label>
      {authenticated ? <>
        <p className={styles.formNote} role="status">已登录：{account.user?.username}。回答{account.capabilities.llm ? `可用（${account.models.llm}）` : '未开通'}；转写{account.capabilities.asr ? '可用' : '未开通'}；知识库{account.capabilities.knowledge ? '可用' : '未开通'}。</p>
        <div className={styles.platformActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => void actions.refresh()}>刷新服务状态</button>
          <button className={styles.secondaryButton} type="button" onClick={() => void actions.logout()}>退出平台账号</button>
        </div>
      </> : <>
        <div className={styles.fieldRow}>
          <label className={styles.field}>平台账号<input autoComplete="username" value={username} maxLength={100} onChange={event => setUsername(event.target.value)} /></label>
          <label className={styles.field}>平台密码<input type="password" autoComplete="current-password" value={password} maxLength={200}
            onChange={event => setPassword(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); if (username.trim() && password) void handleLogin() }
            }} /></label>
        </div>
        <button className={styles.secondaryButton} type="button" disabled={!username.trim() || !password}
          onClick={() => void handleLogin()}>连接并登录平台</button>
      </>}
    </fieldset>
    {feedback && <p className={feedback.isError ? styles.inlineError : styles.successNotice} role={feedback.isError ? 'alert' : 'status'}>{feedback.message}</p>}
    <p className={styles.formNote}>登录密码不保存在本机。平台供应商 Key 由服务端管理；开启远程知识库后只进行远程检索，失败时仍继续生成回答。</p>
  </fieldset>
}
