import type { QuestionRewriteResult } from '../../../shared/question-rewrite'
import { Collapse } from './ui/collapsible'

interface QuestionRewriteDetailsProps { original: string; result: QuestionRewriteResult }
const labels = { rewritten: '已整理', unchanged: '使用原问题', skipped: '已跳过', degraded: '整理失败，使用原问题' }

export default function QuestionRewriteDetails({ original, result }: QuestionRewriteDetailsProps) {
  return <Collapse summary={`问题整理 · ${labels[result.status]}`} className="my-3 text-text-secondary">
    <div className="space-y-3 [overflow-wrap:anywhere]">
      <p>模型：{result.model ?? '未调用或未返回'} · 耗时：{Math.round(result.durationMs)}ms · 配置版本：{result.platformVersion}</p>
      {result.reason && <p>原因：{result.reason}</p>}
      <section><h4 className="font-medium">原问题</h4><p className="whitespace-pre-wrap">{original}</p></section>
      {result.question && <section><h4 className="font-medium">整理问题</h4><p className="whitespace-pre-wrap">{result.question}</p></section>}
    </div>
  </Collapse>
}
