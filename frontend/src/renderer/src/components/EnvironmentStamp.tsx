import { Plus, Stamp } from '@phosphor-icons/react'
import type { EnvironmentStamp as StampValue } from '../../../shared/environment-stamp'
import { Button } from './ui/button'
import { cn } from '../lib/cn'

interface EnvironmentStampProps { stamp?: StampValue | null; name?: string; onEdit?: () => void; disabled?: boolean; preview?: boolean }
export default function EnvironmentStamp({ stamp, name, onEdit, disabled = false, preview = false }: EnvironmentStampProps) {
  if (!stamp && preview) return <span className="text-xs text-text-muted">输入文字查看预览</span>
  if (!stamp) return <Button variant="quiet" size="xs" className="text-text-muted" disabled={disabled} aria-label={`加印章 ${name ?? ''}`.trim()} onClick={onEdit}><Plus aria-hidden="true" size={14} /><Stamp aria-hidden="true" size={14} />加印章</Button>
  const className = cn('environment-stamp', `environment-stamp--${stamp.color}`)
  if (preview) return <span className={className} aria-label={`印章预览 ${stamp.text}`}>{stamp.text}</span>
  return <Button variant="quiet" className={className} disabled={disabled} aria-label={`编辑印章 ${name ?? ''}：${stamp.text}`} title="编辑印章" onClick={onEdit}>{stamp.text}</Button>
}
