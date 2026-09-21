import type { ReferenceDocument } from '../../../shared/types'
import { CheckRow } from './ui/check-row'
import { textButtonClass } from '../lib/form'

interface EnvironmentReferencePickerProps { documents: ReferenceDocument[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }
const statusLabels: Record<ReferenceDocument['status'], string> = { parsing: '解析中', pending: '等待建索引', indexing: '建索引中', ready: '可用', error: '处理失败' }
export default function EnvironmentReferencePicker({ documents, selected, disabled, onChange }: EnvironmentReferencePickerProps) {
  const missing = selected.filter(id => !documents.some(document => document.id === id))
  function handleToggle(id: string, checked: boolean) { onChange(checked ? [...selected, id] : selected.filter(value => value !== id)) }
  return <fieldset className="my-5 m-0 min-w-0 border-0 p-0" disabled={disabled}><legend className="mb-2 text-xs font-medium">环境参考资料</legend>
    <p className="mb-4 text-xs leading-[1.85] text-text-secondary">已选 {selected.length} / 30 份本地资料。</p>
    {documents.length ? <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto rounded-chip border border-border p-3">{documents.map(document => <CheckRow key={document.id} className="items-start gap-3 rounded-chip p-2"
      aria-label={`选择资料 ${document.name}`} checked={selected.includes(document.id)} disabled={!selected.includes(document.id) && selected.length >= 30}
      onChange={checked => handleToggle(document.id, checked)}
      label={<span className="min-w-0"><strong className="block text-xs font-medium [overflow-wrap:anywhere]">{document.name}</strong><span className="block text-[11px] text-text-secondary">{document.kind === 'personal' ? '我的项目经历' : '技术参考'} · {statusLabels[document.status]}{!document.enabled ? ' · 全局未启用' : ''}</span></span>} />)}</div> : <p className="rounded-card border border-dashed border-border-strong px-5 py-8 text-xs leading-[1.85] text-text-secondary">还没有平台参考资料。可以先保存环境，之后在个人背景导入资料，再回到这里勾选。</p>}
    {missing.length > 0 && <div className="mt-2 rounded-chip border border-danger-line bg-danger-subtle p-3 text-xs text-danger"><p>{missing.length} 份已选资料已被移除，不会参与回答。</p><button type="button" className={textButtonClass} onClick={() => onChange(selected.filter(id => !missing.includes(id)))}>清理失效资料</button></div>}
  </fieldset>
}
