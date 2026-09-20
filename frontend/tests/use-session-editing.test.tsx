// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, type ReactNode } from 'react'
import type { AnswerRequest, AppEvent, DesktopBridge, EnvironmentInput, InterviewLibrary, ModelInputSnapshot, SessionRecord, Settings, SettingsInput, TranscriptSegment } from '../src/shared/types'
import { resolveInterviewSettings } from '../src/shared/interview-settings'
import { defaultSettings } from '../src/shared/defaults'
import { useSession } from '../src/renderer/src/hooks/useSession'

vi.mock('../src/renderer/src/audio/capture', () => ({
  AudioCapture: class {
    start = vi.fn(async () => undefined)
    stop = vi.fn(async () => undefined)
  },
}))

afterEach(() => { cleanup(); vi.useRealTimers() })

function setup(fakeTimers = false) {
  if (fakeTimers) vi.useFakeTimers()
  const settings: Settings = {
    ...structuredClone(defaultSettings),
    asr: { ...defaultSettings.asr, hasApiKey: true },
    llm: { ...defaultSettings.llm, hasApiKey: true },
  }
  const listeners = new Set<(event: AppEvent) => void>()
  let records: SessionRecord[] = []
  let sessionId = 'asr-one'
  const createdAt = new Date().toISOString()
  const library: InterviewLibrary = { resumes: [], targets: [], activeEnvironmentId: 'environment-one', environments: [
    { id: 'environment-one', name: '原环境', interviewType: 'technical' as const, resumeId: null, targetId: null, referenceIds: [], createdAt, updatedAt: createdAt },
    { id: 'environment-two', name: '新环境', interviewType: 'technical' as const, resumeId: null, targetId: null, referenceIds: [], createdAt, updatedAt: createdAt },
  ] }
  const bridge = { invitationSettings: vi.fn(async () => ({ enabled: false, rewardSeconds: 0, version: 0 })), invitationMine: vi.fn(), invitationCreateCode: vi.fn(),
    getPackageCatalog: vi.fn(async () => ({ paymentAvailable: false, paymentMethods: [], packages: [] })),
    getPaymentOrders: vi.fn(async () => []),
    createPaymentOrder: vi.fn(async () => { throw new Error('unused') }),
    refreshPaymentOrder: vi.fn(async () => { throw new Error('unused') }),
    getHistoryPage: vi.fn(async () => ({ records: [], nextCursor: null })),
    getHistoryDetail: vi.fn(async () => { throw new Error('unused') }),
    getHistorySyncStatus: vi.fn(async () => '已同步'),
    getRememberedLogin: vi.fn(async () => null),
    openPaymentCheckout: vi.fn(),
    cancelPaymentOrder: vi.fn(async () => { throw new Error('unused') }),
    getWallet: vi.fn(async () => ({ availableSeconds: 3600, version: 0, serverTime: new Date().toISOString(), session: null })),
    startInterview: vi.fn(async () => ({ availableSeconds: 3600, version: 0, serverTime: new Date().toISOString(), session: null })),
    endInterview: vi.fn(async () => null),
    requestPasswordResetCode: vi.fn(async () => ({ retryAfterSeconds: 60, expiresInSeconds: 600 })), resetPassword: vi.fn(async () => undefined),
    platformRegister: vi.fn(async () => settings), requestEmailCode: vi.fn(async () => ({ retryAfterSeconds: 60, expiresInSeconds: 600 })),
    saveCustomService: vi.fn(async () => settings), testCustomService: vi.fn(async () => ({ latencyMs: 1, message: 'ok' })), removeCustomService: vi.fn(async () => settings),
    platformLogin: vi.fn(async () => settings),
    platformLogout: vi.fn(async () => settings),
    refreshPlatform: vi.fn(async () => settings),
    getCaptureError: vi.fn(async () => null),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (input: SettingsInput) => {
      settings.interviewTarget = input.interviewTarget
      return { ...settings, interviewTarget: input.interviewTarget }
    }),
    testModel: vi.fn(async () => ({ latencyMs: 1, message: 'OK' })),
    importContext: vi.fn(async () => null),
    importTarget: vi.fn(async () => null),
    getInterviewLibrary: vi.fn(async () => structuredClone(library)),
    saveResume: vi.fn(async () => structuredClone(library)),
    removeResume: vi.fn(async () => structuredClone(library)),
    saveTarget: vi.fn(async () => structuredClone(library)),
    removeTarget: vi.fn(async () => structuredClone(library)),
    saveEnvironment: vi.fn(async (input: EnvironmentInput) => {
      library.environments = library.environments.map(value => value.id === input.id ? { ...value, ...input } : value)
      return structuredClone(library)
    }),
    removeEnvironment: vi.fn(async () => structuredClone(library)),
    activateEnvironment: vi.fn(async (id: string) => {
      library.activeEnvironmentId = id
      Object.assign(settings, resolveInterviewSettings(settings, library))
      return structuredClone(settings)
    }),
    testRemoteKnowledge: vi.fn(async () => ({ latencyMs: 1, message: 'OK' })),
    listReferences: vi.fn(async () => []),
    importReferences: vi.fn(async () => []),
    previewReference: vi.fn(async () => { throw new Error('没有测试资料') }),
    updateReference: vi.fn(async () => undefined),
    removeReference: vi.fn(async () => undefined),
    reindexReference: vi.fn(async () => undefined),
    startAsr: vi.fn(async () => ({ sessionId })),
    sendAudio: vi.fn(),
    stopAsr: vi.fn(async () => undefined),
    generateAnswer: vi.fn(async (_request: AnswerRequest): Promise<void> => undefined),
    cancelAnswer: vi.fn(async () => undefined),
    setAlwaysOnTop: vi.fn(async (value: boolean) => value),
    setCompact: vi.fn(async () => undefined),
    getHistory: vi.fn(async () => structuredClone(records)),
    stageSessionForLogout: vi.fn(async () => undefined),
    saveSession: vi.fn(async (record: SessionRecord) => {
      records = [structuredClone(record), ...records.filter(item => item.id !== record.id)]
    }),
    removeSession: vi.fn(async (id: string) => { records = records.filter(record => record.id !== id) }),
    exportSession: vi.fn(async (_record: SessionRecord) => true),
    onEvent: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  } satisfies DesktopBridge
  let action: () => void | Promise<void> = () => undefined
  let actionResult: Promise<void> = Promise.resolve()
  // Drive the hook's public controller from a user event; the real editor is covered by Electron E2E.
  function ControllerDriver({ children }: { children: ReactNode }) {
    return <><button type="button" onClick={() => { actionResult = Promise.resolve(action()) }}>执行会话操作</button>{children}</>
  }
  const user = userEvent.setup()
  const { result, unmount } = renderHook(() => useSession(bridge, settings, bridge.saveSettings, value => { Object.assign(settings, value) }), { wrapper: ControllerDriver })
  async function run(next: () => void | Promise<void>) {
    // Timer-boundary hook tests drive public operations in act without user-event's async timer drain.
    if (fakeTimers) { await act(async () => { await next() }); return }
    action = next
    await user.click(screen.getByRole('button', { name: '执行会话操作' }))
    await actionResult
  }
  async function receive(segment: TranscriptSegment) {
    await run(() => listeners.forEach(listener => listener({ kind: 'transcript', sessionId, segment })))
  }
  async function emit(event: AppEvent) { await run(() => listeners.forEach(listener => listener(event))) }
  return { result, bridge, run, receive, emit, unmount, setAsrSessionId: (value: string) => { sessionId = value } }
}

function segment(text: string, overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return { id: 'sentence-one', text, startMs: 0, isFinal: false, ...overrides }
}

describe('submitting the current question', () => {
  it.each(['complete', 'error'] as const)('clears the submitted draft before IPC settles and preserves the next draft on %s', async outcome => {
    const { result, bridge, run, emit } = setup()
    let resolveRequest: () => void = () => undefined
    let rejectRequest: (error: Error) => void = () => undefined
    bridge.generateAnswer.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject }))
    await run(() => result.current.setQuestion('  如何处理缓存失效？  '))
    let pending: Promise<void> = Promise.resolve()
    await run(() => { pending = result.current.generate() })
    expect(result.current.question).toBe('')
    expect(bridge.generateAnswer.mock.calls[0][0].question).toBe('如何处理缓存失效？')
    expect(result.current.record.answers[0]).toMatchObject({ question: '如何处理缓存失效？', status: 'streaming' })
    await run(() => result.current.setQuestion('下一题：如何监控命中率？'))
    await run(async () => {
      if (outcome === 'complete') resolveRequest()
      else rejectRequest(new Error('模拟连接失败'))
      await pending
    })
    if (outcome === 'complete') await emit({ kind: 'answer-done', requestId: bridge.generateAnswer.mock.calls[0][0].requestId, cancelled: false })
    expect(result.current.question).toBe('下一题：如何监控命中率？')
    expect(result.current.record.answers[0]).toMatchObject({ question: '如何处理缓存失效？', status: outcome })
    await run(() => result.current.generate())
    expect(bridge.generateAnswer.mock.calls[1][0].question).toBe('下一题：如何监控命中率？')
    expect(result.current.question).toBe('')
  })

  it('preserves the draft when the model is not configured', async () => {
    const { result, bridge, run } = setup()
    const settings = await bridge.getSettings()
    settings.llm.hasApiKey = false
    await run(() => result.current.setQuestion('配置好模型后再问的问题'))
    await run(() => result.current.generate())
    expect(result.current.question).toBe('配置好模型后再问的问题')
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    expect(result.current.record.answers).toEqual([])
  })

  it.each([false, true])('preserves a separate composer draft for a selected question (automatic: %s)', async automatic => {
    const { result, bridge, run } = setup()
    await run(() => result.current.setQuestion('我正在准备的下一题'))
    await run(() => result.current.generate({ question: '面试官的当前问题？', transcript: '面试官的当前问题？' }, automatic))
    expect(result.current.question).toBe('我正在准备的下一题')
    expect(bridge.generateAnswer.mock.calls[0][0].question).toBe('面试官的当前问题？')
  })
})

describe('assembling transcript segments into one question', () => {
  it('appends in click order without losing existing text or rapid additions before React rerenders', async () => {
    const { result, bridge, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('第一段问题', { isFinal: true }))
    await receive(segment('第二段补充', { id: 'sentence-two', isFinal: true }))
    await run(() => result.current.setQuestion('已有的手动说明'))
    await run(() => {
      expect(result.current.appendSegmentToQuestion('sentence-two')).toBe(true)
      expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(true)
    })
    expect(result.current.question).toBe('已有的手动说明\n第二段补充\n第一段问题')
    expect(result.current.questionAssembling).toBe(true)
    expect(result.current.autoAnswer.enabled).toBe(true)
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    expect(bridge.saveSettings).not.toHaveBeenCalled()
  })

  it('uses the visible interim edit snapshot before blur and never rewrites an appended draft', async () => {
    const { result, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('你如何处理换存'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await receive(segment('你如何处理缓存失效？', { isFinal: true, endMs: 1000 }))
    await run(() => {
      expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(true)
      result.current.finishSegmentEdit('sentence-one')
    })
    expect(result.current.record.segments[0].text).toBe('你如何处理缓存失效？')
    expect(result.current.question).toBe('你如何处理换存')
    await run(() => result.current.editSegment('sentence-one', '你如何处理 Redis 缓存失效？'))
    expect(result.current.question).toBe('你如何处理换存')
  })

  it('rejects empty, stale, and oversized additions without starting assembly or truncating the draft', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment(' \n '))
    await run(() => {
      expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(false)
      expect(result.current.appendSegmentToQuestion('missing-id')).toBe(false)
    })
    expect(result.current.questionAssembling).toBe(false)
    await receive(segment('补充', { isFinal: true }))
    await run(() => result.current.setQuestion('字'.repeat(12000)))
    await run(() => { expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(false) })
    expect(result.current.question).toBe('字'.repeat(12000))
    expect(result.current.questionAssembling).toBe(false)
    expect(result.current.error).toContain('12,000')
    await run(() => result.current.setQuestion('字'.repeat(11997)))
    await run(() => { expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(true) })
    expect(result.current.question).toHaveLength(12000)
    expect(result.current.questionAssembling).toBe(true)
    expect(result.current.error).toBe('')
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
  })

  it('cancels a nearly due silence timer synchronously and remains paused through new speech and window blur', async () => {
    const { result, run, receive, bridge } = setup(true)
    await run(() => result.current.start())
    await receive(segment('请介绍项目架构？', { isFinal: true, endMs: 1000 }))
    await run(() => { vi.advanceTimersByTime(1499) })
    await run(() => {
      expect(result.current.appendSegmentToQuestion('sentence-one')).toBe(true)
      vi.advanceTimersByTime(2)
    })
    await receive(segment('其中有哪些难点？', { id: 'sentence-two', isFinal: true, endMs: 2000 }))
    await run(() => { window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(4000) })
    expect(result.current.status).toBe('listening')
    expect(result.current.questionAssembling).toBe(true)
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    expect(bridge.stopAsr).not.toHaveBeenCalled()
  })

  it.each(['submit', 'clear'] as const)('resumes on %s without sending old interim revisions, then answers a new segment', async action => {
    const { result, run, receive, emit, bridge } = setup(true)
    await run(() => result.current.start())
    await receive(segment('请介绍项目架构？', { isFinal: true, endMs: 1000 }))
    await run(() => { result.current.appendSegmentToQuestion('sentence-one') })
    await receive(segment('其中的难点', { id: 'sentence-two' }))
    await run(() => { result.current.appendSegmentToQuestion('sentence-two'); vi.advanceTimersByTime(3000) })
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    if (action === 'submit') {
      await run(() => result.current.generate())
      const request = bridge.generateAnswer.mock.calls[0][0]
      expect(request.question).toBe('请介绍项目架构？\n其中的难点')
      await emit({ kind: 'answer-done', requestId: request.requestId, cancelled: false })
    } else await run(() => result.current.setQuestion(' \n '))
    expect(result.current.question.trim()).toBe('')
    expect(result.current.questionAssembling).toBe(false)
    const submitted = action === 'submit' ? 1 : 0
    await receive(segment('其中的难点是什么？', { id: 'sentence-two', isFinal: true, endMs: 2000 }))
    await run(() => { vi.advanceTimersByTime(2000) })
    expect(bridge.generateAnswer).toHaveBeenCalledTimes(submitted)
    await receive(segment('新问题：如何设计监控？', { id: 'sentence-three', isFinal: true, endMs: 3000 }))
    await run(() => { vi.advanceTimersByTime(1500) })
    expect(bridge.generateAnswer).toHaveBeenCalledTimes(submitted + 1)
    expect(bridge.generateAnswer.mock.calls.at(-1)?.[0].question).toBe('新问题：如何设计监控？')
  })

  it('keeps assembly paused when an older answer completes, a sentence is answered, or generation is cancelled', async () => {
    const { result, run, receive, emit, bridge } = setup(true)
    await run(() => result.current.start())
    await run(() => result.current.setQuestion('上一题'))
    await run(() => result.current.generate())
    const oldRequest = bridge.generateAnswer.mock.calls[0][0]
    await receive(segment('这次项目如何设计？', { isFinal: true, endMs: 1000 }))
    await run(() => { result.current.appendSegmentToQuestion('sentence-one') })
    await receive(segment('如何保证稳定性？', { id: 'sentence-two', isFinal: true, endMs: 2000 }))
    await emit({ kind: 'answer-done', requestId: oldRequest.requestId, cancelled: false })
    await run(() => { vi.advanceTimersByTime(3000) })
    expect(bridge.generateAnswer).toHaveBeenCalledTimes(1)
    await run(() => result.current.answerSegment('sentence-two'))
    await run(() => result.current.cancel())
    await run(() => { vi.advanceTimersByTime(3000) })
    expect(bridge.generateAnswer).toHaveBeenCalledTimes(2)
    expect(result.current.question).toBe('这次项目如何设计？')
    expect(result.current.questionAssembling).toBe(true)
  })

  it('keeps the assembled draft paused when model validation fails and releases it after a valid submission', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('请介绍你的项目？', { isFinal: true, endMs: 1000 }))
    await run(() => { result.current.appendSegmentToQuestion('sentence-one') })
    const settings = await bridge.getSettings()
    settings.llm.hasApiKey = false
    await run(() => result.current.generate())
    expect(result.current.questionAssembling).toBe(true)
    expect(result.current.question).toBe('请介绍你的项目？')
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    settings.llm.hasApiKey = true
    await run(() => result.current.generate())
    expect(result.current.questionAssembling).toBe(false)
    expect(result.current.question).toBe('')
  })

  it.each(['reset', 'environment', 'delete'] as const)('keeps assembly through transcription stop and clears it with %s', async action => {
    const { result, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('旧会话的问题', { isFinal: true, endMs: 1000 }))
    await run(() => { result.current.appendSegmentToQuestion('sentence-one') })
    await run(() => result.current.stop())
    expect(result.current.questionAssembling).toBe(true)
    if (action === 'reset') await run(() => result.current.reset())
    else if (action === 'environment') await run(() => result.current.activateEnvironment('environment-two'))
    else await run(() => result.current.removeSession(result.current.record.id))
    expect(result.current.questionAssembling).toBe(false)
    expect(result.current.question).toBe('')
    expect(result.current.record.segments).toEqual([])
  })
})

describe('editing a live transcript through the session controller', () => {
  it('deletes the idle current session without resaving it and creates a fresh workspace', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.activateEnvironment('environment-one'))
    await run(() => result.current.start())
    await receive(segment('需要删除的转写', { isFinal: true, endMs: 1000 }))
    await run(() => result.current.stop())
    const id = result.current.record.id
    await run(() => result.current.setQuestion('旧草稿'))
    const saves = bridge.saveSession.mock.calls.length
    await run(() => result.current.removeSession(id))
    expect(bridge.removeSession).toHaveBeenCalledExactlyOnceWith(id)
    expect(result.current.record.id).not.toBe(id)
    expect(result.current.record.segments).toEqual([])
    expect(result.current.question).toBe('')
    expect(bridge.saveSession).toHaveBeenCalledTimes(saves)
    await waitFor(() => expect(result.current.history.some(record => record.id === id)).toBe(false))
    await run(() => result.current.setQuestion('新的问题'))
    await run(() => result.current.generate())
    expect(bridge.generateAnswer.mock.calls.at(-1)?.[0].environmentId).toBe('environment-one')
  })

  it('preserves a failed deletion and allows retry without clearing the active draft', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('应保留的转写', { isFinal: true, endMs: 1000 }))
    await run(() => result.current.stop())
    await run(() => result.current.setQuestion('应保留的草稿'))
    const original = result.current.record
    bridge.removeSession.mockRejectedValueOnce(new Error('磁盘写入失败'))
    await run(async () => { await expect(result.current.removeSession(original.id)).rejects.toThrow('磁盘写入失败') })
    expect(result.current.record).toEqual(original)
    expect(result.current.question).toBe('应保留的草稿')
    await run(() => result.current.removeSession(original.id))
    expect(result.current.record.id).not.toBe(original.id)
  })

  it('blocks current deletion during recording or generation but permits unrelated history deletion', async () => {
    const { result, run, bridge } = setup()
    const id = result.current.record.id
    await run(() => result.current.start())
    await run(async () => { await expect(result.current.removeSession(id)).rejects.toThrow('停止转写和回答') })
    await run(() => result.current.removeSession('old-session'))
    expect(result.current.record.id).toBe(id)
    expect(result.current.status).toBe('listening')
    await run(() => result.current.stop())
    await run(() => result.current.setQuestion('生成中的问题'))
    await run(() => result.current.generate())
    await run(async () => { await expect(result.current.removeSession(id)).rejects.toThrow('停止转写和回答') })
    expect(bridge.removeSession).toHaveBeenCalledExactlyOnceWith('old-session')
    expect(bridge.cancelAnswer).not.toHaveBeenCalled()
  })

  it.each(['focus', 'change'] as const)('hands a pending question to manual control on %s without preventing sentence answers', async action => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('如何设计缓存？', { isFinal: true, endMs: 1000 }))
    expect(result.current.autoAnswerState).toBe('waiting')
    await run(() => action === 'focus'
      ? result.current.beginSegmentEdit('sentence-one')
      : result.current.editSegment('sentence-one', '如何设计 Redis 缓存？'))
    expect(result.current.autoAnswerState).toBe('manual')
    await run(() => { window.dispatchEvent(new Event('blur')) })
    expect(result.current.autoAnswerState).toBe('manual')
    await receive(segment('如何设计分布式缓存？', { isFinal: true, endMs: 1200 }))
    expect(result.current.autoAnswerState).toBe('manual')
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    const visible = result.current.record.segments[0].text
    await run(() => result.current.answerSegment('sentence-one'))
    expect(bridge.generateAnswer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ question: visible }))
  })

  it('freezes a focused sentence and applies the newest recognition on blur when no edit was made', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('如何设计换存'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await receive(segment('如何设计缓存'))
    await receive(segment('如何设计缓存一致性？', { isFinal: true, endMs: 2000 }))
    expect(result.current.record.segments[0].text).toBe('如何设计换存')
    expect(result.current.record.segments[0].isEdited).not.toBe(true)

    await run(() => result.current.finishSegmentEdit('sentence-one'))
    await waitFor(() => expect(result.current.record.segments[0]).toMatchObject({ text: '如何设计缓存一致性？', isFinal: true, endMs: 2000 }))
    expect(result.current.record.segments[0].isEdited).not.toBe(true)
    await waitFor(() => expect(bridge.saveSession).toHaveBeenCalled())
    expect(bridge.saveSession.mock.calls.at(-1)?.[0].segments[0].text).toBe('如何设计缓存一致性？')
  })

  it('immediately records manual text and keeps it when ASR finalizes or revises the sentence', async () => {
    const { result, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('解释下 ready 的使用'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await run(() => result.current.editSegment('sentence-one', '解释一下 Redis 的使用'))
    expect(result.current.record.segments[0]).toMatchObject({ text: '解释一下 Redis 的使用', isEdited: true })
    await receive(segment('解释一下瑞迪斯的使用', { isFinal: true, endMs: 1500 }))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    expect(result.current.record.segments[0]).toMatchObject({ text: '解释一下 Redis 的使用', isEdited: true, isFinal: true, endMs: 1500 })

    await receive(segment('服务端再次修订', { isFinal: true, endMs: 1700 }))
    expect(result.current.record.segments[0]).toMatchObject({ text: '解释一下 Redis 的使用', isEdited: true, isFinal: true, endMs: 1700 })
  })

  it('allows deliberate empty text without restoring the ASR version or submitting an empty question', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('不需要的背景噪声'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await run(() => result.current.editSegment('sentence-one', ''))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    await receive(segment('不需要的背景噪声。', { isFinal: true, endMs: 800 }))
    expect(result.current.record.segments[0]).toMatchObject({ text: '', isEdited: true, isFinal: true, endMs: 800 })
    await run(() => result.current.answerSegment('sentence-one'))
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].segments[0]).toMatchObject({ text: '', isEdited: true }))
  })

  it('keeps appending other sentences while one sentence is being edited', async () => {
    const { result, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('第一个问题'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await receive(segment('第一个问题的ASR修订'))
    await receive(segment('第二个问题', { id: 'sentence-two', startMs: 2000, endMs: 3000, isFinal: true }))
    expect(result.current.record.segments.map(value => value.text)).toEqual(['第一个问题', '第二个问题'])
    await run(() => result.current.editSegment('sentence-one', '修改后的第一个问题'))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    expect(result.current.record.segments.map(value => value.text)).toEqual(['修改后的第一个问题', '第二个问题'])
  })

  it('uses edited text as the question and context for both sentence answers and normal generation', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('我们正在讨论分布式换存', { isFinal: true, endMs: 1000 }))
    await receive(segment('怎么保证换存一致性？', { id: 'sentence-two', startMs: 1100, isFinal: true, endMs: 2200 }))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await run(() => result.current.editSegment('sentence-one', '我们正在讨论分布式缓存'))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    await run(() => result.current.beginSegmentEdit('sentence-two'))
    await run(() => result.current.editSegment('sentence-two', '怎么保证缓存一致性？'))
    await run(() => result.current.finishSegmentEdit('sentence-two'))
    await run(() => result.current.answerSegment('sentence-two'))
    expect(bridge.generateAnswer.mock.calls.at(-1)?.[0]).toMatchObject({
      question: '怎么保证缓存一致性？', transcript: '我们正在讨论分布式缓存\n怎么保证缓存一致性？',
    })

    await run(() => result.current.cancel())
    await run(() => result.current.generate())
    expect(bridge.generateAnswer.mock.calls.at(-1)?.[0]).toMatchObject({
      question: '我们正在讨论分布式缓存\n怎么保证缓存一致性？', transcript: '我们正在讨论分布式缓存\n怎么保证缓存一致性？',
    })
    expect(result.current.record.answers.map(answer => answer.question).join('\n')).not.toContain('换存')
  })

  it('automatically saves edits on blur and uses them in history and export', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('介绍一下卡夫卡', { isFinal: true, endMs: 1000 }))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await run(() => result.current.editSegment('sentence-one', '介绍一下 Kafka'))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    await waitFor(() => expect(result.current.history[0]?.segments[0]).toMatchObject({ text: '介绍一下 Kafka', isEdited: true }))
    expect(bridge.saveSession.mock.calls.at(-1)?.[0].segments[0]).toMatchObject({ text: '介绍一下 Kafka', isEdited: true })
    await run(() => result.current.exportRecord())
    expect(bridge.exportSession.mock.calls.at(-1)?.[0].segments[0]).toMatchObject({ text: '介绍一下 Kafka', isEdited: true })
  })

  it('saves and exports pending final recognition on stop without disturbing an unchanged focused sentence', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.start())
    await receive(segment('如何设计换存'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await receive(segment('如何设计缓存一致性？', { isFinal: true, endMs: 2300 }))
    expect(result.current.record.segments[0].text).toBe('如何设计换存')

    await run(() => result.current.stop())
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].segments[0]).toMatchObject({
      text: '如何设计缓存一致性？', isFinal: true, endMs: 2300,
    }))
    await waitFor(() => expect(result.current.history[0]?.segments[0]).toMatchObject({ text: '如何设计缓存一致性？', isFinal: true }))
    expect(result.current.record.segments[0].text).toBe('如何设计换存')
    expect(result.current.record.segments[0].isEdited).not.toBe(true)

    await run(() => result.current.exportRecord())
    expect(bridge.exportSession.mock.calls.at(-1)?.[0].segments[0]).toMatchObject({
      text: '如何设计缓存一致性？', isFinal: true, endMs: 2300,
    })
    expect(result.current.record.segments[0].text).toBe('如何设计换存')
  })

  it('drops unfinished edit buffers when starting a new record', async () => {
    const { result, run, receive, setAsrSessionId } = setup()
    await run(() => result.current.start())
    await receive(segment('上一场面试的问题'))
    await run(() => result.current.beginSegmentEdit('sentence-one'))
    await receive(segment('上一场尚未合入的修订', { isFinal: true, endMs: 1600 }))
    await run(() => result.current.stop())
    const previousRecordId = result.current.record.id
    await run(() => result.current.reset())
    expect(result.current.record.id).not.toBe(previousRecordId)
    expect(result.current.record.segments).toEqual([])

    setAsrSessionId('asr-two')
    await run(() => result.current.start())
    // Reusing a segment id in another record must not revive the old record's edit buffer.
    await receive(segment('新会话的问题', { isFinal: true, endMs: 1200 }))
    await run(() => result.current.finishSegmentEdit('sentence-one'))
    expect(result.current.record.segments).toHaveLength(1)
    expect(result.current.record.segments[0]).toMatchObject({ text: '新会话的问题', isFinal: true, endMs: 1200 })
    expect(result.current.record.segments[0].isEdited).not.toBe(true)
  })
})

describe('environment switching and answer reference snapshots', () => {
  it('saves old transcript before entering another environment and clears the old question', async () => {
    const { result, bridge, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('旧公司面试问题', { isFinal: true, endMs: 1000 }))
    await run(() => result.current.stop())
    await run(() => result.current.setQuestion('尚未提交的旧问题'))
    const oldId = result.current.record.id
    await run(() => result.current.activateEnvironment('environment-two'))
    expect(bridge.activateEnvironment).toHaveBeenCalledWith('environment-two')
    expect(bridge.saveSession.mock.calls.at(-1)?.[0].segments[0].text).toBe('旧公司面试问题')
    expect(result.current.record.id).not.toBe(oldId)
    expect(result.current.record.segments).toEqual([])
    expect(result.current.question).toBe('')
    await run(() => result.current.generate())
    expect(bridge.generateAnswer).not.toHaveBeenCalled()
  })

  it('keeps the old session and target when history save fails', async () => {
    const { result, bridge, run, receive } = setup()
    await run(() => result.current.start())
    await receive(segment('应保留的问题', { isFinal: true, endMs: 1000 }))
    bridge.saveSession.mockRejectedValue(new Error('保存失败'))
    await run(() => result.current.stop())
    const oldId = result.current.record.id
    await run(async () => {
      await expect(result.current.activateEnvironment('environment-two')).rejects.toThrow('保存失败')
    })
    expect(result.current.record.id).toBe(oldId)
    expect(result.current.record.segments[0].text).toBe('应保留的问题')
    expect(bridge.activateEnvironment).not.toHaveBeenCalled()
  })

  it('blocks environment switches during recording and preserves the running conversation', async () => {
    const { result, run, bridge } = setup()
    await run(() => result.current.start())
    await run(async () => {
      await expect(result.current.activateEnvironment('environment-two')).rejects.toThrow('停止转写')
    })
    expect(bridge.activateEnvironment).not.toHaveBeenCalled()
    expect(result.current.status).toBe('listening')
  })

  it('attaches context only to its matching answer without ending the stream or accepting stale context', async () => {
    const { result, run, bridge, emit } = setup()
    await run(() => result.current.setQuestion('缓存一致性？'))
    await run(() => result.current.generate())
    const id = bridge.generateAnswer.mock.calls[0][0].requestId
    const target = { companyName: '生成时公司', roleName: '后端', jobDescription: '原 JD' }
    const retrieval = { status: 'ready' as const, excerpts: [{ documentId: 'doc', revision: 1, name: '资料.pdf', kind: 'technical' as const, chunkId: 'chunk', text: '缓存一致性资料', pageStart: 1, pageEnd: 1 }] }
    await emit({ kind: 'answer-context', requestId: 'stale', interviewTarget: target, retrieval })
    expect(result.current.record.answers[0].retrieval).toBeUndefined()
    await emit({ kind: 'answer-context', requestId: id, interviewTarget: target, retrieval })
    expect(result.current.busy).toBe(true)
    expect(result.current.record.answers[0].retrieval).toEqual(retrieval)
    await emit({ kind: 'answer-delta', requestId: id, delta: '我会先更新数据库。' })
    await emit({ kind: 'answer-done', requestId: id, cancelled: false })
    expect(result.current.record.answers[0].interviewTarget).toEqual(target)
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].answers[0].retrieval).toEqual(retrieval))
    await emit({ kind: 'answer-context', requestId: id, interviewTarget: { ...target, companyName: '后来的公司' }, retrieval })
    expect(result.current.record.answers[0].interviewTarget).toEqual(target)
  })

  it('preserves the old conversation and draft if activation fails', async () => {
    const { result, run, bridge } = setup()
    await run(() => result.current.setQuestion('保留这个草稿'))
    const oldId = result.current.record.id
    bridge.activateEnvironment.mockRejectedValueOnce(new Error('写入失败'))
    await run(async () => { await expect(result.current.activateEnvironment('environment-two')).rejects.toThrow('写入失败') })
    expect(result.current.record.id).toBe(oldId)
    expect(result.current.question).toBe('保留这个草稿')
  })

  it('archives the environment snapshot before modifying its selected materials', async () => {
    const { result, run, receive, bridge } = setup()
    await run(() => result.current.activateEnvironment('environment-one'))
    await run(() => result.current.start())
    await receive(segment('只属于原环境的问题', { isFinal: true, endMs: 1000 }))
    const input = { id: 'environment-one', name: '修改后的环境', interviewType: 'technical' as const, resumeId: null, targetId: null, referenceIds: [] }
    await run(async () => { await expect(result.current.saveEnvironment(input)).rejects.toThrow('停止转写') })
    expect(bridge.saveEnvironment).not.toHaveBeenCalled()
    await run(() => result.current.stop())
    await run(() => result.current.saveEnvironment(input))
    expect(bridge.saveSession.mock.calls.at(-1)?.[0].interviewEnvironment?.name).toBe('原环境')
    expect(result.current.record.segments).toEqual([])
    await run(() => result.current.setQuestion('新的问题'))
    await run(() => result.current.generate())
    expect(bridge.generateAnswer.mock.calls.at(-1)?.[0].environmentId).toBe('environment-one')
    expect(result.current.record.interviewEnvironment?.name).toBe('修改后的环境')
  })

  it('does not treat interview-library notifications as answer completion', async () => {
    const { result, run, emit, bridge } = setup()
    await run(() => result.current.setQuestion('解释数据库索引'))
    await run(() => result.current.generate())
    const requestId = bridge.generateAnswer.mock.calls[0][0].requestId
    await emit({ kind: 'interviews-changed' })
    await emit({ kind: 'settings-changed' })
    expect(result.current.busy).toBe(true)
    await run(async () => { await expect(result.current.activateEnvironment('environment-two')).rejects.toThrow('停止转写和回答') })
    expect(bridge.activateEnvironment).not.toHaveBeenCalled()
    await emit({ kind: 'answer-delta', requestId, delta: '我会先看查询条件。' })
    await emit({ kind: 'answer-done', requestId, cancelled: false })
    expect(result.current.record.answers[0].text).toBe('我会先看查询条件。')
  })
})

describe('actual model input attached to an answer', () => {
  function modelInput(question: string): ModelInputSnapshot {
    return { model: 'test-model', messages: [
      { role: 'system', content: '用第一人称直接回答。' },
      { role: 'user', content: JSON.stringify({ personalContext: '生成时的个人背景', question }) },
    ] }
  }

  it('keeps streaming after its input arrives and saves that input with the completed answer', async () => {
    const { result, run, bridge, emit } = setup()
    await run(() => result.current.setQuestion('缓存一致性？'))
    await run(() => result.current.generate())
    const id = bridge.generateAnswer.mock.calls[0][0].requestId
    const input = modelInput('缓存一致性？')
    await emit({ kind: 'answer-request', requestId: 'stale-request', modelInput: input })
    expect(result.current.record.answers[0].modelInput).toBeUndefined()
    await emit({ kind: 'answer-request', requestId: id, modelInput: input })
    expect(result.current.busy).toBe(true)
    expect(result.current.record.answers[0]).toMatchObject({ modelInput: input, status: 'streaming', text: '' })
    expect(bridge.saveSession).not.toHaveBeenCalled()

    await emit({ kind: 'answer-delta', requestId: id, delta: '我会先更新数据库，' })
    expect(result.current.busy).toBe(true)
    await emit({ kind: 'answer-delta', requestId: id, delta: '再删除缓存。' })
    await emit({ kind: 'answer-done', requestId: id, cancelled: false })
    expect(result.current.busy).toBe(false)
    expect(result.current.record.answers[0]).toMatchObject({ modelInput: input, status: 'complete', text: '我会先更新数据库，再删除缓存。' })
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].answers[0].modelInput).toEqual(input))
    await emit({ kind: 'answer-request', requestId: id, modelInput: modelInput('完成后的过期输入') })
    expect(result.current.record.answers[0].modelInput).toEqual(input)
  })

  it('keeps superseded input on its original answer and ignores stale events for the new request', async () => {
    const { result, run, bridge, emit } = setup()
    await run(() => result.current.setQuestion('第一个问题'))
    await run(() => result.current.generate())
    const firstId = bridge.generateAnswer.mock.calls[0][0].requestId
    const firstInput = modelInput('第一个问题')
    await emit({ kind: 'answer-request', requestId: firstId, modelInput: firstInput })
    await emit({ kind: 'answer-delta', requestId: firstId, delta: '先前部分回答' })
    await run(() => result.current.setQuestion('第二个问题'))
    await run(() => result.current.generate())
    const secondId = bridge.generateAnswer.mock.calls[1][0].requestId
    await emit({ kind: 'answer-request', requestId: firstId, modelInput: modelInput('过期输入') })
    await emit({ kind: 'answer-delta', requestId: firstId, delta: '过期回答' })
    await emit({ kind: 'answer-done', requestId: firstId, cancelled: true })
    expect(result.current.busy).toBe(true)
    expect(result.current.record.answers[0]).toMatchObject({ modelInput: firstInput, text: '先前部分回答', status: 'cancelled' })
    expect(result.current.record.answers[1].modelInput).toBeUndefined()

    const secondInput = modelInput('第二个问题')
    await emit({ kind: 'answer-request', requestId: secondId, modelInput: secondInput })
    await emit({ kind: 'answer-delta', requestId: secondId, delta: '第二个回答' })
    await emit({ kind: 'answer-done', requestId: secondId, cancelled: false })
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].answers.map(answer => answer.modelInput)).toEqual([firstInput, secondInput]))
    expect(result.current.record.answers[1].text).toBe('第二个回答')
  })

  it.each(['error', 'cancelled'] as const)('keeps the submitted input available when an answer is %s', async (status) => {
    const { result, run, bridge, emit } = setup()
    await run(() => result.current.setQuestion('解释一下缓存'))
    await run(() => result.current.generate())
    const id = bridge.generateAnswer.mock.calls[0][0].requestId
    const input = modelInput('解释一下缓存')
    await emit({ kind: 'answer-request', requestId: id, modelInput: input })
    await emit({ kind: 'answer-delta', requestId: id, delta: '已经返回的文字' })
    if (status === 'error') await emit({ kind: 'answer-error', requestId: id, message: '服务暂时不可用' })
    else await run(() => result.current.cancel())
    expect(result.current.busy).toBe(false)
    expect(result.current.record.answers[0]).toMatchObject({ status, modelInput: input, text: '已经返回的文字' })
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].answers[0]).toMatchObject({ status, modelInput: input }))
  })
})


describe('final session snapshot on authentication gate unmount', () => {
  it('preserves completed answers and finalizes partial output/input as cancelled even if the old IPC rejects later', async () => {
    const { result, bridge, run, emit, unmount } = setup()
    await run(() => result.current.setQuestion('已完成的问题'))
    await run(() => result.current.generate())
    const first = bridge.generateAnswer.mock.calls[0][0].requestId
    await emit({ kind: 'answer-delta', requestId: first, delta: '完整回答' })
    await emit({ kind: 'answer-done', requestId: first, cancelled: false })
    let rejectRequest: (error: Error) => void = () => undefined
    bridge.generateAnswer.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectRequest = reject }))
    await run(() => result.current.setQuestion('还在生成的问题'))
    let pending: Promise<void> = Promise.resolve()
    await run(() => { pending = result.current.generate() })
    const second = bridge.generateAnswer.mock.calls[1][0].requestId
    const modelInput: ModelInputSnapshot = { model: 'actual-model', messages: [{ role: 'user', content: '本次发送的完整问题' }] }
    await emit({ kind: 'answer-request', requestId: second, modelInput })
    await emit({ kind: 'answer-delta', requestId: second, delta: '已收到的部分回答' })
    unmount()
    await waitFor(() => expect(bridge.saveSession.mock.calls.at(-1)?.[0].answers.map(answer => answer.status)).toEqual(['complete', 'cancelled']))
    const final = bridge.saveSession.mock.calls.at(-1)?.[0]
    expect(final?.answers[1]).toMatchObject({ text: '已收到的部分回答', modelInput, status: 'cancelled' })
    expect(bridge.cancelAnswer).toHaveBeenCalledOnce()
    const writes = bridge.saveSession.mock.calls.length
    await act(async () => { rejectRequest(new Error('退出后返回的过期网络错误')); await pending })
    expect(bridge.saveSession).toHaveBeenCalledTimes(writes)
    expect((await bridge.getHistory())[0].answers[1].status).toBe('cancelled')
  })
})

describe('forced sign-out draft handshake', () => {
  it('stages the latest interrupted answer locally before the workbench is unmounted', async () => {
    const { result, bridge, run, emit } = setup()
    await run(() => result.current.setQuestion('如何处理并发登录？'))
    await run(() => result.current.generate())
    const requestId = result.current.record.answers[0].id
    await emit({ kind: 'answer-delta', requestId, delta: '可以使用数据库事务' })
    await emit({ kind: 'session-stopping', nonce: 'shutdown-nonce' })
    await waitFor(() => expect(bridge.stageSessionForLogout).toHaveBeenCalledWith('shutdown-nonce', expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ text: '可以使用数据库事务', status: 'cancelled' })])
    })))
  })
})
