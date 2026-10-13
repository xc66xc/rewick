import type { ServiceForm } from '../hooks/unified-service'
import { searchDepthNames } from '../types'
import styles from '../styles.module.css'
interface Props { value: ServiceForm; disabled: boolean; onChange: (value: ServiceForm) => void }
export default function WebSearchFields({ value, disabled, onChange }: Props) {
  return <fieldset disabled={disabled} className={styles.editorCard}><legend>Tavily 搜索参数</legend>
    <div className={styles.twoColumns}><label className={styles.field}>保留网页数量（topK）<input type="number" required min={1} max={20} step={1} value={value.topK} onChange={event => onChange({ ...value, topK: Number(event.target.value) })} /></label>
      <label className={styles.field}>搜索深度<select value={value.searchDepth} onChange={event => onChange({ ...value, searchDepth: event.target.value as ServiceForm['searchDepth'] })}>{Object.entries(searchDepthNames).map(([depth, label]) => <option key={depth} value={depth}>{label}</option>)}</select></label>
      <label className={styles.field}>超时（毫秒）<input type="number" required min={1000} max={30000} step={1} value={value.timeoutMs} onChange={event => onChange({ ...value, timeoutMs: Number(event.target.value) })} /></label></div>
    <label className={styles.field}>包含摘要答案<select value={value.includeAnswer} onChange={event => onChange({ ...value, includeAnswer: event.target.value as ServiceForm['includeAnswer'] })}><option value="none">不包含</option><option value="basic">基础摘要</option><option value="advanced">高级摘要</option></select></label>
    <p className={styles.hint}>搜索深度（search_depth）：高级搜索为 advanced，基础搜索为 basic，快速搜索为 fast，极速搜索为 ultra-fast；摘要（include_answer）：不包含为 false，基础摘要为 basic，高级摘要为 advanced。开启摘要后，将 Tavily 生成的摘要与网页片段一起提供给回答模型，摘要会明确标注为生成内容。联网搜索与 RAG 并行；搜索失败继续回答。</p>
  </fieldset>
}
