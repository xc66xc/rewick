import { useEffect, useRef, useState } from 'react'
import { environmentStampTextError, type EnvironmentStampColor } from '../../../shared/environment-stamp'
import type { DesktopBridge, InterviewEnvironment, InterviewLibrary } from '../../../shared/types'
import { toast } from '../components/ui/toast'
import { errorMessage } from './useSettings'
import useStampShortcuts from './useStampShortcuts'

export default function useEnvironmentStampEditor(bridge: DesktopBridge, accountScope: string | undefined, acceptLibrary: (library: InterviewLibrary) => void) {
  const shortcuts = useStampShortcuts(accountScope)
  const [target, setTarget] = useState<InterviewEnvironment | null>(null)
  const [text, setText] = useState('')
  const [color, setColor] = useState<EnvironmentStampColor>('blue')
  const [busy, setBusy] = useState(false)
  const scope = useRef(accountScope)
  scope.current = accountScope
  const epoch = useRef(0)
  useEffect(() => { epoch.current++; setTarget(null); setBusy(false); return () => { epoch.current++ } }, [accountScope])
  function open(environment: InterviewEnvironment) { setTarget(environment); setText(environment.stamp?.text ?? ''); setColor(environment.stamp?.color ?? 'blue') }
  function close() { if (!busy) setTarget(null) }
  async function save(clear = false) {
    if (!target || busy || (!clear && environmentStampTextError(text))) return
    if (!target.version) { toast.show('环境版本不可用，请刷新环境后重试。', { type: 'error' }); return }
    const actor = scope.current, revision = epoch.current
    setBusy(true)
    try {
      const library = await bridge.saveEnvironmentStamp({ id: target.id, version: target.version, stamp: clear ? null : { text: text.trim(), color } })
      if (actor !== scope.current || revision !== epoch.current) return
      acceptLibrary(library); setTarget(null)
      toast.show(clear ? '印章已清除' : '印章已保存', { type: 'success' })
    } catch (reason) { if (actor === scope.current && revision === epoch.current) toast.show(errorMessage(reason), { type: 'error' }) }
    finally { if (actor === scope.current && revision === epoch.current) setBusy(false) }
  }
  return { target, text, color, busy, shortcuts, validation: text ? environmentStampTextError(text) : undefined, open, close, setText, setColor, save }
}
