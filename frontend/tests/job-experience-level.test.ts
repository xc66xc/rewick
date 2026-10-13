import { canSaveOtherEnvironment } from '../src/main/services/environment-edit-policy'
import { describe, expect, it } from 'vitest'
import { jobExperienceLevels, jobExperienceStrategy } from '../src/shared/job-experience-level'
import { environmentInputSchema, environmentSnapshotSchema } from '../src/main/services/interview-validation'
import { resolveInterviewSettings } from '../src/shared/interview-settings'
import { defaultSettings } from '../src/shared/defaults'
import { sessionRecordSchema } from '../src/main/services/validation'
import { sessionToMarkdown } from '../src/main/services/history-store'
const environment = { id: 'env', name: '准备', interviewType: 'technical' as const, resumeId: null, targetId: null, referenceIds: [], createdAt: '2026-10-13T08:00:00Z', updatedAt: '2026-10-13T08:00:00Z' }
const snapshot = { ...environment, resumeName: '', targetName: '' }
describe('job experience contract', () => {
  it('allows only an existing non-session environment through the active edit lock', () => {
    expect(canSaveOtherEnvironment({ ...environment, id: 'other', version: 1 }, true, snapshot)).toBe(true)
    expect(canSaveOtherEnvironment({ ...environment, id: 'other', version: 0 }, true, snapshot)).toBe(false)
    expect(canSaveOtherEnvironment(environment, true, snapshot)).toBe(false)
    expect(canSaveOtherEnvironment({ ...environment, id: undefined }, true, snapshot)).toBe(false)
    expect(canSaveOtherEnvironment({ ...environment, id: 'other' }, true, null)).toBe(false)
    expect(canSaveOtherEnvironment({ ...environment, id: 'other' }, false, snapshot)).toBe(false)
  })
  it.each(jobExperienceLevels)('preserves %s through environment, settings and history', level => {
    expect(environmentInputSchema.parse({ ...environment, jobExperienceLevel: level }).jobExperienceLevel).toBe(level)
    expect(jobExperienceStrategy(level)).toMatch(/\n$/)
    expect(jobExperienceStrategy(level)).not.toContain(String.raw`\n`)
    const settings = resolveInterviewSettings(defaultSettings, { resumes: [], targets: [], activeEnvironmentId: 'env', environments: [{ ...environment, jobExperienceLevel: level }] })
    expect(settings.interviewEnvironment?.jobExperienceLevel).toBe(level)
    const record = sessionRecordSchema.parse({ id: 'session', title: '历史', createdAt: environment.createdAt, interviewEnvironment: { ...snapshot, jobExperienceLevel: level }, segments: [], answers: [] })
    expect(record.interviewEnvironment?.jobExperienceLevel).toBe(level)
    expect(sessionToMarkdown(record)).toContain('岗位经验要求：')
  })
  it('preserves omission and explicit clearing as different input semantics', () => {
    expect(environmentInputSchema.parse(environment)).not.toHaveProperty('jobExperienceLevel')
    expect(environmentInputSchema.parse({ ...environment, jobExperienceLevel: null })).toHaveProperty('jobExperienceLevel', null)
    expect(environmentSnapshotSchema.parse(snapshot)).not.toHaveProperty('jobExperienceLevel')
    expect(jobExperienceStrategy(null)).toBe('')
    expect(jobExperienceStrategy()).toBe('')
    expect(sessionToMarkdown({ id: 'session', title: '旧历史', createdAt: environment.createdAt, interviewEnvironment: snapshot, segments: [], answers: [] })).not.toContain('岗位经验要求')
  })
  it.each(['', 'senior', 5, {}, []])('rejects invalid level %j', value => {
    expect(environmentInputSchema.safeParse({ ...environment, jobExperienceLevel: value }).success).toBe(false)
    expect(environmentSnapshotSchema.safeParse({ ...snapshot, jobExperienceLevel: value }).success).toBe(false)
  })
})
