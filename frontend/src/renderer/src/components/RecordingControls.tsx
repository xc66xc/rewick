import { Microphone, Monitor, Play, Stop, Waveform } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { formatTime } from '../hooks/sessionHelpers'
import AutoAnswerControls from './AutoAnswerControls'
import styles from '../styles/App.module.css'

interface RecordingControlsProps { session: SessionController }
const statusLabels = { idle: '尚未开始', connecting: '正在连接', listening: '正在转写', stopping: '正在结束', error: '连接已中断' }
const meterBars = Array.from({ length: 18 }, (_, index) => index)
export default function RecordingControls({ session }: RecordingControlsProps) {
  const active = ['connecting', 'listening', 'stopping'].includes(session.status)
  return <section className={styles.recordingControls} aria-label="音频控制">
    <div className={styles.recordingHeader}><div className={styles.recordingLabel}><span className={`${styles.statusDot} ${session.status === 'listening' ? styles.statusDotLive : ''}`} />
      <span role="status">{statusLabels[session.status]}</span></div><span className={styles.timer}>{formatTime(session.elapsed)}</span></div>
    <div className={styles.audioSource} role="group" aria-label="音频来源">
      <button className={`${styles.sourceButton} ${session.source === 'system' ? styles.sourceButtonActive : ''}`} disabled={active}
        aria-pressed={session.source === 'system'} onClick={() => session.setSource('system')}><Monitor size={16} weight="bold" />系统音频</button>
      <button className={`${styles.sourceButton} ${session.source === 'microphone' ? styles.sourceButtonActive : ''}`} disabled={active}
        aria-pressed={session.source === 'microphone'} onClick={() => session.setSource('microphone')}><Microphone size={16} weight="bold" />麦克风</button>
    </div>
    <div className={styles.recordingBottom}>
      <div className={styles.levelMeter} role="meter" aria-label="输入音量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(session.level * 100)}>
        <Waveform size={17} weight="bold" />{meterBars.map(index => <span key={index} className={`${styles.meterBar} ${session.level * 18 > index ? styles.meterBarActive : ''}`} />)}
      </div>
      <button className={active ? styles.stopRecordingButton : styles.primaryButton} disabled={!session.desktop || session.status === 'stopping'}
        onClick={() => void (active ? session.stop() : session.start())}>{active ? <Stop size={14} weight="fill" /> : <Play size={14} weight="fill" />}{active ? '停止转写' : '开始转写'}</button>
    </div>
    <AutoAnswerControls session={session} />
  </section>
}
