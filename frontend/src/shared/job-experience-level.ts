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
  no_experience: '主动用清楚的原理和可行实践说明理解；在做法类问题中补充一个基本边界或验证方法，体现能够把知识落地。',
  one_to_three_years: '主动说明落地步骤、关键实现的理由，并补入相关的错误边界、问题定位或测试验证，体现交付质量。',
  three_to_five_years: '在项目、方案和排障回答中主动体现端到端设计判断：从约束、模块或数据边界、替代方案与取舍、可靠性风险、验证依据中选最关键的内容自然展开，即使面试官未明确询问设计或权衡，也要说明为什么这样做及如何保证效果。',
  five_plus_years: '在项目、方案和排障回答中主动体现复杂设计和负责范围：从系统边界、一致性、故障隔离、容量与成本、可观测性、演进路径和业务约束中选相关的关键决策，说明取舍、影响、风险控制及验证方式；即使面试官未逐项追问，也要自然带出有价值的设计判断，同时保留落地机制。',
}
export function jobExperienceStrategy(level?: JobExperienceLevel | null): string {
  if (!level) return ''
  return `岗位经验要求为${jobExperienceLabels[level]}，这是岗位要求，不代表候选人的实际工作年限或职级。${strategies[level]}先直接回答核心问题，再主动补入与它紧密相关、能够体现该岗位能力的分析，不必等待面试官追问；通常选择最有价值的1–2个维度，将“做法、理由、取舍或验证”连成自然口语，不机械罗列所有考察点。当前问题、追问和具体 JD 的明确职责优先，主动补充必须服务当前问题，不转移话题。以上是非排他的默认侧重点，不按年限删掉必答知识点；低年限遇到架构或一致性问题仍完整回答。定义题只在有助于理解时补一句相关的应用边界或设计含义；事实确认、问候等简单问题直接回应，高年限也不强行扩写架构。综合面试中的相关补充优先体现判断依据、协作取舍和结果验证，不硬套技术架构。正确性、测试、可靠性和沟通贯穿所有档位；继续遵守简短或展开的长度规则。不得据此编造候选人的年限、身份、职责、亲历项目或效果指标；只有已有资料支持时才说自己做过，无依据的方案用明确假设表达。5年经验以上不自动等于管理者、架构师或带过团队。
`
}
