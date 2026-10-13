// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SessionContextDetails from '../src/renderer/src/components/SessionContextDetails'
import type { InterviewEnvironmentSnapshot, SessionRecord } from '../src/shared/types'
afterEach(cleanup)
const snapshot: InterviewEnvironmentSnapshot = { id: 'env', name: '准备', interviewType: 'technical', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [] }
const answer = { id: 'a', question: '缓存', text: '说明', createdAt: '2026-10-13T08:00:00Z', status: 'complete' as const }
describe('historical job requirement', () => {
  it('separates the same environment with distinct recorded requirements and ignores current settings', async () => {
    const record: Pick<SessionRecord, 'answers' | 'interviewEnvironment'> = { interviewEnvironment: snapshot, answers: [{ ...answer, interviewEnvironment: { ...snapshot, jobExperienceLevel: 'no_experience' } }, { ...answer, id: 'b', interviewEnvironment: { ...snapshot, jobExperienceLevel: 'five_plus_years' } }] }
    render(<SessionContextDetails record={record} current={{ interviewEnvironment: { ...snapshot, jobExperienceLevel: 'three_to_five_years' }, interviewTarget: { companyName: '', roleName: '', jobDescription: '' } }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /面试信息/ }))
    expect(screen.getByText('无经验')).toBeTruthy()
    expect(screen.getByText('5年经验以上')).toBeTruthy()
    expect(screen.queryByText('3–5年经验')).toBeNull()
    expect(screen.getByText('用于 Q01')).toBeTruthy()
    expect(screen.getByText('用于 Q02')).toBeTruthy()
  })
  it('does not invent a requirement for old recorded answers', async () => {
    render(<SessionContextDetails record={{ answers: [{ ...answer, interviewEnvironment: snapshot }] }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /面试信息/ }))
    expect(screen.queryByText('岗位经验要求')).toBeNull()
  })
})
