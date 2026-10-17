import { useLayoutEffect, useRef, useState } from 'react'
import type { Answer, TranscriptSegment } from '../../../shared/types'

interface CompactTranscriptProps { segment?: TranscriptSegment; answer?: Answer; recordId: string }
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ')

/** A pending question uses the same bubble as submitted turns, without a second transcript panel. */
export default function CompactTranscript({ segment, answer, recordId }: CompactTranscriptProps) {
  const observed = useRef<{ recordId: string; answerId?: string }>({ recordId })
  const [submitted, setSubmitted] = useState<{ recordId: string; segmentId: string } | null>(null)
  useLayoutEffect(() => {
    if (observed.current.recordId !== recordId) {
      observed.current = { recordId }
      setSubmitted(null)
    }
    if (observed.current.answerId === answer?.id) return
    observed.current.answerId = answer?.id
    // Only a newly submitted answer consumes speech. Repeating the same question later is still visible.
    if (segment?.text.trim() && answer && normalized(answer.question).endsWith(normalized(segment.text))) {
      setSubmitted({ recordId, segmentId: segment.id })
    }
  }, [answer, segment, recordId])
  if (!segment?.text.trim() || submitted?.recordId === recordId && submitted.segmentId === segment.id) return null
  return <section aria-label="当前转写问题" className="compact-answer">
    <header className="compact-answer__question">
      <p className="text-xs font-medium text-text-secondary">当前问题</p>
      <h3 aria-live="polite" aria-atomic="true" className="compact-answer__question-bubble whitespace-pre-wrap [overflow-wrap:anywhere]">{segment.text}</h3>
    </header>
  </section>
}
