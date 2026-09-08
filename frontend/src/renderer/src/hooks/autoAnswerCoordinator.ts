import type { TranscriptSegment } from '../../../shared/types'

export type AutoAnswerState = 'off' | 'listening' | 'finalizing' | 'waiting' | 'skipped' | 'queued' | 'editing' | 'manual'
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

function isQuestion(text: string): boolean {
  const clean = text.trim()
  if (!clean) return false
  const greeting = /^(?:(?:你好|您好|嗨|哈喽|早上好|下午好|晚上好|谢谢(?:你)?|好的|好|嗯|hi|hello|hey|thanks|thank you|okay|ok|good morning|good afternoon|good evening)[\s，,。.!！？?]*)+$/iu
  const soundCheck = /^(?:你(?:们)?(?:能)?听(?:得)?到(?:我(?:的声音)?)?吗|能听(?:得)?到吗|can you hear me)[\s，,。.!！？?]*$/iu
  if (greeting.test(clean) || soundCheck.test(clean)) return false
  if (/[?？]/.test(clean)) return true
  return clean.split(/[，,。；;！!\n]/).some(part => {
    const clause = part.trim().replace(/^(?:(?:嗯+|呃+|额+|那个|那么|接下来|然后|另外|所以(?:说)?|那|好的?)\s*)+/, '')
    if (!clause) return false
    if (/^(?:我想|想)(?:问|了解|知道|请教|听听)/.test(clause)) return true
    // Interviewers often use requests rather than questions. Strip polite/ordering
    // words only at the start; never remove a first-person subject from a statement.
    const completedStatement = /^你(?:(?:刚才|刚刚|之前|已经|上次)\s*)*(?:介绍|解释|说明|描述|设计|实现|比较|分析|讲|谈|举|说)(?:了|过|的)/.test(clause)
    const request = completedStatement ? '' : clause.replace(/^(?:(?:请(?:你)?|麻烦(?:你)?|你(?:能|可以)?|能不能|可不可以|能否|可否|能|可以|方便)(?:给我|给我们)?\s*|(?:首先|先|再|来|简单|简短|详细|大概|稍微)(?:地|的)?\s*)+/, '')
    const invitation = /^(?:请|麻烦|你(?:能|可以|先|再)|能不能|可不可以|能否|可否|能|可以|方便)/.test(clause)
    if (invitation && /^(?:介绍|解释|说明|描述|设计|实现|比较|分析|讲|谈|举|说)/.test(request)) return true
    if (/^做(?:个|一个|一下)(?:(?:简单|简短)(?:的)?)?自我介绍/.test(request)) return true
    // Keep the actual transcript intact; only recognition accepts ASR's “自介介绍”.
    if (/^(?:自我介绍|自介(?:介绍)?)(?:一下|下|你|自己|吧|\s*$)/.test(request)) return true
    if (/^(?:介绍(?:一下|下)?|讲讲|讲一下|讲下|说说|说一下|说下|解释(?:一下|下)?|说明(?:一下|下)?|描述(?:一下|下)?|谈谈|聊聊|分析一下|比较一下|举个例子|设计(?:一个|一种|一套|一下|如何|怎么)|实现(?:一个|一种|一下))/.test(request)) return true
    // Avoid treating explanations containing question words as direct questions.
    const statement = /^(?:我(?:们)?(?:还)?(?:不)?(?:知道|了解|明白|清楚)|大家(?:都)?(?:知道|了解)|这就是|文档(?:介绍|说明)|这里(?:介绍|说明))/.test(clause)
      || /(?:解释了|说明了|介绍了|讨论了|展示了).*(?:如何|为什么|怎么|是否)/.test(clause)
    if (!statement && /(?:如何|为何|为什么|怎么|怎样|哪些|哪个|是否|能否|能不能|是不是|会不会|有没有|可不可以|是什么|什么(?:区别|作用|原因|场景|情况|时候|角色|职责|工作)|有什么|多少|多大|多高|多长|多久|几种|几个|吗\s*$|呢\s*$)/.test(clause)) return true
    const english = clause.replace(/^(?:(?:and|so|then|also|now|well|okay|ok)\s+)+/i, '')
    if (/^(?:what|why|how|when|where|which|who|whose|can|could|would|will|should|do|does|did|is|are|was|were|have|has)\b/i.test(english)) return true
    if (/^design patterns?\s+(?:is|are|was|were)\b/i.test(english)) return false
    return /^(?:please\s+)?(?:explain|describe|introduce|design|implement|compare|discuss|tell\s+(?:me|us)|walk\s+(?:me|us)\s+through|give\s+(?:me|us)|show\s+(?:me|us))\b/i.test(english)
      || /^(?:i(?:'d| would) like|i want)\s+(?:you to|to (?:know|understand|hear))\b/i.test(english)
  })
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
      if (this.state !== 'skipped' && this.state !== 'manual') this.updateState('listening')
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
    const question = candidates.map(segment => segment.text).join('\n').trim().slice(-12_000)
    if (!isQuestion(question)) { this.consume(); this.updateState('skipped'); return }
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
