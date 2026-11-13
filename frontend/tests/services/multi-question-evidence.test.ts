import { describe, expect, it } from 'vitest'
import { aggregateQuestionEvidence } from '../../src/main/services/multi-question-evidence'
import type { ExtractedQuestion } from '../../src/shared/question-rewrite'
import type { ReferenceExcerpt, RetrievalContext } from '../../src/shared/types'
import { batchReferenceResponseSchema, retrievalContextSchema } from '../../src/main/services/validation'

const questions: ExtractedQuestion[] = Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}` as ExtractedQuestion['id'], question: `问题${index + 1}`, sourceTexts: [`问题${index + 1}`] }))
const local = (id: string, questionIds: string[], text: string): ReferenceExcerpt => ({ source: 'platform', documentId: 'same-document', revision: 1, chunkId: 'same-context', excerptId: id, questionIds, name: '资料', kind: 'technical', text })
const reference: RetrievalContext = { status: 'ready', excerpts: [local('shared', ['q1', 'q3'], '支持第一题和第三题的完整范围'), local('other-range', ['q2'], '同父块中的另一段必要范围')], queries: questions.map(question => ({ questionId: question.id, status: 'ready', excerptIds: question.id === 'q1' || question.id === 'q3' ? ['shared'] : question.id === 'q2' ? ['other-range'] : [] })) }
const web = (qid: string, rank: number): ReferenceExcerpt => ({ source: 'web', documentId: 'web', revision: 1, chunkId: 'same-source', name: '网页', kind: 'technical', url: `https://source.example.test/${qid}`, text: `${qid}-${rank}${'字'.repeat(995)}` })

describe('bounded multi-question evidence', () => {
  it('preserves shared provenance and distinct required ranges in one document rather than deduplicating the entire document', () => {
    const result = aggregateQuestionEvidence(questions, reference, new Map(), false, false)
    expect(result.excerpts).toEqual(reference.excerpts)
    expect(result.queries?.[0].excerptIds).toEqual(['shared'])
    expect(result.queries?.[2].excerptIds).toEqual(['shared'])
    expect(result.queries?.[1].excerptIds).toEqual(['other-range'])
    expect(result).not.toHaveProperty('hybrid')
    expect(retrievalContextSchema.safeParse(result).success).toBe(true)
  })

  it('covers every available question before extras and only associates actually included evidence', () => {
    const results = new Map(questions.map(question => [question.id, { status: 'ready' as const, excerpts: [web(question.id, 1), web(question.id, 2)], web: { status: 'ready' as const } }]))
    const result = aggregateQuestionEvidence(questions, reference, results, true, false)
    const selected = result.excerpts.filter(excerpt => excerpt.source === 'web')
    expect(selected.slice(0, 5).map(excerpt => excerpt.questionIds)).toEqual(questions.map(question => [question.id]))
    expect(selected.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBeLessThanOrEqual(8000)
    expect(selected).toHaveLength(8)
    expect(result.queries?.every(query => query.excerptIds.every(id => result.excerpts.some(excerpt => excerpt.excerptId === id && excerpt.questionIds?.includes(query.questionId))))).toBe(true)
    expect(result.queries?.[4]).toMatchObject({ status: 'degraded', web: { status: 'degraded', message: expect.stringContaining('预算') } })
    expect(retrievalContextSchema.safeParse(result).success).toBe(true)
  })

  it('reserves first coverage for all five long results and never assigns removed tails or full ranges to sent text', () => {
    const results = new Map(questions.map(question => [question.id, { status: 'ready' as const, excerpts: [{ ...web(question.id, 1), text: `${question.id}${'字'.repeat(1998)}`, paragraphStart: 1, paragraphEnd: 4 }], web: { status: 'ready' as const } }]))
    const result = aggregateQuestionEvidence(questions, reference, results, true, false)
    const selected = result.excerpts.filter(excerpt => excerpt.source === 'web')
    expect(selected).toHaveLength(5)
    expect(selected.map(excerpt => excerpt.text.length)).toEqual([1600, 1600, 1600, 1600, 1600])
    expect(selected.every(excerpt => excerpt.contextExpansion === 'partial' && excerpt.paragraphStart === undefined && excerpt.paragraphEnd === undefined)).toBe(true)
    expect(result.queries?.every(query => query.excerptIds.some(id => selected.some(excerpt => excerpt.excerptId === id && excerpt.questionIds?.includes(query.questionId))))).toBe(true)
    expect(retrievalContextSchema.safeParse(result).success).toBe(true)
  })

  it('deduplicates only the actual cropped text instead of inheriting another questions complete source match', () => {
    const rows = new Map(questions.map(question => [question.id, { status: 'ready' as const, excerpts: [{ ...web('shared', 1), text: `${question.id === 'q2' ? 'different-prefix' : 'common-prefix'}${'字'.repeat(1987)}`.slice(0, 2000) }], web: { status: 'ready' as const } }]))
    const result = aggregateQuestionEvidence(questions, reference, rows, true, false)
    const selected = result.excerpts.filter(excerpt => excerpt.source === 'web')
    expect(selected.some(excerpt => excerpt.questionIds?.includes('q1') && excerpt.questionIds?.includes('q2'))).toBe(false)
    expect(selected.find(excerpt => excerpt.questionIds?.includes('q2'))?.text.startsWith('different-prefix')).toBe(true)
    expect(retrievalContextSchema.safeParse(result).success).toBe(true)
  })

  it('rejects false coverage, missing sent IDs and over-budget batch contents before they reach the model', () => {
    expect(batchReferenceResponseSchema.safeParse({ ...reference, queries: reference.queries?.map(query => ({ ...query, excerptIds: ['not-sent'] })) }).success).toBe(false)
    expect(batchReferenceResponseSchema.safeParse({ ...reference, excerpts: [local('shared', ['q1', 'q3'], '文'.repeat(2000)), local('other-range', ['q2'], '文'.repeat(2000)), local('third', ['q4'], '文'.repeat(2000))] }).success).toBe(false)
    expect(retrievalContextSchema.safeParse({ ...reference, excerpts: [local('shared', ['q5'], '移除命中范围后错误标记覆盖')] }).success).toBe(false)
  })

  it('marks queued or expired work degraded rather than empty while retaining completed evidence', () => {
    const result = aggregateQuestionEvidence(questions, reference, new Map([['q1', { status: 'ready', excerpts: [web('q1', 1)], web: { status: 'ready' } }]]), true, true)
    expect(result.queries?.[0]).toMatchObject({ status: 'ready', web: { status: 'ready' } })
    expect(result.queries?.[4]).toMatchObject({ status: 'degraded', web: { status: 'degraded', message: expect.stringContaining('预算') } })
    expect(result.excerpts.some(excerpt => excerpt.source === 'web')).toBe(true)
  })
})
