import { useState } from 'react'
import type { TranscriptSegment } from '../../../shared/types'
import { PendingTranscript } from './pendingTranscript'

/** Keep synchronous consumption available before React commits the next render. */
export function useQuestionPreview() {
  const [buffer] = useState(() => new PendingTranscript())
  const [transcript, setTranscript] = useState<TranscriptSegment>()

  function receive(segment: TranscriptSegment) {
    buffer.receive(segment)
    setTranscript(buffer.snapshot())
  }
  function consume(ids: readonly string[]) {
    buffer.consume(ids)
    setTranscript(buffer.snapshot())
  }
  function reset() {
    buffer.reset()
    setTranscript(undefined)
  }
  function sync(segments: readonly TranscriptSegment[]) {
    buffer.sync(segments)
    setTranscript(buffer.snapshot())
  }

  return { transcript, receive, consume, reset, sync,
    read: () => buffer.snapshot(), ids: () => buffer.ids() }
}
