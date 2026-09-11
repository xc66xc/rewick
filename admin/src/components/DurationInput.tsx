import styles from '../styles.module.css'

interface DurationInputProps { value: number; onChange: (seconds: number) => void; label?: string }
export default function DurationInput({ value, onChange, label = '时长' }: DurationInputProps) {
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value % 3600 / 60)
  const seconds = value % 60
  return <fieldset><legend>{label}</legend><div className={styles.twoColumns}>
    <label className={styles.field}>小时<input type="number" required min={0} max={87600} step={1} value={hours} onChange={event => onChange(Number(event.target.value) * 3600 + minutes * 60 + seconds)} /></label>
    <label className={styles.field}>分钟<input type="number" required min={0} max={59} step={1} value={minutes} onChange={event => onChange(hours * 3600 + Number(event.target.value) * 60 + seconds)} /></label>
    <label className={styles.field}>秒<input type="number" required min={0} max={59} step={1} value={seconds} onChange={event => onChange(hours * 3600 + minutes * 60 + Number(event.target.value))} /></label>
  </div></fieldset>
}
