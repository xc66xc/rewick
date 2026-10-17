import type { MockSettings } from '../../mock-interviews'
import styles from '../../styles.module.css'
interface Props { value: MockSettings; onChange: (value: MockSettings) => void }
export default function MockTtsFields({ value, onChange }: Props) {
  function update(patch: Partial<MockSettings['tts']>) { onChange({ ...value, tts: { ...value.tts, ...patch } }) }
  return <fieldset className={styles.editorCard}><legend>语音合成 TTS</legend><div className={styles.twoColumns}>
    <label className={styles.field}>TTS 完整接口地址<input type="url" required={value.enabled} maxLength={2000} value={value.tts.endpoint} placeholder="wss://服务商的完整语音合成地址" onChange={event => update({ endpoint: event.target.value })} /></label>
    <label className={styles.field}>TTS 模型<input required={value.enabled} maxLength={120} value={value.tts.model} onChange={event => update({ model: event.target.value })} /></label>
    <label className={styles.field}>TTS API Key<input type="password" autoComplete="new-password" maxLength={4096} value={value.tts.apiKey ?? ''} placeholder={value.tts.hasApiKey ? '已保存，留空保留' : '填写 API Key'} required={value.enabled && !value.tts.hasApiKey} onChange={event => update({ apiKey: event.target.value })} /></label>
    <label className={styles.field}>音色 ID<input required={value.enabled} maxLength={120} value={value.tts.voiceId} onChange={event => update({ voiceId: event.target.value })} /></label>
    <label className={styles.field}>输出采样率<input readOnly value="24000 Hz · 单声道 PCM16" /></label>
  </div><p className={styles.hint}>密钥加密保存在后端。测试会调用供应商合成固定短句，可能产生少量按量费用；不会播放用户资料。</p></fieldset>
}
