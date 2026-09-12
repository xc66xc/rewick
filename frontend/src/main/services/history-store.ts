import type { SessionRecord } from '../../shared/types'
import { parseInput, sessionRecordSchema } from './validation'

function timecode(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

export function sessionToMarkdown(record: SessionRecord): string {
  const session = parseInput(sessionRecordSchema, record)
  const lines = [`# ${session.title.replace(/[\r\n]/g, ' ')}`, '', `开始时间：${session.createdAt}`, '', '## 转写', '']
  if (session.interviewEnvironment) lines.splice(4, 0, `面试环境：${session.interviewEnvironment.name}`, `简历：${session.interviewEnvironment.resumeName || '未选择'}`, '')
  for (const segment of session.segments) {
    lines.push(`**[${timecode(segment.startMs)}]${segment.isFinal ? '' : '（未定稿）'}** ${segment.text}`, '')
  }
  lines.push('## 回答', '')
  for (const answer of session.answers) {
    lines.push(`### ${answer.question.replace(/[\r\n]/g, ' ')}`, '', answer.text || '（尚无回答）', '')
    if (answer.status !== 'complete') lines.push(`状态：${{ streaming: '生成中', cancelled: '已停止', error: '出错' }[answer.status]}`, '')
    if (answer.error) lines.push(`错误：${answer.error}`, '')
    if (answer.interviewEnvironment) lines.push(`本次环境：${answer.interviewEnvironment.name} · 简历：${answer.interviewEnvironment.resumeName || '未选择'}`, '')
    const target = answer.interviewTarget
    if (target && (target.companyName || target.roleName || target.jobDescription)) {
      lines.push('#### 本次目标岗位', '', `公司：${target.companyName || '未填写'}`, `岗位：${target.roleName || '未填写'}`, '')
      if (target.jobDescription) lines.push('岗位 JD：', '', target.jobDescription, '')
    }
    if (answer.retrieval && answer.retrieval.status !== 'disabled') {
      lines.push('#### 本次检索资料', '', '以下为当时提供给模型的资料片段，不代表模型逐句引用。', '')
      if (answer.retrieval.message) lines.push(answer.retrieval.message, '')
      if (answer.retrieval.remote) lines.push(`百炼远程知识库 · Agent ID：${answer.retrieval.remote.agentId}`, '')
      for (const excerpt of answer.retrieval.excerpts) {
        const pages = excerpt.pageStart ? ` · 第 ${excerpt.pageStart}${excerpt.pageEnd && excerpt.pageEnd !== excerpt.pageStart ? `–${excerpt.pageEnd}` : ''} 页` : ''
        const source = excerpt.source === 'bailian' ? '百炼远程知识库' : `版本 ${excerpt.revision}`
        lines.push(`${excerpt.name} · ${source}${pages} · ${excerpt.kind === 'personal' ? '我的项目经历' : '技术参考'}`, '', excerpt.text, '')
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}
