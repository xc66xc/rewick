import { jobExperienceLabels } from '../../shared/job-experience-level'
import { interviewTypeLabels } from '../../shared/interview-type'
import type { SessionRecord, SessionExportOptions } from '../../shared/types'
import { parseInput, sessionRecordSchema } from './validation'

function timecode(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

export function sessionToMarkdown(record: SessionRecord, options: SessionExportOptions = { includeAiAnswers: true, includeTranscript: true, includeInterviewInfo: true }): string {
  const session = parseInput(sessionRecordSchema, record)
  const lines = [`# ${session.title.replace(/[\r\n]/g, ' ')}`, '']
  if (options.includeInterviewInfo) {
    lines.push(`开始时间：${session.createdAt}`, '', '## 面试信息', '')
    const environments = new Map(
      [session.interviewEnvironment, ...session.answers.map(answer => answer.interviewEnvironment)]
        .filter(environment => environment !== undefined)
        .map(environment => [JSON.stringify(environment), environment])
    )
    for (const environment of environments.values()) {
      lines.push(`面试环境：${environment.name}`, `简历：${environment.resumeName || '未选择'}`)
      if (environment.interviewType) lines.push(`面试类型：${interviewTypeLabels[environment.interviewType]}`)
      if (environment.jobExperienceLevel) lines.push(`岗位经验要求：${jobExperienceLabels[environment.jobExperienceLevel]}`)
      lines.push('')
    }
    const targets = new Map(session.answers.flatMap(answer => answer.interviewTarget
      ? [[JSON.stringify(answer.interviewTarget), answer.interviewTarget] as const] : []))
    for (const target of targets.values()) {
      if (!target.companyName && !target.roleName && !target.jobDescription) continue
      lines.push(`公司：${target.companyName || '未填写'}`, `岗位：${target.roleName || '未填写'}`, '')
      if (target.jobDescription) lines.push('岗位 JD：', '', target.jobDescription, '')
    }
  }
  if (options.includeTranscript) {
    lines.push('## 转写', '')
    for (const segment of session.segments) {
      lines.push(`**[${timecode(segment.startMs)}]${segment.isFinal ? '' : '（未定稿）'}** ${segment.text}`, '')
    }
  }
  lines.push(options.includeAiAnswers ? '## 回答' : '## 问题', '')
  for (const answer of session.answers) {
    lines.push(`### ${answer.question.replace(/[\r\n]/g, ' ')}`, '')
    if (!options.includeAiAnswers) continue
    lines.push(answer.text || '（尚无回答）', '')
    if (answer.status !== 'complete') lines.push(`状态：${{ streaming: '生成中', cancelled: '已停止', error: '出错' }[answer.status]}`, '')
    if (answer.error) lines.push(`错误：${answer.error}`, '')

  }
  return `${lines.join('\n').trimEnd()}\n`
}
