import { describe, expect, it } from 'vitest'
import { mockQaToMarkdown } from '../../src/main/services/mock-qa-export'
import type { MockSession } from '../../src/shared/mock-interview'

const id = '12345678-1234-4234-8234-123456789012'
const session: MockSession = { id, state: 'completed', version: 1, generation: 1, environmentName: '工程师岗位', interviewType: 'technical', durationMinutes: 15, usedSeconds: 122, remainingSeconds: 778, avatarId: 'rewick-interviewer', voiceId: 'test', reportStatus: 'failed', createdAt: '2026-10-17T12:00:00+08:00', turns: [
  { id, number: 1, question: '如何保证一致性？', answerText: '先更新数据库。\n再删除缓存。\n```示例```', status: 'answered', assessment: { secretAssessment: '不应导出的模型评价' } },
  { id, number: 2, question: '如何压测？', answerText: '', status: 'skipped' },
  { id, number: 3, question: '如何降级？', answerText: '', status: 'pending' }
] }
describe('mock interview Q&A Markdown export', () => {
  it('exports saved questions and verbatim answers, marks skipped and unanswered turns', () => {
    const result = mockQaToMarkdown(session)
    expect(result).toContain('面试类型：技术面试')
    expect(result).toContain('实际用时：2 分 2 秒')
    expect(result).toContain('如何保证一致性？')
    expect(result).toContain('````text\n先更新数据库。\n再删除缓存。\n```示例```\n````')
    expect(result).toContain('（已跳过）'); expect(result).toContain('（未回答）')
    expect(result.indexOf('第 1 题')).toBeLessThan(result.indexOf('第 2 题'))
    expect(result).not.toContain('不应导出的模型评价')
  })
  it('exports sessions with no turns and any historical report status', () => {
    expect(mockQaToMarkdown({ ...session, turns: [], reportStatus: 'pending' })).toContain('暂无问答记录。')
  })
})
