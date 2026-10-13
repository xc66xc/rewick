import { useEffect, useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import styles from '../styles.module.css'

const policySchema = z.object({
  maxFiles: z.number().int().min(1).max(100), maxTotalBytes: z.number().int().min(1048576).max(1073741824), maxChunks: z.number().int().min(1).max(50000),
  childTarget: z.number().int().min(100).max(640), childOverlap: z.number().int().min(0).max(100), parentTarget: z.number().int().min(400).max(1600),
  bm25K1: z.number().min(0.1).max(3), bm25B: z.number().min(0).max(1), vectorMinScore: z.number().min(0).max(1), rrfConstant: z.number().int().min(1).max(1000),
  bm25TimeoutMs: z.number().int().min(30).max(1000), maxTermRows: z.number().int().min(1000).max(2000000), cacheEnabled: z.boolean(), cacheWeightBytes: z.number().int().min(1048576).max(16777216),
  hybridEnabled: z.boolean(), version: z.number().int().nonnegative(),
}).refine(p => p.childOverlap < p.childTarget && p.parentTarget >= p.childTarget, '重叠必须小于子片段目标，父片段不能小于子片段。')
type Policy = z.infer<typeof policySchema>
const numericFields = [
  ['maxFiles', '每用户文件数量', 1, 100, 1], ['maxChunks', '每用户子片段数量', 1, 50000, 1],
  ['childTarget', '子片段目标字符数', 100, 640, 1], ['childOverlap', '子片段重叠字符数', 0, 100, 1], ['parentTarget', '父正文目标字符数', 400, 1600, 1],
  ['bm25K1', 'BM25 k1', 0.1, 3, 0.1], ['bm25B', 'BM25 b', 0, 1, 0.05], ['vectorMinScore', '向量相似度阈值', 0, 1, 0.01],
  ['rrfConstant', 'RRF 常数', 1, 1000, 1], ['bm25TimeoutMs', 'BM25 SQL 超时（毫秒）', 30, 1000, 1], ['maxTermRows', '每用户倒排记录上限', 1000, 2000000, 1],
] as const
interface Props { api: ApiClient }
export default function ReferencePolicy({ api }: Props) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void api.request('/admin/reference-policy', policySchema, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setPolicy(value); setError('') } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
    return () => controller.abort()
  }, [api, revision])
  async function save() {
    if (!policy || busy) return
    setBusy(true); setSaved(false); setError('')
    try {
      await api.request('/admin/reference-policy', z.undefined(), { method: 'PUT', body: policySchema.parse(policy) })
      setSaved(true); setRevision(value => value + 1)
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  function change<K extends keyof Policy>(key: K, value: Policy[K]) {
    setSaved(false); setPolicy(current => current ? { ...current, [key]: value } : current)
  }
  return <section aria-label="参考资料混合检索" className={styles.editorCard}>
    <h3>参考资料混合检索</h3>
    <p className={styles.hint}>只支持 Markdown 和 Word（MD、DOC、DOCX），单文件最大 10 MB。BM25 与向量各 Top5，RRF 融合后 Top3；联网搜索独立配置。切分参数修改只影响之后重建的索引。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {saved && <p role="status" className={styles.notice}>资料策略已保存。</p>}
    {!policy ? <button type="button" className={styles.secondaryButton} onClick={() => setRevision(value => value + 1)}>{error ? '重新加载策略' : '正在加载策略…'}</button> :
      <form aria-label="资料检索策略设置" onSubmit={event => { event.preventDefault(); void save() }}>
        <label className={styles.field}><span>启用本地混合检索</span><input type="checkbox" checked={policy.hybridEnabled} disabled={busy} onChange={event => change('hybridEnabled', event.target.checked)} /></label>
        <div className={styles.twoColumns}>
          {numericFields.map(([key, label, minimum, maximum, step]) => <label key={key} className={styles.field}>{label}<input type="number" min={minimum} max={maximum} step={step} required disabled={busy} value={policy[key]} onChange={event => change(key, Number(event.target.value))} /></label>)}
          <label className={styles.field}>每用户资料总容量（MB）<input type="number" min={1} max={1024} required disabled={busy} value={policy.maxTotalBytes / 1048576} onChange={event => change('maxTotalBytes', Math.round(Number(event.target.value) * 1048576))} /></label>
          <label className={styles.field}>父正文缓存估算容量（MB）<input type="number" min={1} max={16} required disabled={busy} value={policy.cacheWeightBytes / 1048576} onChange={event => change('cacheWeightBytes', Math.round(Number(event.target.value) * 1048576))} /></label>
          <label className={styles.field}>启用父正文缓存<input type="checkbox" disabled={busy} checked={policy.cacheEnabled} onChange={event => change('cacheEnabled', event.target.checked)} /></label>
        </div>
        <button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? '保存中…' : '保存资料策略'}</button>
      </form>}
  </section>
}
