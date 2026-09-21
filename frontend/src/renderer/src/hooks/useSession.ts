import type { SessionExportOptions } from '../../../shared/types'
import { useEffect, useRef, useState } from 'react'
import type { AppEvent, AsrStatus, DesktopBridge, EnvironmentInput, SessionRecord, Settings, SettingsInput } from '../../../shared/types'
import { resolveInterviewSettings } from '../../../shared/interview-settings'
import { AudioCapture } from '../audio/capture'
import { errorMessage } from './useSettings'
import { newRecord, recentQuestion, recordHasContent } from './sessionHelpers'
import { useTranscriptEditing } from './useTranscriptEditing'
import { isAnswerModelReady, isAsrReady, useAutoAnswer } from './useAutoAnswer'

const questionLimitMessage = '当前问题最多 12,000 个字符，请先删减内容后再加入。'

export function useSession(bridge: DesktopBridge | undefined, settings: Settings, saveSettings?: (input: SettingsInput) => Promise<Settings>, applySettings?: (settings: Settings) => void) {
  const [record, setRecord] = useState<SessionRecord>(newRecord)
  const recordRef = useRef(record)
  const [status, setStatus] = useState<AsrStatus>('idle')
  const statusRef = useRef<AsrStatus>('idle')
  const [source, updateSource] = useState<'system' | 'microphone'>('system')
  const sourceRef = useRef(source)
  const [level, setLevel] = useState(0)
  const [question, updateQuestion] = useState('')
  const [questionAssembling, updateQuestionAssembling] = useState(false)
  const questionAssemblingRef = useRef(false)
  const [error, setError] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [historySyncStatus, setHistorySyncStatus] = useState('已同步')
  useEffect(() => {
    if (!bridge?.getHistorySyncStatus) return
    let active = true
    const update = () => { void bridge.getHistorySyncStatus().then(value => { if (active) setHistorySyncStatus(value) }).catch(() => { if (active) setHistorySyncStatus('无法读取同步状态') }) }
    update(); const timer = setInterval(update, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [bridge])
  const [history, setHistory] = useState<SessionRecord[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const asrId = useRef<string | null>(null)
  const pendingAsrEvents = useRef<AppEvent[]>([])
  const requestId = useRef<string | null>(null)
  const capture = useRef<AudioCapture | null>(null)
  const permittedCapture = useRef<AudioCapture | null>(null)
  const lastSaved = useRef<SessionRecord | null>(null)
  const removingSessionId = useRef<string | null>(null)
  const removedSessionIds = useRef(new Set<string>())
  const operation = useRef(0)
  const stopping = useRef(false)
  const changingTarget = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const questionRef = useRef(question)
  const startedAt = useRef<number | null>(null)
  const busy = record.answers.some(answer => answer.status === 'streaming')

  function updateRecord(update: (current: SessionRecord) => SessionRecord) {
    const next = update(recordRef.current)
    recordRef.current = next
    setRecord(next)
  }
  function updateStatus(next: AsrStatus) { statusRef.current = next; setStatus(next); automatic.coordinator.current?.refresh() }
  async function persist(finalize = false) {
    const current = recordRef.current
    const snapshot = finalize && current.answers.some(answer => answer.status === 'streaming')
      ? { ...current, answers: current.answers.map(answer => answer.status === 'streaming' ? { ...answer, status: 'cancelled' as const } : answer) }
      : current
    if (finalize) recordRef.current = snapshot
    if (!bridge || !recordHasContent(snapshot) || lastSaved.current === snapshot
      || removingSessionId.current === snapshot.id || removedSessionIds.current.has(snapshot.id)) return
    await bridge.saveSession(snapshotForSave(snapshot), settingsRef.current.accountScope)
    lastSaved.current = snapshot
    if (!finalize) setHistoryVersion(version => version + 1)
  }
  const { beginSegmentEdit: beginEdit, editSegment: applyEdit, finishSegmentEdit: finishEdit, mergeTranscript,
    clearTranscriptEdits, snapshotForSave, finishAllSegmentEdits, isEditing } = useTranscriptEditing({
    recordRef, onUpdate: updateRecord, onSave: () => { void persist().catch(reason => setError(errorMessage(reason))) },
  })
  const automatic = useAutoAnswer({ settingsRef, saveSettings,
    read: () => ({ source: sourceRef.current, status: statusRef.current, busy: requestId.current !== null,
      editing: isEditing(), assembling: questionAssemblingRef.current, segments: recordRef.current.segments }),
    onAnswer: selection => { void generate(selection, true) },
  })
  useEffect(() => { automatic.coordinator.current?.refresh() }, [settings.autoAnswer, settings.llm, settings.platform, settings.serviceSelections, settings.customServices, source, status, busy])
  function setQuestion(next: string) {
    questionRef.current = next
    updateQuestion(next)
    if (!next.trim() && questionAssemblingRef.current) {
      questionAssemblingRef.current = false
      updateQuestionAssembling(false)
      // Reactivate synchronously so late revisions of the assembled segments are ignored.
      automatic.coordinator.current?.refresh()
    }
  }
  function appendSegmentToQuestion(id: string): boolean {
    if (!bridge || changingTarget.current) return false
    const text = recordRef.current.segments.find(segment => segment.id === id)?.text.trim()
    if (!text) return false
    const previous = questionRef.current
    const next = previous.trim() ? `${previous}${previous.endsWith('\n') ? '' : '\n'}${text}` : text
    if (next.length > 12_000) { setError(questionLimitMessage); return false }
    // Pause before returning control to the event loop, including a due silence timer.
    questionAssemblingRef.current = true
    updateQuestionAssembling(true)
    automatic.coordinator.current?.refresh()
    setQuestion(next)
    setError(current => current === questionLimitMessage ? '' : current)
    return true
  }
  function setSource(next: 'system' | 'microphone') {
    sourceRef.current = next; updateSource(next); automatic.coordinator.current?.refresh()
  }
  function beginSegmentEdit(id: string) {
    beginEdit(id)
    automatic.coordinator.current?.dismissPending(id)
    automatic.coordinator.current?.refresh()
  }
  function editSegment(id: string, text: string) {
    // Returning from another app may leave the textarea active without a fresh focus event.
    beginSegmentEdit(id); applyEdit(id, text); automatic.coordinator.current?.refresh()
  }
  function finishSegmentEdit(id: string) { finishEdit(id); automatic.coordinator.current?.refresh() }
  async function releaseAudio() {
    const activeCapture = capture.current
    capture.current = null
    await activeCapture?.stop()
    if (permittedCapture.current === activeCapture) permittedCapture.current = null
    setLevel(0)
  }
  async function stop() {
    if (stopping.current) return
    stopping.current = true
    operation.current += 1
    updateStatus('stopping')
    try { await releaseAudio(); await bridge?.stopAsr() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { asrId.current = null; updateStatus('idle'); startedAt.current = null; stopping.current = false }
    try { await persist() } catch (reason) { setError(errorMessage(reason)) }
  }
  async function start() {
    if (!bridge || stopping.current || changingTarget.current || !['idle', 'error'].includes(statusRef.current)) return
    if (!isAsrReady(settingsRef.current)) { setError(settingsRef.current.platform?.advancedSettingsEnabled ? '请在模型与设置中选择可用的转写服务。' : '平台默认转写服务不可用，请联系管理员。'); return }
    attachEnvironment()
    const currentOperation = ++operation.current
    pendingAsrEvents.current = []
    setError(''); updateStatus('connecting')
    const activeCapture = new AudioCapture(() => bridge.getCaptureError())
    capture.current = activeCapture
    permittedCapture.current = activeCapture
    try {
      await activeCapture.start(source, audio => {
        if (permittedCapture.current === activeCapture && asrId.current) bridge.sendAudio(asrId.current, audio)
      }, setLevel, () => { if (currentOperation === operation.current) void stop() })
      if (currentOperation !== operation.current) { await activeCapture.stop(); return }
      const result = await bridge.startAsr()
      if (currentOperation !== operation.current) { await activeCapture.stop(); return }
      asrId.current = result.sessionId
      startedAt.current = Date.now()
      setElapsed(0); updateStatus('listening')
      const pending = pendingAsrEvents.current
      pendingAsrEvents.current = []
      for (const event of pending) handleEvent(event)
    } catch (reason) {
      if (currentOperation !== operation.current) { await activeCapture.stop().catch(() => undefined); return }
      await releaseAudio().catch(() => undefined)
      await bridge.stopAsr().catch(() => undefined)
      if (currentOperation === operation.current) { asrId.current = null; updateStatus('error'); setError(errorMessage(reason)) }
    }
  }
  async function generate(selected?: { question: string; transcript: string }, isAutomatic = false) {
    if (changingTarget.current) return
    if (!isAutomatic) automatic.coordinator.current?.acknowledge()
    if (!bridge) { setError('请在 掌灯 Rewick 桌面应用中连接模型。'); return }
    if (!isAnswerModelReady(settingsRef.current)) {
      setError('请在设置中登录已开通回答的平台账号，或填写回答模型 API Key。'); return
    }
    const prompt = selected ? selected.question.trim() : questionRef.current.trim() || recentQuestion(recordRef.current.segments)
    if (!prompt) { setError('输入一个面试问题，或先开始转写。'); return }
    const id = crypto.randomUUID()
    attachEnvironment()
    requestId.current = id
    automatic.coordinator.current?.refresh()
    setError('')
    updateRecord(current => ({ ...current, title: current.title === '未命名会话' ? prompt.slice(0, 32) : current.title,
      answers: [...current.answers.map(answer => answer.status === 'streaming' ? { ...answer, status: 'cancelled' as const } : answer),
        { id, question: prompt, text: '', createdAt: new Date().toISOString(), status: 'streaming' }] }))
    if (!selected && !isAutomatic) setQuestion('')
    const transcript = selected?.transcript ?? recordRef.current.segments.map(segment => segment.text).join('\n')
    try { await bridge.generateAnswer({ requestId: id, question: prompt, transcript: transcript.slice(-18000),
      ...(settingsRef.current.interviewEnvironment ? { environmentId: settingsRef.current.interviewEnvironment.id } : {}) }) }
    catch (reason) { handleEvent({ kind: 'answer-error', requestId: id, message: errorMessage(reason) }) }
  }
  async function answerSegment(segmentId: string) {
    const segments = recordRef.current.segments
    const index = segments.findIndex(segment => segment.id === segmentId)
    if (index < 0 || !segments[index].text.trim()) return
    // Snapshot this sentence at click time; later ASR revisions cannot change an in-flight question.
    await generate({ question: segments[index].text, transcript: segments.slice(0, index + 1).map(segment => segment.text).join('\n') })
  }
  async function cancel() {
    automatic.coordinator.current?.acknowledge()
    const cancelledId = requestId.current
    try {
      await bridge?.cancelAnswer()
      if (cancelledId && requestId.current === cancelledId) handleEvent({ kind: 'answer-done', requestId: cancelledId, cancelled: true })
    } catch (reason) { setError(errorMessage(reason)) }
  }
  function handleEvent(event: AppEvent) {
    if (event.kind === 'session-stopping') {
      operation.current++; automatic.coordinator.current?.acknowledge(); updateStatus('idle')
      const current = recordRef.current
      const saved = snapshotForSave({ ...current, answers: current.answers.map(answer => answer.status === 'streaming' ? { ...answer, status: 'cancelled' as const } : answer) })
      recordRef.current = saved
      void releaseAudio().catch(reason => setError(errorMessage(reason)))
      void bridge?.stageSessionForLogout(event.nonce, recordHasContent(saved) ? saved : null).catch(reason => setError(errorMessage(reason)))
      return
    }
    if (event.kind === 'window-mode') return
    if (event.kind === 'session-ended' || event.kind === 'session-paused' || event.kind === 'session-restored') return
    if (event.kind === 'wallet-changed') {
      if (event.wallet.session?.status !== 'active') { void stop(); void cancel(); void persist(true).catch(reason => setError(errorMessage(reason))) }
      return
    }
    if (event.kind === 'documents-changed' || event.kind === 'interviews-changed' || event.kind === 'settings-changed') return
    if (event.kind === 'documents-error') { setReferenceError(event.message); return }
    if (event.kind === 'shortcut') { void generate(); return }
    if ((event.kind === 'asr-status' || event.kind === 'transcript') && !asrId.current && statusRef.current === 'connecting') {
      // Main-process events can arrive before startAsr's IPC promise resolves.
      pendingAsrEvents.current = [...pendingAsrEvents.current.slice(-31), event]
      return
    }
    if (event.kind === 'transcript') {
      if (event.sessionId !== asrId.current) return
      updateRecord(current => ({ ...current, segments: mergeTranscript(current.segments, event.segment),
        title: current.title === '未命名会话' ? event.segment.text.slice(0, 32) || current.title : current.title }))
      automatic.coordinator.current?.receive(event.segment)
      return
    }
    if (event.kind === 'asr-status') {
      if (event.sessionId !== asrId.current) return
      if (!stopping.current || event.status === 'stopping') updateStatus(event.status)
      if (event.message) setError(event.message)
      if (event.status === 'error' || event.status === 'idle') {
        asrId.current = null; startedAt.current = null
        void releaseAudio().catch(reason => setError(errorMessage(reason)))
        void persist().catch(reason => setError(errorMessage(reason)))
      }
      return
    }
    if (event.requestId !== requestId.current) return
    if (event.kind === 'answer-context') {
      updateRecord(current => ({ ...current, answers: current.answers.map(answer => answer.id === event.requestId
        ? { ...answer, interviewTarget: event.interviewTarget, retrieval: event.retrieval, interviewEnvironment: event.interviewEnvironment } : answer) }))
      return
    }
    if (event.kind === 'answer-request') {
      updateRecord(current => ({ ...current, answers: current.answers.map(answer => answer.id === event.requestId
        ? { ...answer, modelInput: event.modelInput } : answer) }))
      return
    }
    updateRecord(current => ({ ...current, answers: current.answers.map(answer => {
      if (answer.id !== event.requestId) return answer
      if (event.kind === 'answer-delta') return { ...answer, text: answer.text + event.delta }
      if (event.kind === 'answer-error') return { ...answer, status: 'error', error: event.message }
      return { ...answer, status: event.cancelled ? 'cancelled' : 'complete' }
    }) }))
    if (event.kind !== 'answer-delta') {
      requestId.current = null
      if (event.kind === 'answer-error') automatic.coordinator.current?.acknowledge()
      automatic.coordinator.current?.refresh()
      void persist().catch(reason => setError(errorMessage(reason)))
    }
  }
  const eventHandler = useRef(handleEvent)
  eventHandler.current = handleEvent
  const finishEditingRef = useRef<() => void>(() => undefined)
  finishEditingRef.current = () => { finishAllSegmentEdits(); automatic.coordinator.current?.refresh() }
  useEffect(() => {
    const handleBlur = () => finishEditingRef.current()
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, []) // Switching back to the meeting must release the editing pause, even if the textarea stays active.
  useEffect(() => bridge?.onEvent(event => eventHandler.current(event)), [bridge])
  useEffect(() => {
    let active = true
    bridge?.getHistory().then(records => { if (active) setHistory(records.filter(value => !removedSessionIds.current.has(value.id))) }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge, historyVersion])
  useEffect(() => {
    if (status !== 'listening') return
    const timer = window.setInterval(() => { if (startedAt.current) setElapsed(Date.now() - startedAt.current) }, 1000)
    return () => window.clearInterval(timer)
  }, [status])
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => {
    const timer = window.setInterval(() => { void persistRef.current().catch(reason => setError(errorMessage(reason))) }, 15000)
    const handleUnload = () => { void persistRef.current().catch(() => undefined) }
    window.addEventListener('beforeunload', handleUnload)
    return () => { window.clearInterval(timer); window.removeEventListener('beforeunload', handleUnload) }
  }, []) // Autosave reads the current session through refs; never captures an old session.
  useEffect(() => () => {
    operation.current += 1
    requestId.current = null
    asrId.current = null
    void capture.current?.stop().catch(() => undefined)
    void bridge?.stopAsr().catch(() => undefined)
    void bridge?.cancelAnswer().catch(() => undefined)
    void persistRef.current(true).catch(() => undefined)
  }, [bridge])
  async function reset() {
    if (changingTarget.current || stopping.current || !['idle', 'error'].includes(statusRef.current) || requestId.current) return
    changingTarget.current = true
    try { await persist(); clearSession() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { changingTarget.current = false }
  }
  function clearSession() {
    automatic.coordinator.current?.acknowledge()
    clearTranscriptEdits(); updateRecord(newRecord); setQuestion(''); setElapsed(0); setError('')
    automatic.coordinator.current?.refresh()
  }
  function attachEnvironment() {
    if (!recordRef.current.interviewEnvironment && settingsRef.current.interviewEnvironment) {
      updateRecord(current => ({ ...current, interviewEnvironment: structuredClone(settingsRef.current.interviewEnvironment) }))
    }
  }
  async function changeEnvironment(action: () => Promise<Settings>): Promise<void> {
    if (changingTarget.current) throw new Error('正在切换面试环境，请稍候。')
    if (stopping.current || !['idle', 'error'].includes(statusRef.current) || requestId.current) throw new Error('请先停止转写和回答，再切换或修改当前面试环境。')
    changingTarget.current = true
    try {
      await persist()
      const saved = await action()
      settingsRef.current = saved
      applySettings?.(saved)
      clearSession()
    } finally { changingTarget.current = false }
  }
  async function activateEnvironment(id: string): Promise<void> {
    if (!bridge) throw new Error('请在桌面应用中切换面试环境。')
    await changeEnvironment(() => bridge.activateEnvironment(id))
  }
  async function saveEnvironment(input: EnvironmentInput): Promise<void> {
    if (!bridge) throw new Error('请在桌面应用中保存面试环境。')
    if (input.id && input.id === settingsRef.current.interviewEnvironment?.id) {
      await changeEnvironment(async () => resolveInterviewSettings(settingsRef.current, await bridge.saveEnvironment(input)))
    } else { await bridge.saveEnvironment(input) }
  }
  async function exportRecord(value = recordRef.current, options: SessionExportOptions = { includeAiAnswers: true, includeTranscript: true, includeInterviewInfo: true }) {
    try { await bridge?.exportSession(snapshotForSave(value), options) } catch (reason) { setError(errorMessage(reason)) }
  }
  async function removeSession(id: string): Promise<void> {
    if (!bridge) throw new Error('请在桌面应用中删除会话记录。')
    if (removingSessionId.current || changingTarget.current) throw new Error('正在处理会话，请稍候。')
    const isCurrent = id === recordRef.current.id
    if (isCurrent && (stopping.current || !['idle', 'error'].includes(statusRef.current) || requestId.current)) {
      throw new Error('请先停止转写和回答，再删除当前会话。')
    }
    removingSessionId.current = id
    if (isCurrent) changingTarget.current = true
    try {
      await bridge.removeSession(id)
      removedSessionIds.current.add(id)
      if (isCurrent) { clearSession(); lastSaved.current = null }
      setHistory(records => records.filter(value => value.id !== id))
      setHistoryVersion(version => version + 1)
    } finally {
      removingSessionId.current = null
      if (isCurrent) changingTarget.current = false
    }
  }
  return { record, status, source, setSource, level, question, setQuestion, questionAssembling, appendSegmentToQuestion,
    error: error || referenceError, clearError: () => { setError(''); setReferenceError('') },
    autoAnswer: settings.autoAnswer, autoAnswerState: automatic.state, autoAnswerSaving: automatic.saving,
    setAutoAnswer: automatic.setPreferences, autoAnswerModelReady: isAnswerModelReady(settings),
    historySyncStatus, history, elapsed, busy, start, stop, generate, answerSegment, beginSegmentEdit, editSegment, finishSegmentEdit,
    saveHistory: () => persist(true), cancel, reset, activateEnvironment, saveEnvironment, exportRecord, removeSession, desktop: Boolean(bridge) }
}

export type SessionController = ReturnType<typeof useSession>
