import { useState } from 'react'
import { Check, Copy, Sparkle } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Answer } from '../../../shared/types'
import IconButton from './IconButton'
import ReferenceSources from './ReferenceSources'
import ModelInputDetails from './ModelInputDetails'
import styles from '../styles/App.module.css'

interface AnswerCardProps { answer: Answer; index: number }
const markdownPlugins = [remarkGfm]
export default function AnswerCard({ answer, index }: AnswerCardProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  async function handleCopy() {
    try { await navigator.clipboard.writeText(answer.text); setCopied(true); setCopyError(false) }
    catch { setCopyError(true) }
  }
  return <article className={styles.answerCard} aria-label={`回答 ${index}`}>
    <header className={styles.answerCardHeader}><span className={styles.answerIndex}>Q{String(index).padStart(2, '0')}</span><h3>{answer.question}</h3></header>
    <ModelInputDetails modelInput={answer.modelInput} pending={answer.status === 'streaming'} />
    <div className={styles.answerLabel}><Sparkle size={15} weight="fill" /><span>口语回答</span><span className={styles.answerState}>{answer.status === 'streaming' ? '正在生成' : answer.status === 'cancelled' ? '已停止' : answer.status === 'error' ? '生成失败' : '已完成'}</span>
      {answer.text && <IconButton label={copied ? '已复制回答' : '复制回答'} onClick={() => void handleCopy()}>{copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}</IconButton>}</div>
    <div className={styles.markdown}><ReactMarkdown remarkPlugins={markdownPlugins} skipHtml>{answer.text}</ReactMarkdown>
      {answer.status === 'streaming' && <span className={styles.streamingIndicator} aria-label="模型正在生成"><span /><span /><span /></span>}
      {!answer.text && answer.status === 'cancelled' && <p className={styles.meta}>已停止本次生成。</p>}</div>
    {answer.error && <p className={styles.inlineError} role="alert">{answer.error}</p>}
    {copyError && <p className={styles.inlineError}>无法访问剪贴板，请选择文字复制。</p>}
    {answer.retrieval && <ReferenceSources retrieval={answer.retrieval} />}
  </article>
}
