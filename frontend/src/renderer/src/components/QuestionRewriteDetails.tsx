import { isQuestionExtraction, type QuestionRewriteResult } from '../../../shared/question-rewrite'
import type { RetrievalContext } from '../../../shared/types'
import { Collapse } from './ui/collapsible'

interface QuestionRewriteDetailsProps { original: string; result: QuestionRewriteResult; retrieval?: RetrievalContext }
const labels = { rewritten: '已整理', unchanged: '使用原问题', skipped: '已跳过', degraded: '整理失败，使用原问题' }

export default function QuestionRewriteDetails({ original, result, retrieval }: QuestionRewriteDetailsProps) {
  const extraction = isQuestionExtraction(result) ? result : undefined
  return <Collapse summary={`${extraction ? '问题提取' : '问题整理'} · ${labels[result.status]}${extraction?.questions.length ? ` · ${extraction.questions.length} 题` : ''}`} className="my-3 text-text-secondary">
    <div className="space-y-3 [overflow-wrap:anywhere]">
      <p>模型：{result.model ?? '未调用或未返回'} · 耗时：{Math.round(result.durationMs)}ms · 配置版本：{result.platformVersion}</p>
      {result.reason && <p>原因：{result.reason}</p>}
      <section><h4 className="font-medium">原问题</h4><p className="whitespace-pre-wrap">{original}</p></section>
      {!isQuestionExtraction(result) && result.question && <section><h4 className="font-medium">整理问题</h4><p className="whitespace-pre-wrap">{result.question}</p></section>}
      {extraction?.questions.map(question => {
        const query = retrieval?.queries?.find(value => value.questionId === question.id)
        return <section key={question.id} className="space-y-2 border-t border-border pt-3">
          <h4 className="font-medium">{question.id} · {question.question}</h4>
          <p>原话来源：{question.sourceTexts.join(' / ')}</p>
          {question.contextSourceTexts?.length ? <p>指代上下文：{question.contextSourceTexts.join(' / ')}</p> : null}
          {query && <p>检索：{query.status} · 实际送入 {query.excerptIds.length} 份证据{query.message ? ` · ${query.message}` : ''}</p>}
        </section>
      })}
    </div>
  </Collapse>
}
