import { useEffect, useRef, useState } from 'react'
import type { InterviewEnvironment } from '../../../../shared/types'
import type { MockCapabilities, MockCreate } from '../../../../shared/mock-interview'
import { AppSelect } from '../../components/ui/select'
import { Button } from '../../components/ui/button'
import { AudioCapture } from '../../audio/capture'
import { toast } from '../../components/ui/toast'
interface Props { environments: InterviewEnvironment[]; capabilities: MockCapabilities; busy: boolean; balance: number; onCreate: (input: MockCreate) => void }
export default function MockPreparation({ environments, capabilities, busy, balance, onCreate }: Props) {
  const captureRef = useRef<AudioCapture | null>(null)
  const testAudio = useRef<AudioContext | null>(null)
  useEffect(() => () => { void captureRef.current?.stop(); void testAudio.current?.close() }, []) // Release preflight resources even if navigation occurs during permission prompt.
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  const [duration, setDuration] = useState('15')
  const [difficulty, setDifficulty] = useState('standard')
  const [voice, setVoice] = useState(capabilities.voices[0]?.id ?? '')
  const [testing, setTesting] = useState(false)
  const [deviceReady, setDeviceReady] = useState(false)
  async function testDevice() {
    setTesting(true); const capture = new AudioCapture(); captureRef.current = capture
    try {
      await capture.start('microphone', () => undefined, () => undefined, () => { setDeviceReady(false) })
      await capture.stop()
      const audio = new AudioContext(); testAudio.current = audio; const oscillator = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = 0.06
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 440
      oscillator.start(); oscillator.stop(audio.currentTime + 0.25); oscillator.onended = () => { void audio.close() }
      setDeviceReady(true); toast.show('麦克风可用。请确认听到了扬声器测试音。')
    } catch (error) { toast.show(error instanceof Error ? error.message : '设备检查失败。', { type: 'error' }) }
    finally { await capture.stop(); setTesting(false) }
  }
  return <section className="space-y-5 rounded-card border border-border bg-card p-6"><h2 className="text-lg font-semibold">准备一场模拟面试</h2>
    <p className="text-sm text-text-secondary">复用环境中的简历、岗位和参考资料。仅采集麦克风，不录制原始音频；模拟时长余额独立。</p>
    <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
      <label className="space-y-2 text-sm">面试环境<AppSelect aria-label="面试环境" value={environmentId} options={environments.map(value => ({ value: value.id, label: value.name }))} onValueChange={setEnvironmentId} placeholder="先在准备面试中创建环境" /></label>
      <label className="space-y-2 text-sm">计划时长<AppSelect aria-label="计划时长" value={duration} options={capabilities.durations.map(value => ({ value: String(value), label: `${value} 分钟` }))} onValueChange={setDuration} /></label>
      <label className="space-y-2 text-sm">难度<AppSelect aria-label="难度" value={difficulty} options={[{ value: 'standard', label: '标准' }, { value: 'deep', label: '深入' }]} onValueChange={setDifficulty} /></label>
      <label className="space-y-2 text-sm">面试官声音<AppSelect aria-label="面试官声音" value={voice} options={capabilities.voices.map(value => ({ value: value.id, label: value.name }))} onValueChange={setVoice} /></label>
    </div>
    <div className="flex flex-wrap gap-3"><Button disabled={testing || busy} onClick={() => void testDevice()}>{testing ? '检查中…' : deviceReady ? '重新检查设备' : '检查麦克风与扬声器'}</Button>
      <Button variant="primary" disabled={busy || testing || !deviceReady || !environmentId || !voice || balance <= 0 || !capabilities.enabled} onClick={() => onCreate({ requestId: crypto.randomUUID(), environmentId, durationMinutes: Number(duration) as 15 | 30 | 45, difficulty: difficulty as 'standard' | 'deep', avatarId: 'rewick-interviewer', voiceId: voice })}>{busy ? '生成考察提纲…' : '准备面试'}</Button></div>
    {balance <= 0 && <p className="text-sm text-text-secondary">暂无模拟时长，请联系管理员发放。辅助面试余额不能抵扣。</p>}
  </section>
}
