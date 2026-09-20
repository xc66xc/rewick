import { cn } from '../lib/cn'
import { Collapse } from './ui/collapsible'
import { useState } from 'react'
import { Check, Copy, Sparkle } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Answer } from '../../../shared/types'
import { Badge } from './ui/badge'
import { IconButton } from './ui/button'
import ReferenceSources from './ReferenceSources'
import ModelInputDetails from './ModelInputDetails'
import { inlineErrorClass } from '../lib/form'

interface AnswerCardProps { answer: Answer; index: number; compact?: boolean }
const markdownPlugins = [remarkGfm]
export default function AnswerCard({ answer, index, compact = false }: AnswerCardProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  async function handleCopy() {
    try { await navigator.clipboard.writeText(answer.text); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }
  return <article className={cn('border-b border-border p-5', compact ? 'compact-answer' : 'animate-fade-in wide:px-8 wide:py-6')} aria-label={`回答 ${index}`}>
    <header className={cn('mb-5', compact ? 'space-y-2 border-b border-border pb-5' : 'flex items-start gap-3')}>
      {compact ? <p className="text-xs font-medium text-text-secondary">当前问题 · {String(index).padStart(2, '0')}</p> : <Badge className="border-transparent bg-success-subtle font-mono text-[10px] text-success">Q{String(index).padStart(2, '0')}</Badge>}
      <h3 className={cn('font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]', compact ? 'text-lg leading-relaxed text-text-heading' : 'text-sm leading-[1.75]')}>{answer.question}</h3>
    </header>
    {!compact && <ModelInputDetails modelInput={answer.modelInput} pending={answer.status === 'streaming'} />}
    <div className={cn('mb-3 flex min-h-[30px] items-center gap-2 text-xs', compact ? 'text-text-secondary' : 'text-success')}>{!compact && <Sparkle size={15} aria-hidden="true" />}<span>口语回答</span><span className="ml-auto text-[10px] text-text-muted">{answer.status === 'streaming' ? '正在生成' : answer.status === 'cancelled' ? '已停止' : answer.status === 'error' ? '生成失败' : '已完成'}</span>
      {answer.text && <IconButton aria-label={copied ? '已复制回答' : '复制回答'} title={copied ? '已复制回答' : '复制回答'} onClick={() => void handleCopy()}>{copied ? <Check /> : <Copy />}</IconButton>}</div>
    <div className={cn(compact ? 'compact-answer__body' : 'text-[15px] leading-[1.9]', ' [overflow-wrap:anywhere] [&_a]:text-success [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_code]:rounded-[3px] [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:mt-4 [&_h4]:mb-2 [&_li]:marker:text-text-muted [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-auto [&_pre]:rounded-chip [&_pre]:bg-canvas [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mb-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5')}><ReactMarkdown remarkPlugins={markdownPlugins} skipHtml>{answer.text}</ReactMarkdown>
      {answer.status === 'streaming' && <span className="inline-flex min-h-[22px] items-center gap-1 [&>span]:size-1 [&>span]:animate-pulse-dot [&>span]:rounded-full [&>span]:bg-success [&>span:nth-child(2)]:[animation-delay:.2s] [&>span:nth-child(3)]:[animation-delay:.4s]" aria-label="模型正在生成"><span /><span /><span /></span>}
      {!answer.text && answer.status === 'cancelled' && <p className="mb-0 text-xs text-text-muted">已停止本次生成。</p>}</div>
    {answer.error && <p className={inlineErrorClass} role="alert">{answer.error}</p>}
    {copyError && <p className={inlineErrorClass}>无法访问剪贴板，请选择文字复制。</p>}
    {compact ? <Collapse summary="本次发送内容与检索资料" className="mt-3 border-0 px-0 py-1"><ModelInputDetails modelInput={answer.modelInput} pending={answer.status === 'streaming'} />{answer.retrieval && <ReferenceSources retrieval={answer.retrieval} />}</Collapse> : answer.retrieval && <ReferenceSources retrieval={answer.retrieval} />}
  </article>
}
