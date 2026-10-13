import { z } from 'zod'

export const jobExperienceLevelSchema = z.enum(['no_experience', 'one_to_three_years', 'three_to_five_years', 'five_plus_years'])
export type JobExperienceLevel = z.infer<typeof jobExperienceLevelSchema>
export const jobExperienceLevels = jobExperienceLevelSchema.options
export const jobExperienceLabels: Record<JobExperienceLevel, string> = {
  no_experience: '无经验', one_to_three_years: '1–3年经验', three_to_five_years: '3–5年经验', five_plus_years: '5年经验以上',
}
export const jobExperienceShortLabels: Record<JobExperienceLevel, string> = { no_experience: '无经验', one_to_three_years: '1–3年', three_to_five_years: '3–5年', five_plus_years: '5年以上' }
export const jobExperienceDescriptions: Record<JobExperienceLevel, string> = {
  no_experience: '基础原理、实践过程与验证方法', one_to_three_years: '实现与验证、问题定位与交付质量',
  three_to_five_years: '端到端设计、方案取舍与风险控制', five_plus_years: '复杂约束、长期演进与业务影响',
}
const strategies: Record<JobExperienceLevel, string> = {
  no_experience: '默认侧重基础原理、实践过程与验证方法，按问题需要说明基本边界。',
  one_to_three_years: '默认侧重实现与验证、问题定位、测试及交付理由。',
  three_to_five_years: '按问题需要侧重端到端设计、替代方案、约束、取舍与风险控制。',
  five_plus_years: '复杂决策中适当讨论长期演进、更大范围影响和业务约束，同时保留关键实现细节。',
}
export function jobExperienceStrategy(level?: JobExperienceLevel | null): string {
  if (!level) return ''
  return `岗位经验要求为${jobExperienceLabels[level]}，这是岗位要求，不代表候选人的实际工作年限或职级。${strategies[level]}当前问题、追问和具体 JD 的明确职责优先，以上仅为非排他的默认侧重点，不按年限删掉必答知识点。低年限遇到架构或一致性问题仍完整回答，高年限基础题不强行扩写为架构讨论。正确性、测试、可靠性和沟通贯穿所有档位；继续遵守简短或展开的长度规则。不得据此编造候选人的年限、身份、职责或亲历项目；5年经验以上不自动等于管理者、架构师或带过团队。
`
}
