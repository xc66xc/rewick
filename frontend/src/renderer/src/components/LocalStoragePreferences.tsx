import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, LocalStorageStatus } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { Button } from './ui/button'
import { ConfirmModal } from './ui/dialog'
import { inlineErrorClass } from '../lib/form'

interface Props { bridge?: DesktopBridge; disabled?: boolean }
export default function LocalStoragePreferences({ bridge, disabled = false }: Props) {
  const [status, setStatus] = useState<LocalStorageStatus>()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    const refresh = () => { void bridge?.getLocalStorageStatus?.().then(value => { if (active) setStatus(value) }).catch(reason => { if (active) setError(errorMessage(reason)) }) }
    refresh()
    const unsubscribe = bridge?.onEvent?.(event => { if (event.kind === 'settings-changed') refresh() })
    return () => { active = false; unsubscribe?.() }
  }, [bridge])
  if (!bridge?.getLocalStorageStatus) return null
  async function migrate() {
    if (!bridge?.migrateLocalStorage || inFlight.current || disabled) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await bridge.migrateLocalStorage()
      setStatus(await bridge.getLocalStorageStatus?.())
      setNotice(`已迁移 ${result.settings} 份本机配置、${result.drafts} 份待同步草稿，旧文件仍然保留。`)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="mt-5 border-t border-border pt-4" aria-label="本机数据">
    <h3 className="mb-2 text-xs font-semibold">本机数据</h3>
    <p className="text-xs leading-relaxed text-text-secondary">当前使用本机密钥加密，日常启动无需钥匙串授权。备份时请同时保留密钥与加密数据。</p>
    {status?.available && <>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">旧版凭据和待同步草稿已保留。可以尝试迁移；如果旧钥匙串无法解锁，也可以直接重新登录、重新填写自定义密钥。</p>
      {status.reason && <p className="mt-2 text-xs text-text-muted">{status.reason}</p>}
      <Button size="sm" className="mt-3" disabled={disabled || busy || !status.canImport || !bridge.migrateLocalStorage} onClick={() => setConfirm(true)}>{busy ? '正在迁移…' : '尝试迁移旧本机数据'}</Button>
    </>}
    {error && <p className={inlineErrorClass} role="alert">{error}</p>}
    {notice && <p className="mt-2 text-xs text-success" role="status">{notice}</p>}
    <ConfirmModal open={confirm} onOpenChange={setConfirm} title="迁移旧本机数据" description="这一步会尝试访问旧版钥匙串，可能再次要求系统授权。成功后改用本机密钥加密；旧文件保留，当前已有的新凭据或草稿不会被覆盖。" confirmText="尝试迁移" onConfirm={() => { setConfirm(false); void migrate() }} />
  </section>
}
