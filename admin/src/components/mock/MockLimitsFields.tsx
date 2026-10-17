import type { MockSettings } from '../../mock-interviews'
import styles from '../../styles.module.css'
const fields = [
  ['maxConcurrent', '最大并发面试数', 1, 10], ['maxFollowUps', '每题追问上限', 0, 2], ['pauseMs', '回答结束停顿（毫秒）', 1000, 5000],
  ['maxTtsCharacters', '每场 TTS 字符预算', 1000, 50000], ['maxOutputTokens', '每轮模型最大输出 Token', 128, 4096], ['dailySessionLimit', '每用户每日场次上限', 1, 100]
] as const
interface Props { value: MockSettings; onChange: (value: MockSettings) => void }
export default function MockLimitsFields({ value, onChange }: Props) {
  return <fieldset className={styles.editorCard}><legend>资源与追问预算</legend><div className={styles.twoColumns}>{fields.map(([key, label, min, max]) => <label key={key} className={styles.field}>{label}<input type="number" required min={min} max={max} step={1} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.valueAsNumber || 0 })} /></label>)}</div><p className={styles.hint}>余额与辅助面试独立。准备、暂停及问答导出不扣时；当前阶段由管理员发放模拟时长，不售卖套餐。</p></fieldset>
}
