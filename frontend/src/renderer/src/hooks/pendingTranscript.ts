import type { TranscriptSegment } from '../../../shared/types'

function sameSegment(left: TranscriptSegment | undefined, right: TranscriptSegment): boolean {
  return left?.id === right.id && left.text === right.text && left.startMs === right.startMs
    && left.endMs === right.endMs && left.isFinal === right.isFinal && left.isEdited === right.isEdited
}

/** Ephemeral speech for one unsubmitted question; never changes the saved transcript. */
export class PendingTranscript {
  private readonly pending = new Map<string, TranscriptSegment>()
  private readonly consumed = new Set<string>()
  private preview?: TranscriptSegment

  receive(segment: TranscriptSegment): void {
    const previous = this.pending.get(segment.id)
    if (this.consumed.has(segment.id) || previous?.isFinal && !segment.isFinal || sameSegment(previous, segment)) return
    this.pending.set(segment.id, segment)
    this.rebuild()
  }

  consume(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      this.consumed.add(id)
      if (this.pending.delete(id)) changed = true
    }
    if (changed) this.rebuild()
  }

  reset(): void {
    this.pending.clear()
    this.consumed.clear()
    this.preview = undefined
  }

  /** The already-merged record owns edits, empty text and final status. */
  sync(segments: readonly TranscriptSegment[]): void {
    let changed = false
    for (const segment of segments) {
      const previous = this.pending.get(segment.id)
      if (previous && !sameSegment(previous, segment)) {
        this.pending.set(segment.id, segment)
        changed = true
      }
    }
    if (changed) this.rebuild()
  }

  snapshot(): TranscriptSegment | undefined { return this.preview }

  ids(): string[] { return [...this.pending.keys()] }

  private rebuild(): void {
    const segments = [...this.pending.values()]
    const first = segments[0]
    const text = segments.filter(segment => segment.text.trim()).map(segment => segment.text).join('\n')
    if (!first || !text) { this.preview = undefined; return }
    const next: TranscriptSegment = { id: first.id, text, startMs: first.startMs,
      endMs: segments.at(-1)?.endMs, isFinal: segments.every(segment => segment.isFinal),
      ...(segments.some(segment => segment.isEdited) ? { isEdited: true } : {}) }
    if (!sameSegment(this.preview, next)) this.preview = next
  }
}
