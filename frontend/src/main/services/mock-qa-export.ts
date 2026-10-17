import { mockSessionSchema, type MockSession } from '../../shared/mock-interview'
import { interviewTypeLabels } from '../../shared/interview-type'

function verbatim(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)))
  return `${fence}text\n${text}\n${fence}`
}

export function mockQaToMarkdown(input: MockSession): string {
  const session = mockSessionSchema.parse(input)
  const lines = ['# 模拟面试 Q&A', '', `面试环境：${session.environmentName.replace(/[\r\n]/g, ' ')}`,
    `面试类型：${interviewTypeLabels[session.interviewType]}`, `开始时间：${session.createdAt}`,
    `实际用时：${Math.floor(session.usedSeconds / 60)} 分 ${session.usedSeconds % 60} 秒`,
    '', '以下为已保存的面试问题和用户回答原文，不包含 AI 复盘或参考答案。', '']
  if (!session.turns.length) lines.push('暂无问答记录。', '')
  for (const turn of session.turns) {
    lines.push(`## 第 ${turn.number} 题`, '', '### Q · 面试官问题', '', verbatim(turn.question), '', '### A · 我的回答', '')
    if (turn.answerText.trim()) lines.push(verbatim(turn.answerText), '')
    else lines.push(turn.status === 'skipped' ? '（已跳过）' : '（未回答）', '')
  }
  return lines.join('\n')
}
