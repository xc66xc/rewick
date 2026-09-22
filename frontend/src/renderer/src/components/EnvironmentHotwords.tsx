import { useEffect, useRef, useState } from 'react'
import type { EnvironmentInput } from '../../../shared/types'
import { environmentHotwordsError, normalizeEnvironmentHotwords } from '../../../shared/environment-hotwords'
import { Button } from './ui/button'
import { TextareaField } from './ui/field'

interface Props {
  draft: EnvironmentInput
  disabled: boolean
  onChange: (draft: EnvironmentInput) => void
  onExtract: (input: EnvironmentInput) => Promise<string[]>
}
function sourceKey(draft: EnvironmentInput): string {
  return JSON.stringify([draft.resumeId, draft.targetId, [...draft.referenceIds].sort()])
}
function parseWords(text: string): string[] {
  return normalizeEnvironmentHotwords(text.split(/[\n,，;；]/u))
}

export default function EnvironmentHotwords({ draft, disabled, onChange, onExtract }: Props) {
  const [text, setText] = useState(() => (draft.hotwords ?? []).join('\n'))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [extractedSource, setExtractedSource] = useState(() => sourceKey(draft))
  const request = useRef(0)
  const latest = useRef({ draft, disabled, onChange })
  latest.current = { draft, disabled, onChange }
  useEffect(() => () => { request.current += 1 }, []) // Ignore requests from a closed or replaced editor.
  const validation = environmentHotwordsError(draft.hotwords ?? [])
  const changed = sourceKey(draft) !== extractedSource
  const hasSources = Boolean(draft.resumeId || draft.targetId || draft.referenceIds.length)

  function handleChange(value: string) {
    setText(value)
    onChange({ ...draft, hotwords: parseWords(value) })
    setMessage('')
  }
  async function handleExtract() {
    const ticket = ++request.current
    const source = sourceKey(draft)
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await onExtract(draft)
      if (ticket !== request.current) return
      const current = latest.current
      if (current.disabled || sourceKey(current.draft) !== source) {
        setMessage('资料选择已变化，请重新提取。')
        return
      }
      const words = normalizeEnvironmentHotwords([...(current.draft.hotwords ?? []), ...result])
      const invalid = environmentHotwordsError(words)
      if (invalid) {
        setError(`${invalid} 已保留现有术语。`)
        return
      }
      current.onChange({ ...current.draft, hotwords: words })
      setText(words.join('\n'))
      setExtractedSource(source)
      setMessage(result.length ? '已合并提取结果，请检查后保存。' : '未提取到专业术语，可以手动填写。')
    } catch (reason) {
      if (ticket === request.current) setError(reason instanceof Error ? reason.message : '提取失败，请重试。')
    } finally { if (ticket === request.current) setLoading(false) }
  }
  return <section className="mt-5 flex flex-col gap-3" aria-label="专业术语设置">
    <TextareaField id="environment-hotwords" label="专业术语（选填）" rows={4} value={text}
      placeholder={'虚拟量测\nAgent\nRAG'} disabled={disabled} onChange={event => handleChange(event.target.value)}
      hint="每行一个或用逗号分隔，保存后下次开始转写生效。" error={validation || undefined} />
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-secondary">已填 {draft.hotwords?.length ?? 0} / 200 个</span>
      <Button type="button" disabled={disabled || loading || !hasSources} onClick={() => void handleExtract()}>{loading ? '提取中…' : '从所选资料提取'}</Button>
    </div>
    {(changed || message) && <p className="text-xs text-text-secondary" role="status">{changed ? '资料选择已变化，可重新提取专业术语。' : message}</p>}
    {error && <p className="text-xs text-danger" role="alert">{error}</p>}
  </section>
}
