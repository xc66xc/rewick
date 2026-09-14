import { useEffect, useState } from 'react'
import type { DesktopBridge } from '../../../../shared/types'
import { TextField } from '../ui/field'

export default function InvitationField({ bridge, value, onChange }: { bridge: DesktopBridge; value: string; onChange: (value: string) => void }) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let active = true
    void bridge.invitationSettings().then(settings => {
      if (active) { setEnabled(settings.enabled); if (!settings.enabled) onChange('') }
    }).catch(() => { if (active) { setEnabled(false); onChange('') } })
    return () => { active = false }
  }, [bridge, onChange])
  if (!enabled) return null
  return <TextField label="邀请码（选填）" value={value} maxLength={6} autoCapitalize="characters" autoComplete="off" hint="填写好友的 6 位邀请码，注册成功后好友可获得面试时长。" onChange={event => onChange(event.target.value.toUpperCase())} />
}
