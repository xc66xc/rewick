import { formatDuration } from '../../hooks/useInterviewTime'
import { useEffect, useState } from 'react'
import { Gift } from '@phosphor-icons/react'
import type { DesktopBridge } from '../../../../shared/types'
import type { InvitationSummary } from '../../../../shared/invitation'
import { Button } from '../ui/button'
import { Modal } from '../ui/dialog'
import { TextField } from '../ui/field'
import { toast } from '../ui/toast'

export default function InviteFriendsButton({ bridge }: { bridge?: DesktopBridge }) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<InvitationSummary>()
  useEffect(() => {
    let active = true
    void bridge?.invitationSettings().then(settings => { if (active) setEnabled(settings.enabled) }).catch(() => {})
    return () => { active = false }
  }, [bridge])
  async function show() {
    if (!bridge || busy) return
    setBusy(true)
    try { setSummary(await bridge.invitationCreateCode()); setOpen(true) }
    catch { toast.show('暂时无法加载邀请信息，请稍后重试。', { type: 'error' }) }
    finally { setBusy(false) }
  }
  if (!enabled) return null
  return <>
    <Button disabled={busy} onClick={() => void show()}><Gift />邀请好友</Button>
    <Modal open={open} onOpenChange={setOpen} title="邀请好友">
      {summary && <div className="flex flex-col gap-4 text-text-secondary">
        <p>好友使用你的邀请码完成邮箱注册后，你将获得 {formatDuration(summary.rewardSeconds)}面试时长，长期有效。</p>
        <TextField label="我的邀请码" value={summary.code} readOnly />
        <Button onClick={() => void navigator.clipboard.writeText(summary.code).then(() => toast.show('邀请码已复制', { type: 'success' })).catch(() => toast.show('复制失败，请手动复制邀请码。', { type: 'error' }))}>复制邀请码</Button>
        <p>成功邀请 {summary.invitedCount} 人 · 累计获得 {formatDuration(summary.rewardedSeconds)}</p>
        <p>仅奖励直接邀请的新用户，奖励以好友注册时的规则为准。</p>
      </div>}
    </Modal>
  </>
}
