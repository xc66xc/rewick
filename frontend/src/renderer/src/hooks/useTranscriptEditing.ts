import { useRef, type RefObject } from 'react'
import type { SessionRecord, TranscriptSegment } from '../../../shared/types'
import { mergeSegment } from './sessionHelpers'

interface TranscriptEditingOptions {
  recordRef: RefObject<SessionRecord>
  onUpdate: (update: (record: SessionRecord) => SessionRecord) => void
  onSave: () => void
}

export function useTranscriptEditing({ recordRef, onUpdate, onSave }: TranscriptEditingOptions) {
  const focused = useRef(new Set<string>())
  const pending = useRef(new Map<string, TranscriptSegment>())

  function beginSegmentEdit(id: string) {
    if (recordRef.current.segments.some(segment => segment.id === id)) focused.current.add(id)
  }

  function editSegment(id: string, text: string) {
    onUpdate(current => {
      const previous = current.segments.find(segment => segment.id === id)
      if (!previous || previous.text === text) return current
      return { ...current, segments: current.segments.map(segment => segment.id === id
        ? { ...segment, text, isEdited: true } : segment) }
    })
  }

  function mergeTranscript(segments: TranscriptSegment[], incoming: TranscriptSegment): TranscriptSegment[] {
    const current = segments.find(segment => segment.id === incoming.id)
    if (!current || !focused.current.has(incoming.id)) return mergeSegment(segments, incoming)
    if (current.isFinal && !incoming.isFinal) return segments
    // A focused textarea owns its text and selection, even before the first keystroke.
    // Keep only the latest ASR version for blur, but let timing/final status advance.
    pending.current.set(incoming.id, incoming)
    return mergeSegment(segments, { ...incoming, text: current.text, isEdited: current.isEdited })
  }

  function finishSegmentEdit(id: string) {
    focused.current.delete(id)
    const incoming = pending.current.get(id)
    pending.current.delete(id)
    if (incoming) onUpdate(current => ({ ...current, segments: mergeSegment(current.segments, incoming) }))
    onSave()
  }

  function clearTranscriptEdits() {
    focused.current.clear()
    pending.current.clear()
  }

  function finishAllSegmentEdits() {
    for (const id of [...focused.current]) finishSegmentEdit(id)
  }

  function snapshotForSave(record: SessionRecord): SessionRecord {
    if (record.id !== recordRef.current.id || pending.current.size === 0) return record
    // Saving must not depend on blur (e.g. Cmd+Q), or alter the focused editor's selection.
    return { ...record, segments: record.segments.map(segment => segment.isEdited
      ? segment : pending.current.get(segment.id) ?? segment) }
  }

  return { beginSegmentEdit, editSegment, finishSegmentEdit, mergeTranscript, clearTranscriptEdits, snapshotForSave,
    finishAllSegmentEdits, isEditing: () => focused.current.size > 0 }
}
