import { useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'
import type { ModelInputSnapshot } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface ModelInputDetailsProps { modelInput?: ModelInputSnapshot; pending: boolean }
const roleLabels = { system: '系统提示词', user: '用户输入' }

export default function ModelInputDetails({ modelInput, pending }: ModelInputDetailsProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  async function copyInput() {
    if (!modelInput) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(modelInput, null, 2))
      setCopied(true); setCopyError(false)
    } catch { setCopyError(true) }
  }
  return <details className={`${styles.answerTarget} ${styles.modelInput}`}>
    <summary>本次发送内容<span>{modelInput ? `${modelInput.model} · ${modelInput.messages.length} 条消息` : pending ? '等待提交' : '未记录'}</span></summary>
    {modelInput ? <>
      <div className={styles.modelInputToolbar}>
        <span>发起本次请求时的完整文字</span>
        <button type="button" className={styles.textButton} onClick={() => void copyInput()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? '已复制发送内容' : '复制发送内容'}
        </button>
      </div>
      {copyError && <p className={styles.inlineError} role="alert">无法访问剪贴板，请选择文字复制。</p>}
      <div className={styles.modelInputMessages} role="region" aria-label="本次发送的完整文字" tabIndex={0}>
        {modelInput.messages.map((message, index) => <section key={`${index}-${message.role}`}>
          <h4 className={styles.modelInputRole}>{roleLabels[message.role]} · {message.role}</h4>
          <pre className={styles.modelInputContent}>{message.content}</pre>
        </section>)}
      </div>
    </> : <p>{pending ? '完成资料检索并提交模型请求后，发送内容会显示在这里。' : '这条回答未记录发送内容，可能来自旧版或在提交前已停止。更新后发起的模型请求会自动记录。'}</p>}
  </details>
}
