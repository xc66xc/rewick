import type { ServiceForm } from '../hooks/unified-service'
import styles from '../styles.module.css'
interface Props { value: ServiceForm; disabled: boolean; onChange: (value: ServiceForm) => void }
export default function WebSearchFields({ value, disabled, onChange }: Props) {
  return <fieldset disabled={disabled} className={styles.editorCard}><legend>Tavily 搜索参数</legend>
    <div className={styles.twoColumns}><label className={styles.field}>保留网页数量（topK）<input type="number" required min={1} max={20} step={1} value={value.topK} onChange={event => onChange({ ...value, topK: Number(event.target.value) })} /></label>
      <label className={styles.field}>搜索深度<select value={value.searchDepth} onChange={event => onChange({ ...value, searchDepth: event.target.value as ServiceForm['searchDepth'] })}><option value="basic">基础（basic）</option><option value="advanced">高级（advanced）</option></select></label>
      <label className={styles.field}>超时（毫秒）<input type="number" required min={1000} max={30000} step={1} value={value.timeoutMs} onChange={event => onChange({ ...value, timeoutMs: Number(event.target.value) })} /></label></div>
    <p className={styles.hint}>只使用网页片段，与 RAG 并行检索。搜索失败继续回答；不使用 Tavily 生成的摘要答案。</p>
  </fieldset>
}
