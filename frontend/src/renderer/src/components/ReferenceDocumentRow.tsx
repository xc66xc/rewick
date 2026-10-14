import { ArrowClockwise, Eye, FileText, Trash } from '@phosphor-icons/react'
import type { ReferenceDocument, ReferenceKind } from '../../../shared/types'
import { AppSelect } from './ui/select'
import { TextButton } from './ui/button'
import { StatusPill } from './ui/pill'
import { ToggleSwitch } from './ui/switch'
import { inlineErrorClass } from '../lib/form'

interface ReferenceDocumentRowProps {
  document: ReferenceDocument
  busy: boolean
  removing: boolean
  onPreview: (document: ReferenceDocument) => void
  onUpdate: (id: string, patch: { enabled?: boolean; kind?: ReferenceKind }) => void
  onReindex: (id: string) => void
  onRemove: (id: string) => void
}
const statuses = { parsing: '解析中', pending: '等待建索引', indexing: '建索引中', ready: '可用', error: '处理失败' }
/* 五种文档状态映射到状态章四态(spec §6.1):解析/建索引中=busy,pending=pending,ready=ready,error=error */
const statusTone = { parsing: 'busy', pending: 'pending', indexing: 'busy', ready: 'ready', error: 'error' } as const
export default function ReferenceDocumentRow({ document, busy, removing, onPreview, onUpdate, onReindex, onRemove }: ReferenceDocumentRowProps) {
  const failureMessage = document.indexError || document.error
  const processing = document.status === 'parsing' || document.indexStatus === 'indexing' || document.indexStatus === 'pending'
  return <article className="border-b border-border p-5 last:border-b-0 max-[560px]:p-4" aria-label={`参考资料 ${document.name}`}>
    <div className="mb-4 flex items-center gap-3 max-[560px]:items-start"><div className="grid size-10 shrink-0 place-items-center rounded-chip border border-border bg-canvas text-text-secondary max-[560px]:hidden"><FileText size={22} weight="duotone" /></div><div className="min-w-0">
      <h3 className="text-sm font-medium [overflow-wrap:anywhere]">{document.name}</h3><p className="mt-1 text-xs text-text-secondary">{document.chunkCount} 个检索片段 · {document.contextCount} 个上下文块 · {document.headingMode === 'headings' ? '标题分片' : '段落分片'} · 版本 {document.revision}</p>
    </div><StatusPill status={statusTone[document.status]} className="ml-auto">{statuses[document.status]}</StatusPill></div>
    <div className="flex flex-wrap items-center gap-4">
      <div className="inline-flex items-center gap-2 text-xs text-text-secondary">资料用途<span className="inline-flex w-[148px] max-w-full"><AppSelect size="sm" aria-label={`资料用途 ${document.name}`} value={document.kind} disabled={busy || removing} onValueChange={value => onUpdate(document.id, { kind: value as ReferenceKind })} options={[{ value: 'technical', label: '技术参考' }, { value: 'personal', label: '我的项目经历' }]} /></span></div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-secondary"><ToggleSwitch size="sm" checked={document.enabled} disabled={busy || removing} onCheckedChange={checked => onUpdate(document.id, { enabled: checked })} aria-label={`启用资料 ${document.name}`} />参与检索</label>
      <div className="ml-auto flex flex-wrap items-center gap-4 max-[1060px]:ml-0 max-[1060px]:w-full"><TextButton disabled={busy || removing || document.status === 'parsing'} onClick={() => onPreview(document)} aria-label={`预览资料 ${document.name}`}><Eye size={16} />预览</TextButton>
        <TextButton disabled={busy || removing || processing} onClick={() => onReindex(document.id)} aria-label={`重建索引 ${document.name}`}><ArrowClockwise size={15} />{document.status === 'error' ? '重试' : '重建索引'}</TextButton>
        <TextButton disabled={removing} onClick={() => onRemove(document.id)} aria-label={`移除资料 ${document.name}`}><Trash size={15} />{removing ? '移除中…' : '移除'}</TextButton></div>
    </div>
    {document.indexStatus === 'indexing' && document.status === 'ready' && <p className="text-xs text-text-secondary">正在重建，当前索引仍可用。</p>}
    {document.splitterVersion === 0 && document.status === 'ready' && <p className="text-xs text-text-secondary">旧索引不参与新检索，请重建 Markdown/Word 资料。</p>}
    {failureMessage && <p role="alert" className={inlineErrorClass}>{failureMessage}</p>}
  </article>
}
