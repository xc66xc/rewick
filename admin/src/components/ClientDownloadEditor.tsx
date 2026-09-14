import { useEffect, useRef, useState } from 'react'
import { type ApiClient, message } from '../api'
import { type ClientDownload, downloadSchema, downloadNames, fileSize, uploadSchema } from '../downloads'
import { dateTime } from '../types'
import styles from '../styles.module.css'

export default function ClientDownloadEditor({ api, initial }: { api: ApiClient; initial: ClientDownload }) {
  const [draft, setDraft] = useState(initial)
  const [uploadId, setUploadId] = useState<string>()
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function upload(file: File) {
    if (busy) return
    if (file.size === 0 || file.size > 500 * 1024 * 1024) { setError('安装包必须大于 0 字节，且不超过 500 MB。'); return }
    const request = new AbortController(); controller.current = request
    setBusy('upload'); setProgress(0); setError(''); setNotice('')
    try {
      const result = await api.upload(`/admin/client-downloads/${draft.id}/upload`, file, uploadSchema, setProgress, request.signal)
      if (request.signal.aborted) return
      setUploadId(result.uploadId); setDraft(current => ({ ...current, filename: result.filename, fileSize: result.fileSize, sha256: result.sha256 }))
      setNotice('上传完成，点击保存后生效。')
    } catch (reason) { if (!request.signal.aborted) setError(message(reason)) }
    finally { if (!request.signal.aborted) setBusy(null) }
  }
  async function save() {
    if (busy) return
    const request = new AbortController(); controller.current = request
    setBusy('save'); setError(''); setNotice('')
    try {
      const result = await api.request(`/admin/client-downloads/${draft.id}`, downloadSchema, { method: 'PUT', signal: request.signal, body: { version: draft.version.trim(), minimumOsVersion: draft.minimumOsVersion.trim(), releaseNotes: draft.releaseNotes, enabled: draft.enabled, ...(uploadId ? { uploadId } : {}) } })
      if (!request.signal.aborted) { setDraft(result); setUploadId(undefined); setNotice('已保存，落地页将使用当前配置。') }
    } catch (reason) { if (!request.signal.aborted) setError(message(reason)) }
    finally { if (!request.signal.aborted) setBusy(null) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }} aria-label={downloadNames[draft.id]}>
    <fieldset disabled={busy !== null}><legend>{downloadNames[draft.id]}</legend>
      <div className={styles.twoColumns}>
        <label className={styles.field}>版本号<input value={draft.version} maxLength={64} required={draft.enabled} onChange={event => setDraft({ ...draft, version: event.target.value })} /></label>
        <label className={styles.field}>最低系统版本<input value={draft.minimumOsVersion} maxLength={100} required={draft.enabled} onChange={event => setDraft({ ...draft, minimumOsVersion: event.target.value })} /></label>
      </div>
      <label className={styles.field}>安装包（最大 500 MB）<input type="file" accept={draft.platform === 'macos' ? '.dmg' : '.exe'} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} /></label>
      <p>{draft.filename ? `${draft.filename} · ${fileSize(draft.fileSize)}` : '尚未上传安装包'}{uploadId ? ' · 待保存' : ''}</p>
      <label className={styles.field}>更新说明<textarea value={draft.releaseNotes} maxLength={4000} rows={3} onChange={event => setDraft({ ...draft, releaseNotes: event.target.value })} /></label>
      <label><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />启用下载</label>
      <p>保存新安装包后删除旧包，仅保留最新版本。更新时间：{dateTime(draft.updatedAt)}</p>
      <button className={styles.primaryButton}>保存</button>
    </fieldset>
    {busy === 'upload' && <div role="status"><progress aria-label="安装包上传进度" value={progress} max={100} />{progress}%{progress === 100 ? '，服务器正在校验文件…' : ''}</div>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
  </form>
}
