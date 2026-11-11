import type { RetrievalContext } from '../../../shared/types'
import { formNoteClass } from '../lib/form'

interface ReferenceRetrievalDiagnosticsProps { hybrid: NonNullable<RetrievalContext['hybrid']> }
const statusLabels = { disabled: '未开启', ready: '成功', degraded: '已回退 RRF', skipped: '已跳过' } as const
const reasonLabels: Record<string, string> = { timeout: '超时', busy: '并发已满', queue_full: '并发已满', input_limit: '输入超限', protocol_error: '响应协议无效', unavailable: '服务不可用', provider_error: '供应商错误' }

export default function ReferenceRetrievalDiagnostics({ hybrid }: ReferenceRetrievalDiagnosticsProps) {
  const { bm25, vector, fusion, rerank } = hybrid
  return <div className={formNoteClass}>
    <p>本地混合检索：BM25 {bm25.candidateCount}/{bm25.topK ?? 4} · 向量 {vector.candidateCount}/{vector.topK ?? 4} · {fusion.selectedCount == null ? `RRF ${fusion.resultCount}/${fusion.topN ?? 2}` : `RRF 入池 ${fusion.selectedCount}/${fusion.topN ?? '未记录'}`}</p>
    {fusion.candidateCount != null && <p>RRF 去重候选：{fusion.candidateCount} · 入池：{fusion.selectedCount ?? '未记录'}/{fusion.topN ?? '未记录'} · 最终装箱：{fusion.resultCount}</p>}
    {rerank && <p>重排序：{statusLabels[rerank.status]}{rerank.model && ` · ${rerank.model}`} · 输入：{rerank.candidateCount} · 保留数 TopN：{rerank.topN} · 选中：{rerank.resultCount}（装箱前） · {rerank.durationMs.toFixed(0)} ms{rerank.reason && ` · ${reasonLabels[rerank.reason] ?? rerank.reason}`}{rerank.status === 'skipped' && rerank.reason && ' · 使用 RRF 顺序'}</p>}
  </div>
}
