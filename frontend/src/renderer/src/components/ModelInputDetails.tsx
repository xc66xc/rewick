import { useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'
import type { ModelInputSnapshot } from '../../../shared/types'
import { Button } from './ui/button'
import { inlineErrorClass } from '../lib/form'

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
  return <details className="-mt-3 mb-4 rounded-chip border border-border px-3 py-2 text-xs text-text-secondary">
    <summary className="cursor-pointer">本次发送内容<span className="ml-2 text-accent-text [overflow-wrap:anywhere]">{modelInput ? `${modelInput.model} · ${modelInput.messages.length} 条消息` : pending ? '等待提交' : '未记录'}</span></summary>
    {modelInput ? <>
      <div className="my-3 flex flex-wrap items-center justify-between gap-2">
        <span>发起本次请求时的完整文字</span>
        <Button variant="quiet" size="xs" onClick={() => void copyInput()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? '已复制发送内容' : '复制发送内容'}
        </Button>
      </div>
      {copyError && <p className={inlineErrorClass} role="alert">无法访问剪贴板，请选择文字复制。</p>}
      <div className="flex max-h-[min(320px,30vh)] flex-col gap-5 overflow-y-auto rounded-chip border border-border bg-subtle p-3" role="region" aria-label="本次发送的完整文字" tabIndex={0}>
        {modelInput.messages.map((message, index) => <section key={`${index}-${message.role}`}>
          <h4 className="mb-2 text-xs font-medium text-accent-text">{roleLabels[message.role]} · {message.role}</h4>
          <pre className="m-0 font-[inherit] leading-[1.85] whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</pre>
        </section>)}
      </div>
    </> : <p className="mt-3 mb-0">{pending ? '完成资料检索并提交模型请求后，发送内容会显示在这里。' : '这条回答未记录发送内容，可能来自旧版或在提交前已停止。更新后发起的模型请求会自动记录。'}</p>}
  </details>
}
