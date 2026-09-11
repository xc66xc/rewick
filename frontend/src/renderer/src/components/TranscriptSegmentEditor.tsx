import type { TranscriptSegment } from '../../../shared/types'
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea'
import { TextareaField } from './ui/field'
import { cn } from '../lib/cn'

interface TranscriptSegmentEditorProps {
  segment: TranscriptSegment
  index: number
  onBegin: (id: string) => void
  onChange: (id: string, text: string) => void
  onFinish: (id: string) => void
}

/* v30 .speech p:行内无框编辑面(透明边/底、hover 浅底、聚焦浅底 + 蓝描边)。
   经组件库 TextareaField.controlClassName 覆盖表单默认规格(base 的 outline-none
   需 focus:outline-solid 才能在聚焦时重新显形)。 */
const inlineControlClass = cn(
  'cursor-text resize-none overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] leading-[1.85]',
  'border-transparent bg-transparent px-0 py-0 hover:bg-subtle',
  'focus:border-transparent focus:bg-subtle focus:shadow-none focus:outline-solid focus:outline-2 focus:outline-offset-[3px] focus:outline-accent',
)

export default function TranscriptSegmentEditor({ segment, index, onBegin, onChange, onFinish }: TranscriptSegmentEditorProps) {
  const textarea = useAutosizeTextarea(segment.text)
  return <TextareaField
    ref={textarea} rows={1} maxLength={12000} value={segment.text}
    aria-label={`转写文字 ${index + 1}`} aria-describedby="transcript-help"
    controlClassName={cn(inlineControlClass, !segment.isFinal && !segment.isEdited && 'text-text-muted')}
    onPointerDown={() => onBegin(segment.id)} onFocus={() => onBegin(segment.id)}
    onChange={event => onChange(segment.id, event.target.value)} onBlur={() => onFinish(segment.id)} />
}
