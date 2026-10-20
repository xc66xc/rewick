import { FileText } from '@phosphor-icons/react'
import type { ReferenceDocument } from '../../../shared/types'
import { CheckRow } from './ui/check-row'
import { Pill } from './ui/pill'
import { cn } from '../lib/cn'

interface EnvironmentReferencePickerProps { documents: ReferenceDocument[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }
const statusLabels: Record<ReferenceDocument['status'], string> = { parsing: '解析中', pending: '等待建索引', indexing: '建索引中', ready: '可用', error: '处理失败' }
export default function EnvironmentReferencePicker({ documents, selected, disabled, onChange }: EnvironmentReferencePickerProps) {
  const missing = selected.filter(id => !documents.some(document => document.id === id))
  const selectedCount = selected.length - missing.length
  function handleToggle(id: string, checked: boolean) { onChange(checked ? [...selected, id] : selected.filter(value => value !== id)) }
  return <fieldset className="my-5 min-w-0 border-0 p-0" disabled={disabled}>
    <legend className="sr-only">环境参考资料</legend>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium text-text-regular" aria-hidden="true">环境参考资料</span>
      <Pill aria-live="polite">已选 {selectedCount} / 30</Pill>
    </div>
    <p className="mb-3 text-xs text-text-secondary">选择本场面试使用的资料，回答时检索相关内容。</p>
    {documents.length ? <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto p-1 max-[640px]:grid-cols-1">{documents.map(document => {
      const checked = selected.includes(document.id)
      const unavailable = disabled || (!checked && selectedCount >= 30)
      return <CheckRow key={document.id} className={cn(
        'm-0 items-start gap-3 rounded-control border p-3 transition-colors [&>span]:min-w-0 [&>span]:flex-1 focus-within:shadow-focus-ring',
        checked ? 'border-accent-line bg-accent-subtle' : 'border-border bg-card',
        !unavailable && 'hover:border-accent-line',
      )}
        aria-label={`选择资料 ${document.name}`} checked={checked} disabled={unavailable}
        onChange={value => handleToggle(document.id, value)}
        label={<span className="flex min-w-0 items-start gap-2">
          <FileText size={18} aria-hidden="true" className={cn('shrink-0', checked ? 'text-accent-text' : 'text-text-muted')} />
          <span className="min-w-0 flex-1">
            <strong className="block text-xs font-medium text-text-primary [overflow-wrap:anywhere]">{document.name}</strong>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
              <span>{document.kind === 'personal' ? '我的项目经历' : '技术参考'}</span>
              <span className={document.status === 'error' ? 'text-danger' : undefined}>{statusLabels[document.status]}{!document.enabled ? ' · 全局未启用' : ''}</span>
            </span>
          </span>
        </span>} />
    })}</div> : <p className="rounded-control border border-dashed border-border-strong bg-subtle px-5 py-6 text-xs leading-relaxed text-text-secondary">还没有平台参考资料。可以先保存环境，之后在个人背景导入资料，再回到这里勾选。</p>}
    {missing.length > 0 && <p className="mt-3 rounded-control bg-subtle px-3 py-2 text-xs leading-relaxed text-text-secondary" role="status">{missing.length} 份已选资料已被移除，保存环境时会自动清理。重新导入的资料需在上方勾选。</p>}
  </fieldset>
}
