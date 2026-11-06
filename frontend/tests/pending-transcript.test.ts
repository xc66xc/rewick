import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../src/shared/types'
import { PendingTranscript } from '../src/renderer/src/hooks/pendingTranscript'

const first: TranscriptSegment = {
  id: 'first', text: '请介绍员工助手项目，你负责了哪些模块？', startMs: 0, endMs: 1200, isFinal: true,
}
const second: TranscriptSegment = { id: 'second', text: '遇到', startMs: 1300, isFinal: false }

describe('pending question transcript', () => {
  it('keeps confirmed sentences visible while the following sentence grows', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.receive(second)
    expect(pending.snapshot()?.text).toBe(`${first.text}\n遇到`)
    expect(pending.snapshot()?.id).toBe(first.id)
    expect(pending.snapshot()?.isFinal).toBe(false)
    pending.receive({ ...second, text: '遇到过哪些难点？', endMs: 2400, isFinal: true })
    expect(pending.snapshot()).toEqual({
      id: first.id, text: `${first.text}\n遇到过哪些难点？`, startMs: 0, endMs: 2400, isFinal: true,
    })
  })

  it('replaces revisions in their original position instead of appending duplicate partials', () => {
    const pending = new PendingTranscript()
    pending.receive({ ...first, isFinal: false })
    pending.receive(second)
    pending.receive({ ...first, text: '请介绍项目的业务背景。', isFinal: false })
    pending.receive({ ...second, text: '遇到的架构难点' })
    expect(pending.snapshot()?.text).toBe('请介绍项目的业务背景。\n遇到的架构难点')
    expect(pending.ids()).toEqual([first.id, second.id])
  })

  it('does not replace finalized text with a late partial revision', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    const final = pending.snapshot()
    pending.receive({ ...first, text: '介绍', isFinal: false })
    expect(pending.snapshot()).toBe(final)
  })

  it('does not revive consumed speech when its final text is revised later', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.receive(second)
    pending.consume([first.id, second.id])
    pending.receive({ ...second, text: '遇到过哪些难点？', isFinal: true })
    expect(pending.snapshot()).toBeUndefined()
    expect(pending.ids()).toEqual([])
    pending.receive({ ...second, id: 'third', text: '如何解决的？' })
    expect(pending.snapshot()?.text).toBe('如何解决的？')
  })

  it('consumes only selected speech and keeps another unanswered sentence', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.receive(second)
    pending.consume([first.id])
    expect(pending.snapshot()?.text).toBe(second.text)
    expect(pending.snapshot()?.id).toBe(second.id)
    expect(pending.ids()).toEqual([second.id])
  })

  it('allows the same spoken question again when its segment identity is new', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.consume([first.id])
    pending.receive({ ...first, id: 'repeated-question' })
    expect(pending.snapshot()?.text).toBe(first.text)
    expect(pending.snapshot()?.id).toBe('repeated-question')
  })

  it('syncs edited record text without introducing old or consumed history', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.receive(second)
    pending.consume([first.id])
    pending.sync([first, { ...second, text: '你如何验证 Redis 缓存？', isEdited: true },
      { ...first, id: 'unrelated-history' }])
    expect(pending.snapshot()?.text).toBe('你如何验证 Redis 缓存？')
    expect(pending.snapshot()?.isEdited).toBe(true)
    expect(pending.ids()).toEqual([second.id])
  })

  it('preserves deliberately empty edits and restores them only from visible record text', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.sync([{ ...first, text: '', isEdited: true }])
    expect(pending.snapshot()).toBeUndefined()
    expect(pending.ids()).toEqual([first.id])
    pending.sync([{ ...first, text: '更正后的问题', isEdited: true }])
    expect(pending.snapshot()?.text).toBe('更正后的问题')
  })

  it('keeps a stable bubble identity when the first sentence is edited empty', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.receive(second)
    pending.sync([{ ...first, text: '', isEdited: true }, second])
    expect(pending.snapshot()?.id).toBe(first.id)
    expect(pending.snapshot()?.text).toBe(second.text)
  })

  it('clears the preview and consumption boundary for a new capture session', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    pending.consume([first.id])
    pending.receive(second)
    pending.reset()
    expect(pending.snapshot()).toBeUndefined()
    expect(pending.ids()).toEqual([])
    pending.receive(first)
    expect(pending.snapshot()?.text).toBe(first.text)
  })

  it('reuses the preview snapshot when incoming or visible record text is unchanged', () => {
    const pending = new PendingTranscript()
    pending.receive(first)
    const preview = pending.snapshot()
    pending.receive({ ...first })
    pending.sync([{ ...first }, { ...second, id: 'old-history' }])
    expect(pending.snapshot()).toBe(preview)
  })
})
