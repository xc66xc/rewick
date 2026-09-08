import type { SessionRecord, TranscriptSegment } from '../../../shared/types'

export function newRecord(): SessionRecord {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: '未命名会话', segments: [], answers: [] }
}

export function mergeSegment(segments: TranscriptSegment[], incoming: TranscriptSegment): TranscriptSegment[] {
  const index = segments.findIndex(segment => segment.id === incoming.id)
  if (index < 0) return [...segments, incoming]
  if (segments[index].isFinal && !incoming.isFinal) return segments
  return segments.map(segment => segment.id === incoming.id
    ? segment.isEdited ? { ...incoming, text: segment.text, isEdited: true } : incoming
    : segment)
}

export function recentQuestion(segments: TranscriptSegment[]): string {
  return segments.slice(-4).map(segment => segment.text).join('\n').trim().slice(-2400)
}

export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function recordHasContent(record: SessionRecord): boolean {
  return record.segments.length > 0 || record.answers.length > 0
}
