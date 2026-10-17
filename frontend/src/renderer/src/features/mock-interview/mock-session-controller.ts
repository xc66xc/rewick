import { z } from 'zod'
import { AudioCapture } from '../../audio/capture'
import { MockTtsPlayer } from './tts-player'
import { decodeMockAudio, encodeMockAudio, mockSessionSchema, type MockBridge, type MockCommand, type MockMessage, type MockSession } from '../../../../shared/mock-interview'

export interface MockView { session?: MockSession; draft: string; partial: string; busy: boolean; editing: boolean; connected: boolean; micReady: boolean; level: number; error: string; hint?: string }
export class MockSessionController {
  private view: MockView = { draft: '', partial: '', busy: false, editing: false, connected: false, micReady: false, level: 0, error: '' }
  private capture = new AudioCapture()
  private player = new MockTtsPlayer()
  private unsubscribe?: () => void
  private automatic?: ReturnType<typeof setTimeout>
  private finals = new Map<string, string>()
  private draftEdited = false
  private pendingFinals: string[] = []
  private sequence = 0
  private eventSequence = -1
  private speech?: { id: string; generation: number; sequence: number }
  private captureEpoch = 0
  private pendingCommands = new Map<string, MockCommand>()
  private disposed = false
  private operations = 0
  private listening = false
  private voiceDetected = false
  private reminder?: ReturnType<typeof setTimeout>
  constructor(private readonly bridge: MockBridge, private readonly changed: (view: MockView) => void, private readonly levelChanged: (level: number) => void = () => undefined) {}
  private update(patch: Partial<MockView>) { if (this.disposed) return; this.view = { ...this.view, ...patch }; this.changed(this.view) }
  private clearAutomatic() { if (this.automatic) clearTimeout(this.automatic); this.automatic = undefined }
  private stopAudio() { this.captureEpoch++; this.listening = false; this.voiceDetected = false; this.clearAutomatic(); if (this.reminder) clearTimeout(this.reminder); void this.capture.stop().catch(error => this.fail(error)); this.player.stop(); this.speech = undefined; this.levelChanged(0); this.update({ level: 0, micReady: false }) }
  private fail(reason: unknown) { this.update({ error: reason instanceof Error ? reason.message : '模拟面试操作失败。' }) }
  async open(session: MockSession) {
    this.disposed = false; this.stopAudio(); this.unsubscribe?.()
    this.eventSequence = -1; this.finals.clear(); this.draftEdited = false; this.pendingFinals = []; this.pendingCommands.clear(); this.update({ session, draft: '', partial: '', error: '', connected: false })
    if (session.state === 'completed') return
    this.unsubscribe = this.bridge.onEvent(message => { void this.receive(message).catch(error => this.transportFailure(error)) })
    await this.bridge.connect(session.id); this.update({ connected: true })
  }
  private apply(session: MockSession, asrReady = false) {
    const previous = this.view.session
    if (previous && (previous.id !== session.id || session.version < previous.version || session.generation < previous.generation)) return
    if (previous?.generation !== session.generation || previous?.currentTurnId !== session.currentTurnId) {
      this.stopAudio(); this.finals.clear(); this.draftEdited = false; this.pendingFinals = []; this.pendingCommands.clear(); this.sequence = 0
      this.update({ draft: '', partial: '', editing: false, hint: undefined })
    }
    if (session.state !== 'listening') { this.clearAutomatic(); this.captureEpoch++; this.listening = false; void this.capture.stop().catch(error => this.fail(error)); this.update({ micReady: false }) }
    if (['paused', 'completed', 'error'].includes(session.state)) this.stopAudio()
    this.update({ session })
    if (asrReady && session.state === 'listening' && !this.view.micReady && !this.listening) void this.listen(session).catch(error => this.transportFailure(error))
  }
  private async listen(session: MockSession) {
    const epoch = ++this.captureEpoch
    this.listening = true
    if (this.reminder) clearTimeout(this.reminder)
    this.reminder = setTimeout(() => { if (epoch === this.captureEpoch && !this.view.draft.trim() && !this.view.partial.trim()) this.update({ hint: '可以先说说你的思路；也可以重复或跳过当前问题。' }) }, 45000)
    await this.capture.start('microphone', pcm => {
      const current = this.view.session
      if (epoch !== this.captureEpoch || current?.state !== 'listening' || current.generation !== session.generation || !current.currentTurnId) return
      this.bridge.sendAudio(encodeMockAudio(0, current.generation, current.currentTurnId, this.sequence++, pcm))
    }, level => {
      if (epoch !== this.captureEpoch) return
      if (level > 0.08) { this.voiceDetected = true; this.clearAutomatic() }
      else if (this.voiceDetected) { this.voiceDetected = false; this.schedule() }
    }, () => this.transportFailure(new Error('麦克风已断开，请重新检查设备。')))
    if (epoch === this.captureEpoch) this.update({ micReady: true })
  }
  private async receive(message: MockMessage) {
    if (message.kind === 'disconnected') { this.transportFailure(new Error(message.message)); return }
    const session = this.view.session; if (!session) return
    if (message.kind === 'audio') {
      const frame = decodeMockAudio(message.frame); const speech = this.speech
      if (!speech || frame.generation !== speech.generation || frame.id !== speech.id) return
      if (frame.sequence !== speech.sequence++) throw new Error('语音帧不连续，已停止播放，请重复当前问题。')
      this.player.push(frame.pcm); return
    }
    const event = message.event
    if (event.sessionId !== session.id || event.generation < session.generation || event.sequence <= this.eventSequence) return
    this.eventSequence = event.sequence
    if (event.kind === 'state') {
      const parsed = mockSessionSchema.parse(event.payload)
      const asrReady = z.object({ asrReady: z.boolean().optional() }).parse(event.payload).asrReady === true
      this.apply(parsed, asrReady); return
    }
    if (event.generation !== session.generation) return
    if (event.kind === 'error') { const value = z.object({ message: z.string() }).parse(event.payload); throw new Error(value.message) }
    if (event.kind === 'transcript.partial' || event.kind === 'transcript.final') {
      if (session.state !== 'listening') return
      const part = z.object({ id: z.string(), text: z.string(), isFinal: z.boolean(), startMs: z.number() }).parse(event.payload)
      this.clearAutomatic()
      if (event.kind === 'transcript.partial') { this.update({ partial: part.text }); return }
      const isNew = !this.finals.has(part.id)
      this.finals.set(part.id, part.text)
      this.update({ partial: '', hint: undefined })
      if (this.view.editing) { if (isNew) this.pendingFinals.push(part.text) }
      else if (!this.draftEdited) this.update({ draft: [...this.finals.values()].join('') })
      else if (isNew) this.update({ draft: this.view.draft + part.text })
      this.schedule(); return
    }
    if (event.kind === 'speech.start') {
      const value = z.object({ speechId: z.string().uuid(), sampleRate: z.literal(24000), channels: z.literal(1), format: z.literal('pcm16') }).parse(event.payload)
      const speech = { id: value.speechId, generation: event.generation, sequence: 0 }; this.speech = speech
      await this.player.start(() => { if (this.speech === speech) void this.command('playback_completed').catch(error => this.transportFailure(error)) }, bytes => { if (this.speech === speech) this.bridge.credit(bytes, speech.id, speech.generation) }, level => this.levelChanged(level), message => this.transportFailure(new Error(message)))
      if (this.speech === speech) this.bridge.credit(96000, speech.id, speech.generation)
    }
    if (event.kind === 'speech.end') { const value = z.object({ speechId: z.string().uuid() }).parse(event.payload); if (value.speechId === this.speech?.id) this.player.end() }
  }
  private schedule() {
    this.clearAutomatic()
    if (this.view.editing || this.view.busy || this.view.session?.state !== 'listening' || !this.view.draft.trim()) return
    if (/^(嗯+|啊+|哦+|好+的?|对+的?|是的|明白了?|收到|ok|okay)[。！!，,\s]*$/i.test(this.view.draft.trim())) return
    this.automatic = setTimeout(() => { void this.command('submit_answer').catch(error => this.fail(error)) }, this.view.session?.pauseMs ?? 1800)
  }
  edit(text: string) { this.draftEdited = true; this.clearAutomatic(); this.update({ draft: text }) }
  editing(editing: boolean) { if (!editing && this.pendingFinals.length) { this.update({ draft: this.view.draft + this.pendingFinals.join('') }); this.pendingFinals = [] }; this.update({ editing }); if (editing) this.clearAutomatic(); else this.schedule() }
  async command(command: MockCommand['command']) {
    const session = this.view.session
    if (!session || (this.view.busy && !['heartbeat', 'pause', 'finish', 'interrupt', 'playback_completed'].includes(command))) return
    const answer = (this.view.draft + (!this.draftEdited ? this.view.partial : '')).trim()
    if (command === 'submit_answer' && !answer) return
    const key = `${session.id}:${session.currentTurnId}:${command}:${command === 'submit_answer' ? answer : ''}`
    const input: MockCommand = this.pendingCommands.get(key) ?? { requestId: crypto.randomUUID(), expectedVersion: session.version, command, ...(session.currentTurnId ? { turnId: session.currentTurnId } : {}), ...(command === 'submit_answer' ? { text: answer } : {}) }
    this.pendingCommands.set(key, input)
    if (command !== 'heartbeat') { this.operations++; this.update({ busy: true, error: '' }) }
    if (['pause', 'finish', 'interrupt', 'skip'].includes(command)) this.stopAudio()
    this.clearAutomatic()
    try {
      const result = await this.bridge.command(session.id, input)
      this.pendingCommands.delete(key); this.apply(result)
    } catch (error) { this.fail(error); throw error }
    finally { if (command !== 'heartbeat') { this.operations--; this.update({ busy: this.operations > 0 }) } }
  }
  private transportFailure(reason: unknown) { this.stopAudio(); this.update({ connected: false }); this.fail(reason); void this.bridge.disconnect().catch(error => this.fail(error)) }
  async dispose() { this.stopAudio(); this.unsubscribe?.(); this.disposed = true; await this.bridge.disconnect() }
}
