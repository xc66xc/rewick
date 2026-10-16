import { z } from 'zod'

export const interviewTypeSchema = z.enum(['technical', 'general', 'hr'])
export const interviewTypes = interviewTypeSchema.options
export type InterviewType = z.infer<typeof interviewTypeSchema>
export const interviewTypeLabels: Record<InterviewType, string> = {
  technical: '技术面试',
  general: '综合面试',
  hr: 'HR 面试',
}
export const interviewTypeDescriptions: Record<InterviewType, string> = {
  technical: '侧重技术原理、项目实现、方案权衡和问题排查。',
  general: '侧重个人经历、沟通协作、职业规划和岗位匹配。',
  hr: '侧重求职动机、经历核实、行为事例，以及薪酬、到岗等条件沟通。',
}
