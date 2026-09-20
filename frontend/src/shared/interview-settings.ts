import type { InterviewLibrary, Settings } from './types'

export function resolveInterviewSettings(settings: Settings, library: InterviewLibrary): Settings {
  const environment = library.environments.find(value => value.id === library.activeEnvironmentId)
  if (!environment) throw new Error('当前面试环境不存在，请重新选择环境。')
  const resume = library.resumes.find(value => value.id === environment.resumeId)
  const target = library.targets.find(value => value.id === environment.targetId)
  if (environment.resumeId && !resume) throw new Error('面试环境选择的简历不存在，请重新选择。')
  if (environment.targetId && !target) throw new Error('面试环境选择的目标岗位不存在，请重新选择。')
  return {
    ...structuredClone(settings),
    context: { name: resume?.name ?? '', text: resume?.text ?? '' },
    interviewTarget: { companyName: target?.companyName ?? '', roleName: target?.roleName ?? '', jobDescription: target?.jobDescription ?? '' },
    interviewEnvironment: { id: environment.id, name: environment.name, interviewType: environment.interviewType, resumeId: environment.resumeId, resumeName: resume?.name ?? '',
      targetId: environment.targetId, targetName: target?.name ?? '', referenceIds: [...environment.referenceIds] },
  }
}
