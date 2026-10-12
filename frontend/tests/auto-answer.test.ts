import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../src/shared/types'
import { AutoAnswerCoordinator, type AutoAnswerSnapshot, type AutoAnswerState } from '../src/renderer/src/hooks/autoAnswerCoordinator'

const coordinators: AutoAnswerCoordinator[] = []
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-07T10:00:00Z')) })
afterEach(() => { coordinators.splice(0).forEach(value => value.dispose()); vi.useRealTimers() })

function segment(id: string, text: string, isFinal = true): TranscriptSegment {
  return { id, text, startMs: 0, ...(isFinal ? { endMs: 1000 } : {}), isFinal }
}
function setup(initial: Partial<AutoAnswerSnapshot> = {}) {
  const snapshot: AutoAnswerSnapshot = { active: true, busy: false, editing: false, pauseMs: 1500, segments: [], ...initial }
  const answer = vi.fn<(selection: { question: string; transcript: string }) => void>()
  const onState = vi.fn<(state: AutoAnswerState) => void>()
  const coordinator = new AutoAnswerCoordinator({ read: () => snapshot, answer, onState })
  coordinators.push(coordinator)
  function receive(incoming: TranscriptSegment, displayed = incoming) {
    const index = snapshot.segments.findIndex(value => value.id === incoming.id)
    snapshot.segments = index === -1 ? [...snapshot.segments, displayed] : snapshot.segments.map(value => value.id === incoming.id ? displayed : value)
    coordinator.receive(incoming)
  }
  return { snapshot, answer, onState, coordinator, receive }
}

describe('automatic answers after a finished interviewer question', () => {
  it.each(['嗯', '嗯嗯。', '嗯，好的，对。', '明白了', '是的', '没错', '哦！', '行，懂了，好吧', 'OK', 'Okay, yeah.', 'uh-huh', 'ｍｍ－ｈｍｍ'])('ignores pure feedback without removing its transcript: %s', text => {
    const { snapshot, receive, answer, onState, coordinator } = setup()
    receive(segment('feedback', text))
    vi.advanceTimersByTime(1500)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('listening')
    expect(snapshot.segments[0].text).toBe(text)
    coordinator.refresh()
    receive(segment('feedback', text))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('next', '为什么？'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: '为什么？', transcript: `${text}\n为什么？` })
  })

  it.each(['嗯，你具体怎么实现的？', '好，继续', '然后呢', '谁？', '为什么', '继续', '展开讲讲', '是吗？', '嗯？', '对比一下', '不对', '好的方案是什么'])('preserves short follow-ups and mixed utterances: %s', text => {
    const { receive, answer } = setup()
    receive(segment('question', text))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: text, transcript: text })
  })

  it('allows partial feedback to expand into a real question before finalization', () => {
    const { receive, answer } = setup()
    receive(segment('one', '嗯', false))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('one', '嗯，你具体怎么实现的？'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toBe('嗯，你具体怎么实现的？')
  })

  it('allows a final feedback packet to be revised into a question during the quiet period', () => {
    const { receive, answer } = setup()
    receive(segment('one', '嗯'))
    vi.advanceTimersByTime(1000)
    receive(segment('one', '嗯，展开讲讲'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toBe('嗯，展开讲讲')
  })

  it('removes feedback from an aggregated question while retaining the complete transcript', () => {
    const { receive, answer } = setup()
    receive(segment('before', '嗯'))
    receive(segment('question', '如何保证一致性？'))
    receive(segment('after', '对，好的'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: '如何保证一致性？', transcript: '嗯\n如何保证一致性？\n对，好的' })
  })

  it('does not queue feedback during generation or delay a subsequent real question', () => {
    const { snapshot, receive, coordinator, answer, onState } = setup({ busy: true })
    receive(segment('feedback', '嗯，好'))
    vi.advanceTimersByTime(1500)
    expect(onState).toHaveBeenLastCalledWith('listening')
    snapshot.busy = false
    coordinator.refresh()
    expect(answer).not.toHaveBeenCalled()
    receive(segment('next', '然后呢？'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toBe('然后呢？')
  })

  it('keeps a real queued question when feedback arrives before generation completes', () => {
    const { snapshot, receive, coordinator, answer } = setup({ busy: true })
    receive(segment('question', '为什么？'))
    vi.advanceTimersByTime(1500)
    receive(segment('feedback', '好的'))
    vi.advanceTimersByTime(1500)
    snapshot.busy = false
    coordinator.refresh()
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: '为什么？', transcript: '为什么？\n好的' })
  })
  it('waits for final recognition and a full quiet period before answering', () => {
    const { receive, answer, onState } = setup()
    receive(segment('one', '如何设计缓存', false))
    vi.advanceTimersByTime(3000)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('finalizing')
    receive(segment('one', '如何设计缓存一致性'))
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('waiting')
    vi.advanceTimersByTime(1)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: '如何设计缓存一致性', transcript: '如何设计缓存一致性' })
    expect(onState).toHaveBeenLastCalledWith('listening')
  })

  it('does not postpone or repeat an answer for identical final packets or timestamp-only updates', () => {
    const { receive, answer } = setup()
    receive(segment('one', '为什么使用 Redis？'))
    vi.advanceTimersByTime(1000)
    receive({ ...segment('one', '为什么使用 Redis？'), endMs: 1200 })
    vi.advanceTimersByTime(500)
    expect(answer).toHaveBeenCalledTimes(1)
    receive(segment('one', '为什么使用 Redis？'))
    receive(segment('one', '为什么使用本地缓存？'))
    receive(segment('one', '还是 Redis 吗', false))
    vi.advanceTimersByTime(5000)
    expect(answer).toHaveBeenCalledTimes(1)
    receive(segment('two', '如何排查缓存雪崩？'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledTimes(2)
    expect(answer.mock.calls[1][0].question).toBe('如何排查缓存雪崩？')
  })

  it('restarts the quiet period when a final sentence is substantially revised', () => {
    const { receive, answer } = setup()
    receive(segment('one', '为什么使用 Kafka'))
    vi.advanceTimersByTime(1000)
    receive(segment('one', '为什么使用 Kafka 而不是 RabbitMQ'))
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(answer.mock.calls[0][0].question).toBe('为什么使用 Kafka 而不是 RabbitMQ')
  })

  it('aggregates nearby sentences and waits while any new sentence remains partial', () => {
    const { receive, answer } = setup()
    receive(segment('one', '我们正在讨论高并发系统'))
    vi.advanceTimersByTime(1000)
    receive(segment('two', '你会如何设计缓存', false))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('two', '你会如何设计缓存一致性？'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledExactlyOnceWith({
      question: '我们正在讨论高并发系统\n你会如何设计缓存一致性？',
      transcript: '我们正在讨论高并发系统\n你会如何设计缓存一致性？',
    })
  })

  it('ignores pre-existing segments when enabled, even if their recognition is later revised', () => {
    const { receive, answer } = setup({ segments: [segment('history', '如何设计数据库', false)] })
    receive(segment('history', '如何设计数据库索引？'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('new', '请解释一下 B 树和 B+ 树的区别'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0]).toEqual({
      question: '请解释一下 B 树和 B+ 树的区别',
      transcript: '如何设计数据库索引？\n请解释一下 B 树和 B+ 树的区别',
    })
  })

  it('queues one batch while an answer is busy, then sends it without replacing the active answer', () => {
    const { snapshot, coordinator, receive, answer, onState } = setup({ busy: true })
    receive(segment('one', '如何保证幂等性？'))
    vi.advanceTimersByTime(1500)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('queued')
    receive(segment('two', '请结合订单系统举个例子'))
    vi.advanceTimersByTime(1000)
    snapshot.busy = false
    coordinator.refresh()
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer.mock.calls[0][0].question).toBe('如何保证幂等性？\n请结合订单系统举个例子')
    coordinator.refresh()
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('immediately sends an already-settled queued batch when the current answer finishes', () => {
    const { snapshot, coordinator, receive, answer } = setup({ busy: true })
    receive(segment('one', '线程池有哪些关键参数'))
    vi.advanceTimersByTime(1500)
    snapshot.busy = false
    answer.mockImplementation(() => { snapshot.busy = true; coordinator.refresh() })
    coordinator.refresh()
    expect(answer).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('editing an older sentence only pauses an unrelated pending question until blur', () => {
    const { snapshot, coordinator, receive, answer, onState } = setup({ segments: [segment('old', '前面的项目背景')] })
    receive(segment('one', '如何设计换存？'))
    vi.advanceTimersByTime(1000)
    snapshot.editing = true
    coordinator.dismissPending('old')
    coordinator.refresh()
    vi.advanceTimersByTime(5000)
    expect(onState).toHaveBeenLastCalledWith('editing')
    expect(answer).not.toHaveBeenCalled()
    receive(segment('one', '如何设计 Redis 缓存？'))
    snapshot.editing = false
    coordinator.refresh()
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: '如何设计 Redis 缓存？', transcript: '前面的项目背景\n如何设计 Redis 缓存？' })
  })

  it('dismissing a candidate just before its deadline stays manual after blur and later ASR revisions', () => {
    const { snapshot, coordinator, receive, answer, onState } = setup()
    receive(segment('one', '如何设计缓存？'))
    vi.advanceTimersByTime(1499)
    snapshot.editing = true
    coordinator.dismissPending('one')
    coordinator.refresh()
    expect(onState).toHaveBeenLastCalledWith('manual')
    expect(vi.getTimerCount()).toBe(0)
    snapshot.editing = false
    coordinator.refresh()
    receive(segment('one', '如何设计分布式缓存？'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('manual')
  })

  it('hands off the complete pending question when one of its aggregated sentences is clicked', () => {
    const { snapshot, coordinator, receive, answer } = setup()
    receive(segment('context', '接下来讨论缓存'))
    receive(segment('question', '如何设计缓存', false))
    const before = structuredClone(snapshot.segments)
    coordinator.dismissPending('context')
    expect(snapshot.segments).toEqual(before)
    receive(segment('question', '如何设计缓存？'))
    receive(segment('context', '请结合项目介绍缓存'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('next', '为什么选择 Kafka？'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer.mock.calls[0][0].question).toBe('为什么选择 Kafka？')
  })

  it('does not discard new speech when an already-dismissed editor is clicked again', () => {
    const { snapshot, coordinator, receive, answer } = setup()
    receive(segment('one', '如何设计缓存？'))
    snapshot.editing = true
    coordinator.dismissPending('one')
    coordinator.refresh()
    receive(segment('two', '为什么选择 Redis？'))
    coordinator.dismissPending('one')
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    snapshot.editing = false
    coordinator.refresh()
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(answer.mock.calls[0][0].question).toBe('为什么选择 Redis？')
  })

  it('cancels a clicked queued question without submitting it after the active answer finishes', () => {
    const { snapshot, coordinator, receive, answer, onState } = setup({ busy: true })
    receive(segment('one', '如何保证幂等性？'))
    vi.advanceTimersByTime(1500)
    expect(onState).toHaveBeenLastCalledWith('queued')
    coordinator.dismissPending('one')
    snapshot.busy = false
    coordinator.refresh()
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('manual')
  })

  it('does not answer a sentence that was manually cleared or change its final status', () => {
    const { snapshot, coordinator, receive, answer } = setup()
    receive(segment('one', '如何设计缓存？'))
    snapshot.editing = true
    coordinator.refresh()
    snapshot.segments = [{ ...snapshot.segments[0], text: '', isEdited: true }]
    snapshot.editing = false
    coordinator.refresh()
    vi.advanceTimersByTime(1500)
    expect(answer).not.toHaveBeenCalled()
    expect(snapshot.segments[0]).toMatchObject({ text: '', isEdited: true, isFinal: true })
  })

  it('honors manual priority by discarding pending audio and ignoring revisions until a new id arrives', () => {
    const { coordinator, receive, answer } = setup()
    receive(segment('one', '怎么排查性能问题', false))
    coordinator.acknowledge()
    receive(segment('one', '怎么排查性能问题？'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('two', '讲讲你处理过的慢查询'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toBe('讲讲你处理过的慢查询')
  })

  it('discards a queued question when manual generation or cancellation acknowledges it', () => {
    const { snapshot, coordinator, receive, answer } = setup({ busy: true })
    receive(segment('one', '解释一下事务隔离级别'))
    vi.advanceTimersByTime(1500)
    coordinator.acknowledge()
    snapshot.busy = false
    coordinator.refresh()
    receive(segment('one', '解释一下所有事务隔离级别？'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
  })

  it.each([false, true])('drops pending or queued work on disable and does not replay history after re-enabling (busy=%s)', busy => {
    const { snapshot, coordinator, receive, answer, onState } = setup({ busy })
    receive(segment('one', '请介绍一下自己'))
    if (busy) vi.advanceTimersByTime(1500)
    snapshot.active = false
    coordinator.refresh()
    expect(onState).toHaveBeenLastCalledWith('off')
    vi.advanceTimersByTime(5000)
    snapshot.active = true
    snapshot.busy = false
    coordinator.refresh()
    receive(segment('one', '请详细介绍一下自己'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    receive(segment('two', '你用过 Redis 吗'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toBe('你用过 Redis 吗')
  })

  it('stops all scheduled work after disposal', () => {
    const { coordinator, receive, answer } = setup()
    receive(segment('one', '如何设计缓存？'))
    coordinator.dispose()
    vi.advanceTimersByTime(5000)
    coordinator.refresh()
    receive(segment('two', '为什么使用 Redis？'))
    vi.advanceTimersByTime(5000)
    expect(answer).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a changed pause preference against the latest activity time', () => {
    const { snapshot, coordinator, receive, answer } = setup({ pauseMs: 3000 })
    receive(segment('one', '如何设计缓存？'))
    vi.advanceTimersByTime(1000)
    snapshot.pauseMs = 500
    coordinator.refresh()
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('falls back to 1500 milliseconds for an invalid pause preference', () => {
    const { receive, answer } = setup({ pauseMs: Number.NaN })
    receive(segment('one', '如何设计缓存？'))
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('caps question and context lengths and excludes sentences after the last selected one', () => {
    const { snapshot, receive, answer } = setup({ segments: [segment('history', '历史'.repeat(12_000))] })
    const text = `${'背景'.repeat(7000)}如何设计缓存？`
    receive(segment('one', text))
    snapshot.segments.push(segment('later', '不应进入本题上下文'))
    vi.advanceTimersByTime(1500)
    expect(answer.mock.calls[0][0].question).toHaveLength(12_000)
    expect(answer.mock.calls[0][0].question).toBe(text.slice(-12_000))
    expect(answer.mock.calls[0][0].transcript).toHaveLength(18_000)
    expect(answer.mock.calls[0][0].transcript).not.toContain('不应进入本题上下文')
  })

  it.each(['你好', '我们使用 Redis 缓存热点数据', '线程池这一块结合项目展开一下', 'Can you hear me?', 'Design patterns are useful'])('answers non-feedback finalized speech without general question classification: %s', text => {
    const { receive, answer } = setup()
    receive(segment('one', text))
    vi.advanceTimersByTime(1499)
    expect(answer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(answer).toHaveBeenCalledExactlyOnceWith({ question: text, transcript: text })
  })

  it('ignores an empty batch and continues with subsequent speech', () => {
    const { receive, answer, onState } = setup()
    receive(segment('blank', '  \n  '))
    vi.advanceTimersByTime(1500)
    expect(answer).not.toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('listening')
    receive(segment('next', '接下来讲一下项目背景'))
    vi.advanceTimersByTime(1500)
    expect(answer).toHaveBeenCalledTimes(1)
  })
})
