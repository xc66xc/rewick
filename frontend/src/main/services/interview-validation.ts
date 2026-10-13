import { jobExperienceLevelSchema } from '../../shared/job-experience-level'
import { environmentStampSchema } from '../../shared/environment-stamp'
import { z } from 'zod'
import { environmentHotwordsError } from '../../shared/environment-hotwords'
import { interviewTypeSchema } from '../../shared/interview-type'

const id = z.string().min(1).max(128)
const timestamp = z.string().datetime({ offset: true })
const profileName = z.string().trim().min(1, '请填写名称。').max(255)
const environmentName = z.string().trim().min(1, '请填写环境名称。').max(100)
const referenceIds = z.array(id).transform(values => [...new Set(values)]).pipe(z.array(id).max(30, '每个环境最多选择 30 份参考资料。'))
const revision = { version: z.number().int().positive().optional(), bodyLoaded: z.boolean().optional() }
const targetFields = {
  companyName: z.string().trim().max(200),
  roleName: z.string().trim().max(200),
  jobDescription: z.string().max(12_000),
}

export const resumeInputSchema = z.object({ ...revision, id: id.optional(), name: profileName, text: z.string().max(100_000) })
export const targetInputSchema = z.object({ ...revision, id: id.optional(), name: profileName, ...targetFields })
export const environmentHotwordsSchema = z.array(z.string()).superRefine((words, context) => {
  const error = environmentHotwordsError(words)
  if (error) context.addIssue({ code: 'custom', message: error })
})
export const environmentHotwordSourcesSchema = z.object({ resumeId: id.nullable(), targetId: id.nullable(), referenceIds })
export const environmentInputSchema = z.object({
  jobExperienceLevel: jobExperienceLevelSchema.nullable().optional(),
  interviewType: interviewTypeSchema, hotwords: environmentHotwordsSchema.optional(),
  ...revision, id: id.optional(), name: environmentName, resumeId: id.nullable(), targetId: id.nullable(), referenceIds,
})
export const environmentSnapshotSchema = z.object({
  jobExperienceLevel: jobExperienceLevelSchema.nullable().optional(),
  interviewType: interviewTypeSchema.optional(),
  id, name: environmentName, resumeId: id.nullable(), resumeName: z.string().max(255),
  targetId: id.nullable(), targetName: z.string().max(255), referenceIds,
})

const metadata = { hasContent: z.boolean().optional(), id, createdAt: timestamp, updatedAt: timestamp }
const resumeSchema = resumeInputSchema.extend(metadata)
const targetSchema = targetInputSchema.extend(metadata)
export const environmentDetailSchema = environmentInputSchema.extend({ ...metadata, stamp: environmentStampSchema.nullable().optional() })

export const interviewLibrarySchema = z.object({
  resumes: z.array(resumeSchema).max(50, '最多保存 50 份简历。'),
  targets: z.array(targetSchema).max(50, '最多保存 50 个目标岗位。'),
  environments: z.array(environmentDetailSchema).min(1).max(100, '最多保存 100 个面试环境。'),
  activeEnvironmentId: id,
}).superRefine((library, context) => {
  for (const key of ['resumes', 'targets', 'environments'] as const) {
    const ids = new Set(library[key].map(item => item.id))
    if (ids.size !== library[key].length) context.addIssue({ code: 'custom', path: [key], message: '资料 ID 不能重复。' })
  }
  if (!library.environments.some(environment => environment.id === library.activeEnvironmentId)) {
    context.addIssue({ code: 'custom', path: ['activeEnvironmentId'], message: '当前面试环境不存在。' })
  }
  for (const [index, environment] of library.environments.entries()) {
    if (environment.resumeId !== null && !library.resumes.some(resume => resume.id === environment.resumeId)) {
      context.addIssue({ code: 'custom', path: ['environments', index, 'resumeId'], message: '选择的简历不存在。' })
    }
    if (environment.targetId !== null && !library.targets.some(target => target.id === environment.targetId)) {
      context.addIssue({ code: 'custom', path: ['environments', index, 'targetId'], message: '选择的目标岗位不存在。' })
    }
  }
})

export const interviewIdSchema = id
