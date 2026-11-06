import type { TranscriptSegment } from '../../../shared/types'

interface CompactTranscriptProps { segment?: TranscriptSegment }

/** A pending question uses the same bubble as submitted turns, without a second transcript panel. */
export default function CompactTranscript({ segment }: CompactTranscriptProps) {
  if (!segment?.text.trim()) return null
  return <section data-transcript-id={segment.id} aria-label="当前转写问题" className="compact-answer">
    <header className="compact-answer__question">
      <p className="text-xs font-medium text-text-secondary">当前问题</p>
      <h3 aria-live="polite" aria-atomic="true" className="compact-answer__question-bubble whitespace-pre-wrap [overflow-wrap:anywhere]">{segment.text}</h3>
    </header>
  </section>
}
