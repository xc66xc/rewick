import { describe, expect, it } from 'vitest'
import { interviewTypes, interviewTypeSchema } from '../src/shared/interview-type'
import { jobExperienceLevels, jobExperienceStrategy } from '../src/shared/job-experience-level'
import { interviewAnswerStrategy } from '../src/shared/interview-answer-strategy'
import { environmentSnapshotSchema } from '../src/main/services/interview-validation'
import { sessionRecordSchema } from '../src/main/services/validation'
import { sessionToMarkdown } from '../src/main/services/history-store'

describe('HR interview contract and focus', () => {
  const snapshot = { id: 'env', name: 'HR 准备', interviewType: 'hr' as const, resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [] }
  it('preserves HR session and answer snapshots in the exported history', () => {
    const record = sessionRecordSchema.parse({ id: 'history', title: 'HR', createdAt: '2026-10-16T12:00:00+08:00',
      interviewEnvironment: environmentSnapshotSchema.parse(snapshot), segments: [],
      answers: [{ id: 'answer', question: '到岗时间？', text: '沟通具体安排。', status: 'complete', createdAt: '2026-10-16T12:00:00+08:00', interviewEnvironment: snapshot }] })
    expect(record.answers[0].interviewEnvironment?.interviewType).toBe('hr')
    expect(sessionToMarkdown(record)).toContain('面试类型：HR 面试')
  })
  it.each(interviewTypes)('accepts %s without changing its identity', type => {
    expect(interviewTypeSchema.parse(type)).toBe(type)
    expect(interviewAnswerStrategy(type)).toContain(type === 'hr' ? 'HR 面试' : type === 'general' ? '综合面试' : '技术面试')
  })
  it('keeps absent historical type absent and rejects unknown types', () => {
    expect(interviewAnswerStrategy()).toBe('')
    expect(interviewTypeSchema.safeParse('HR').success).toBe(false)
  })
  it.each([undefined, null, ...jobExperienceLevels])('uses HR focus without technical design expansion for %s', level => {
    const focus = interviewAnswerStrategy('hr') + jobExperienceStrategy(level, 'hr')
    expect(focus).toContain('不得编造薪资')
    expect(focus).toContain('不从 JD、岗位年限或网页推断个人条件')
    expect(focus).toContain('不把每类问题都套成长篇 STAR')
    expect(focus).toContain('HR 中出现技术题仍正面准确回答')
    expect(focus).not.toContain('系统边界、一致性、故障隔离')
    expect(focus).not.toContain('在项目、方案和排障回答中主动体现')
    if (level) expect(focus).toContain('不代表候选人的实际工作年限或职级')
  })
})
