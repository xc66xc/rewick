import { Microphone, Monitor, Play, Stop } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import AutoAnswerControls from './AutoAnswerControls'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'

interface RecordingControlsProps { session: SessionController }
/* v30 panel-controls:来源切换 + 录音按钮合成一行;状态/电平/计时已上移面板头 */
export default function RecordingControls({ session }: RecordingControlsProps) {
  const active = ['connecting', 'listening', 'stopping'].includes(session.status)
  return <section className="shrink-0" aria-label="音频控制">
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2">
      <Segmented aria-label="音频来源" value={session.source} disabled={session.switchingSource || session.status === 'connecting' || session.status === 'stopping'} onValueChange={value => void session.setSource(value as SessionController['source'])}
        options={[{ value: 'system', label: '系统音频', icon: <Monitor aria-hidden="true" /> }, { value: 'microphone', label: '麦克风', icon: <Microphone aria-hidden="true" /> }]} />
      {active
        ? <Button size="xs" className="border-danger-line bg-danger-subtle text-danger hover:border-danger-line hover:bg-danger-subtle hover:text-danger" disabled={!session.desktop || session.status === 'stopping'}
          onClick={() => void session.stop()}><Stop aria-hidden="true" />停止转写</Button>
        : <Button variant="primary" size="xs" disabled={!session.desktop || session.status === 'stopping'}
          onClick={() => void session.start()}><Play aria-hidden="true" />开始转写</Button>}
    </div>
    <AutoAnswerControls session={session} />
  </section>
}
