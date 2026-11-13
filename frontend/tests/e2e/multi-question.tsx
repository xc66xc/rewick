import { createRoot } from 'react-dom/client'
import AnswerCard from '../../src/renderer/src/components/AnswerCard'
import type { Answer, ReferenceExcerpt } from '../../src/shared/types'
import type { ExtractedQuestion } from '../../src/shared/question-rewrite'
import '../../src/renderer/src/styles/tokens.css'

const questions: ExtractedQuestion[] = [
  { id: 'q1', question: '除了 ReAct，还有哪些常见的 Agent 模式？', sourceTexts: ['除了 ReAct，还有哪些常见的 Agent 模式？'] },
  { id: 'q2', question: 'SSE 是什么？', sourceTexts: ['SSE 是什么？'] },
  { id: 'q3', question: 'MCP 除了 SSE，还支持哪些传输方式？', sourceTexts: ['MCP 除了 SSE，还支持哪些传输方式？'] },
]
const hybrid = {
  bm25: { status: 'ready' as const, candidateCount: 4, durationMs: 12, topK: 4 },
  vector: { status: 'ready' as const, candidateCount: 4, durationMs: 23, topK: 4 },
  fusion: { method: 'rrf' as const, rankConstant: 60, resultCount: 1, candidateCount: 6, selectedCount: 2, topN: 2 },
  rerank: { status: 'disabled' as const, model: null, candidateCount: 0, resultCount: 0, topN: 2, durationMs: 0 },
}
const bodies = [
  '合成资料：常见 Agent 编排还包括计划后执行、反思迭代，以及按职责协作的多 Agent 模式。',
  '合成资料：SSE 通过 HTTP 将服务器事件持续发送给客户端，适合展示流式文本。',
  '合成资料：MCP 传输方式需按协议版本区分，本地进程通信和远程 HTTP 通信的适用场景不同。',
]
const excerpts: ReferenceExcerpt[] = questions.map((question, index) => ({
  excerptId: `synthetic-evidence-${question.id}`, questionIds: [question.id], source: 'platform', documentId: 'synthetic-guide',
  revision: 1, name: 'Agent 与流式通信 · 合成演示资料.md', kind: 'technical', chunkId: `synthetic-chunk-${question.id}`,
  sectionPath: question.question, paragraphStart: index * 2 + 1, paragraphEnd: index * 2 + 2, text: bodies[index],
}))
const multi: Answer = {
  id: 'synthetic-multi', question: '你们项目用了 Reactor 做流式处理，对吧？那我想问一下，除了 ReAct，还有哪些常见的 Agent 模式？然后 SSE 是什么？MCP 除了 SSE，还支持哪些传输方式？',
  text: '除了 ReAct，还可以采用先计划后执行、反思迭代，以及按职责分工的多 Agent 协作。具体选哪一种，要看任务是否能提前拆分，以及是否需要在执行中持续调整。\n\nSSE 是服务器通过 HTTP 持续向客户端发送事件的机制，常用来展示模型的流式输出。\n\nMCP 的传输方式要结合协议版本和部署场景区分，本地进程通信与远程 HTTP 通信需要分别考虑。',
  createdAt: '2026-11-13T10:00:00+08:00', status: 'complete',
  questionRewrite: { resultFormat: 'questions-v1', status: 'rewritten', questions, reason: null, model: 'synthetic-extraction-model', durationMs: 42, platformVersion: 12 },
  retrieval: { status: 'ready', excerpts, policyVersion: 3, platformVersion: 12,
    queries: questions.map(question => ({ questionId: question.id, status: 'ready', referenceStatus: 'ready', hybrid, excerptIds: [`synthetic-evidence-${question.id}`] })) },
}
const legacy: Answer = {
  id: 'synthetic-legacy', question: '之前那个 SSE，你简单解释一下？', text: 'SSE 是服务器持续向客户端推送事件的机制，可以用来传输模型生成的文本。',
  createdAt: '2026-11-12T10:00:00+08:00', status: 'complete',
  questionRewrite: { status: 'rewritten', question: '请解释 SSE。', reason: null, model: 'synthetic-legacy-model', durationMs: 28, platformVersion: 8 },
}
const scenario = new URLSearchParams(location.search).get('scenario')
const element = document.getElementById('root')
if (element) createRoot(element).render(
  <main className="min-h-dvh bg-canvas p-8 text-text-primary">
    <header className="mb-6"><p className="text-xs font-medium text-accent-text">Rewick · 实际组件隔离预览</p><h1 className="mt-2 text-2xl font-semibold">{scenario === 'legacy' ? '单题历史记录' : '一次提取多个问点，统一回答'}</h1><p className="mt-2 text-sm text-text-secondary">合成问题与资料 · {import.meta.env.DEV ? '开发模式：展示提取来源及每题实际送模证据' : '生产构建：仅展示问题与回答'}</p></header>
    <section className="rounded-card border border-border bg-card"><AnswerCard answer={scenario === 'legacy' ? legacy : multi} index={1} /></section>
  </main>,
)
