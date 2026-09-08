import type { TranscriptSegment } from '../../../shared/types'
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea'
import styles from '../styles/App.module.css'

interface TranscriptSegmentEditorProps {
  segment: TranscriptSegment
  index: number
  onBegin: (id: string) => void
  onChange: (id: string, text: string) => void
  onFinish: (id: string) => void
}

export default function TranscriptSegmentEditor({ segment, index, onBegin, onChange, onFinish }: TranscriptSegmentEditorProps) {
  const textarea = useAutosizeTextarea(segment.text)
  return <textarea ref={textarea} rows={1} maxLength={12000} value={segment.text}
    aria-label={`转写文字 ${index + 1}`} aria-describedby="transcript-help" spellCheck={false}
    className={`${styles.segmentEditor} ${!segment.isFinal && !segment.isEdited ? styles.segmentEditorInterim : ''}`}
    onPointerDown={() => onBegin(segment.id)} onFocus={() => onBegin(segment.id)}
    onChange={event => onChange(segment.id, event.target.value)} onBlur={() => onFinish(segment.id)} />
}
