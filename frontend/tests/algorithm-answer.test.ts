import { describe, expect, it } from 'vitest'
import { algorithmConversation } from '../src/shared/algorithm-answer'
import { sessionRecordSchema } from '../src/main/services/validation'
import type { Answer } from '../src/shared/types'

function turn(id: string, algorithmRootId: string): Answer {
  return { id, algorithmRootId, mode: 'algorithm', language: 'Java', question: `题目${id}`, text: `解答${id}`, status: 'complete', createdAt: '2026-11-04T10:00:00+08:00' }
}

describe('algorithm conversation scope', () => {
  it('keeps the current screenshot root and excludes previous screenshot tasks', () => {
    const history = algorithmConversation([turn('old', 'old'), turn('new', 'new'), turn('followup', 'new')])
    expect(history).toContain('题目new')
    expect(history).toContain('解答followup')
    expect(history).not.toContain('old')
  })
  it('preserves constraints at the end of a long original problem while explicitly excerpting old code', () => {
    const first = { ...turn('root', 'root'), question: '题干'.repeat(9000) + '末尾约束：n小于100000，保留此签名' }
    const latest = { ...turn('followup', 'root'), question: '换一种解法', text: 'code'.repeat(20_000) }
    const context = algorithmConversation([first, latest])
    expect(context).toContain(first.question)
    expect(context).toContain('末尾约束')
    expect(context).toContain('中间内容已省略')
    expect(context.length).toBeLessThan(50_000)
  })
  it('stops carrying algorithm context after an ordinary interview turn', () => {
    expect(algorithmConversation([turn('old', 'old'), { ...turn('speech', 'old'), mode: undefined }])).toBe('')
  })
  it('preserves task kind, language and root through history validation without persisting images', () => {
    const record = sessionRecordSchema.parse({ id: 'session', title: '算法题', createdAt: '2026-11-04T10:00:00+08:00', segments: [], answers: [turn('new', 'new')] })
    expect(record.answers[0]).toMatchObject({ mode: 'algorithm', language: 'Java', algorithmRootId: 'new' })
    expect(JSON.stringify(record)).not.toContain('image')
  })
})
