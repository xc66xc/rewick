import { useEffect, useState } from 'react'
import type { MockBridge, MockReport } from '../../../../shared/mock-interview'
import { Button } from '../../components/ui/button'
import { toast } from '../../components/ui/toast'
interface Props { bridge: MockBridge; id: string }
const labels: Record<string, string> = { summary: '整体复盘', strengths: '回答亮点', improvements: '待改进内容', comment: '点评', reason: '依据', topicId: '考察主题', gaps: '待改进内容', evidence: '回答证据', coverage: '能力覆盖', suggestions: '练习建议', turns: '逐题点评', question: '问题', answer: '回答', assessment: '评价', improvedAnswer: '改进示例', nextPractice: '下次练习', competencies: '能力维度', level: '表现等级', topic: '主题', feedback: '反馈', text: '内容', turnId: '关联轮次', reference: '参考依据' }
function ReportContent({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || depth > 7) return null
  if (Array.isArray(value)) return <ul className="space-y-3 pl-4">{value.map((item, index) => <li key={index}><ReportContent value={item} depth={depth + 1} /></li>)}</ul>
  if (typeof value === 'object') return <dl className="space-y-3">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-sm font-semibold">{labels[key] ?? key}</dt><dd className="mt-1 text-sm leading-7 text-text-secondary"><ReportContent value={item} depth={depth + 1} /></dd></div>)}</dl>
  return <span className="whitespace-pre-wrap">{String(value)}</span>
}
export default function MockReportView({ bridge, id }: Props) {
  const [report, setReport] = useState<MockReport>(); const [error, setError] = useState(''); const [retrying, setRetrying] = useState(false); const [revision, setRevision] = useState(0)
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try { const value = await bridge.report(id); if (abort.signal.aborted) return; setReport(value); setError(''); if (['pending', 'running'].includes(value.status) && !document.hidden) timer = setTimeout(() => { if (!document.hidden) void load() }, 5000) }
      catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '报告加载失败。') }
    }
    const visibility = () => { if (!document.hidden) void load(); else if (timer) clearTimeout(timer) }
    document.addEventListener('visibilitychange', visibility)
    if (!document.hidden) void load(); return () => { abort.abort(); if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [bridge, id, revision])
  async function retry() { setRetrying(true); try { setReport(await bridge.retryReport(id, crypto.randomUUID())); setRevision(value => value + 1); toast.show('已提交重新生成报告。') } catch (reason) { setError(reason instanceof Error ? reason.message : '报告重试失败。') } finally { setRetrying(false) } }
  return <section className="space-y-4 rounded-card border border-border bg-card p-6"><h2 className="text-lg font-semibold">面试复盘</h2>{error && <p role="alert" className="text-sm text-danger">{error}</p>}{!report && !error && <p role="status">正在读取报告…</p>}{report && report.status !== 'ready' && <p role="status" className="text-sm text-text-secondary">{report.status === 'failed' ? report.error || '报告生成失败。' : '正在生成复盘报告，不扣模拟时长。'}</p>}{report?.status === 'ready' && <ReportContent value={report.report} />}{(report?.status === 'failed' || error) && <Button disabled={retrying} onClick={() => void retry()}>重新生成报告</Button>}</section>
}
