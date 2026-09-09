import { emailPasswordRequired, type EmailConfig } from '../types'
import styles from '../styles.module.css'

interface EmailConfigEditorProps { config: EmailConfig; saved: EmailConfig | null; disabled: boolean; onChange: (config: EmailConfig) => void }
export default function EmailConfigEditor({ config, saved, disabled, onChange }: EmailConfigEditorProps) {
  const needsPassword = emailPasswordRequired(config, saved)
  return <div className={styles.configStack}>
    <fieldset className={styles.editorCard} disabled={disabled}><legend>SMTP 连接</legend>
      <label className={styles.check}><input type="checkbox" checked={config.enabled} onChange={event => onChange({ ...config, enabled: event.target.checked })} />启用邮件服务</label>
      <p className={styles.hint}>用于发送注册验证码。关闭后，用户将无法申请新的验证码。</p>
      <div className={styles.twoColumns}>
        <label className={styles.field}>SMTP 主机<input value={config.host} required={config.enabled} maxLength={253} placeholder="smtp.example.com" autoComplete="off" onChange={event => onChange({ ...config, host: event.target.value })} /></label>
        <label className={styles.field}>端口<input type="number" value={config.port || ''} required min={1} max={65535} step={1} onChange={event => onChange({ ...config, port: event.target.valueAsNumber || 0 })} /></label>
        <label className={styles.field}>SMTP 用户名<input value={config.username} maxLength={254} autoComplete="off" aria-describedby="email-auth-hint" onChange={event => onChange({ ...config, username: event.target.value, password: event.target.value.trim() ? config.password : undefined })} /></label>
        <label className={styles.field}><span>SMTP 密码{saved?.hasPassword && <small className={styles.badge}>已保存</small>}</span><input type="password" value={config.password ?? ''} required={needsPassword} disabled={!config.username.trim()} maxLength={4096} autoComplete="new-password" aria-describedby="email-password-hint" placeholder={saved?.hasPassword ? '留空保留已保存密码' : '填写 SMTP 密码'} onChange={event => onChange({ ...config, password: event.target.value })} /></label>
        <label className={styles.field}>发件邮箱<input type="email" value={config.from} required={config.enabled} maxLength={254} placeholder="noreply@example.com" autoComplete="off" onChange={event => onChange({ ...config, from: event.target.value })} /></label>
      </div>
      <p className={styles.hint} id="email-auth-hint">用户名留空表示无需认证，保存时会清除原有密码。</p>
      <p className={needsPassword ? styles.warning : styles.hint} id="email-password-hint">{needsPassword ? '请填写密码。更换主机、端口或用户名后，须重新填写密码。' : '密码只保留在当前草稿内存；保存成功或离开此页后清除。'}</p>
    </fieldset>
    <fieldset className={styles.editorCard} disabled={disabled}><legend>连接安全</legend>
      <div className={styles.actions}>
        <label className={styles.check}><input type="checkbox" checked={config.startTls} onChange={event => onChange({ ...config, startTls: event.target.checked, ssl: event.target.checked ? false : config.ssl })} />使用 STARTTLS</label>
        <label className={styles.check}><input type="checkbox" checked={config.ssl} onChange={event => onChange({ ...config, ssl: event.target.checked, startTls: event.target.checked ? false : config.startTls })} />使用 SSL/TLS</label>
      </div>
      <p className={styles.hint}>两种方式只能选择一种，请按邮件服务商说明设置。远程邮件服务器必须使用加密连接；本机测试服务器可使用明文连接。</p>
    </fieldset>
  </div>
}
