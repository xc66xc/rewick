import type { TranscriptSegment } from '../../../shared/types'
import { isPureAcknowledgement } from './autoAnswerAcknowledgement'

export type AutoAnswerState = 'off' | 'listening' | 'finalizing' | 'waiting' | 'queued' | 'editing' | 'manual'
export interface AutoAnswerSnapshot {
  active: boolean
  busy: boolean
  editing: boolean
  pauseMs: number
  segments: TranscriptSegment[]
}
export interface AutoAnswerOptions {
  read: () => AutoAnswerSnapshot
  answer: (selection: { question: string; transcript: string }) => void
  onState: (state: AutoAnswerState) => void
}

function fingerprint(segment: TranscriptSegment): string {
  return `${segment.isFinal ? 'final' : 'partial'}:${segment.text.trim().replace(/\s+/g, ' ')}`
}

/** Receives an ASR event only after that segment has been merged into read().segments. */
export class AutoAnswerCoordinator {
  private active = false
  private wasEditing = false
  private disposed = false
  private state?: AutoAnswerState
  private timer?: ReturnType<typeof setTimeout>
  private readonly ignoredIds = new Set<string>()
  private readonly pending = new Map<string, string>()
  private changedAt = 0

  constructor(private readonly options: AutoAnswerOptions) { this.refresh() }

  receive(segment: TranscriptSegment): void {
    if (this.disposed) return
    const snapshot = this.options.read()
    if (!this.syncActive(snapshot) || this.ignoredIds.has(segment.id)) return
    if (!snapshot.segments.some(value => value.id === segment.id)) return
    const next = fingerprint(segment)
    if (this.pending.get(segment.id) !== next) {
      this.pending.set(segment.id, next)
      this.changedAt = Date.now()
    }
    this.evaluate(snapshot)
  }

  refresh(): void {
    if (this.disposed) return
    const snapshot = this.options.read()
    if (this.syncActive(snapshot)) this.evaluate(snapshot)
  }

  /** Manual answer/cancel wins over all audio already observed, including later revisions. */
  acknowledge(): void {
    if (this.disposed) return
    const snapshot = this.options.read()
    if (!this.syncActive(snapshot)) return
    for (const segment of snapshot.segments) this.ignoredIds.add(segment.id)
    this.consume()
    this.updateState('listening')
    this.evaluate(snapshot)
  }

  /** Editing a candidate hands the whole pending question to the user, without discarding future speech. */
  dismissPending(segmentId: string): void {
    if (this.disposed) return
    const snapshot = this.options.read()
    if (!this.syncActive(snapshot) || !this.pending.has(segmentId)) return
    this.consume()
    this.updateState('manual')
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
    this.pending.clear()
    this.ignoredIds.clear()
  }

  private syncActive(snapshot: AutoAnswerSnapshot): boolean {
    if (!snapshot.active) {
      this.active = false
      this.wasEditing = false
      this.clearTimer()
      this.pending.clear()
      this.ignoredIds.clear()
      this.updateState('off')
      return false
    }
    if (!this.active) {
      this.active = true
      this.pending.clear()
      this.ignoredIds.clear()
      for (const segment of snapshot.segments) this.ignoredIds.add(segment.id)
      this.wasEditing = snapshot.editing
    }
    return true
  }

  private evaluate(snapshot: AutoAnswerSnapshot): void {
    this.clearTimer()
    if (snapshot.editing) {
      this.wasEditing = true
      if (this.state !== 'manual' || this.pending.size > 0) this.updateState('editing')
      return
    }
    if (this.wasEditing) {
      this.wasEditing = false
      this.changedAt = Date.now()
    }
    const candidates = snapshot.segments.filter(segment => this.pending.has(segment.id))
    if (!candidates.length) {
      this.consume()
      if (this.state !== 'manual') this.updateState('listening')
      return
    }
    if (candidates.some(segment => !segment.isFinal)) { this.updateState('finalizing'); return }
    const pauseMs = Number.isFinite(snapshot.pauseMs) && snapshot.pauseMs > 0 ? snapshot.pauseMs : 1500
    const remaining = pauseMs - (Date.now() - this.changedAt)
    if (remaining > 0) {
      this.updateState('waiting')
      this.timer = setTimeout(() => this.refresh(), remaining)
      return
    }
    // Wait for final text and silence before filtering: a partial “嗯” may grow into a real question.
    // Filter before the busy check so feedback cannot become a queued answer after the current one ends.
    const question = candidates.filter(segment => !isPureAcknowledgement(segment.text))
      .map(segment => segment.text).join('\n').trim().slice(-12_000)
    if (!question) { this.consume(); this.updateState('listening'); return }
    if (snapshot.busy) { this.updateState('queued'); return }
    const lastId = candidates[candidates.length - 1].id
    const lastIndex = snapshot.segments.findIndex(segment => segment.id === lastId)
    const transcript = snapshot.segments.slice(0, lastIndex + 1).map(segment => segment.text).join('\n').slice(-18_000)
    // Consume before calling out: answer() may synchronously change busy and refresh this coordinator.
    this.consume()
    this.updateState('listening')
    this.options.answer({ question, transcript })
  }

  private consume(): void {
    this.clearTimer()
    for (const id of this.pending.keys()) this.ignoredIds.add(id)
    this.pending.clear()
  }

  private clearTimer(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private updateState(state: AutoAnswerState): void {
    if (state === this.state) return
    this.state = state
    this.options.onState(state)
  }
}
