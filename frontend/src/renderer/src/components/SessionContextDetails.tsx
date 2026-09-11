import { CaretDown } from '@phosphor-icons/react'
import type { InterviewEnvironmentSnapshot, InterviewTarget, SessionRecord, Settings } from '../../../shared/types'

interface SessionContextDetailsProps {
  record: Pick<SessionRecord, 'answers' | 'interviewEnvironment'>
  current?: Pick<Settings, 'interviewEnvironment' | 'interviewTarget'>
}
interface ContextGroup {
  key: string
  environment?: InterviewEnvironmentSnapshot
  target?: InterviewTarget
  questions: string[]
}

function collectContexts(record: SessionContextDetailsProps['record'], current: SessionContextDetailsProps['current']): ContextGroup[] {
  if (!record.answers.length) return [{
    key: 'preview', environment: current?.interviewEnvironment ?? record.interviewEnvironment,
    target: current?.interviewTarget, questions: []
  }]
  const groups = new Map<string, ContextGroup>()
  record.answers.forEach((answer, index) => {
    const environment = answer.interviewEnvironment
    const target = answer.interviewTarget
    const key = JSON.stringify([environment?.id, environment?.name, environment?.resumeId, environment?.resumeName,
      environment?.targetId, environment?.targetName, environment ? [...environment.referenceIds].sort() : undefined,
      target?.companyName, target?.roleName, target?.jobDescription])
    let group = groups.get(key)
    if (!group) { group = { key: answer.id, environment, target, questions: [] }; groups.set(key, group) }
    group.questions.push(`Q${String(index + 1).padStart(2, '0')}`)
  })
  return [...groups.values()]
}

function contextLabel(group: ContextGroup | undefined): string {
  if (!group) return '未记录'
  return group.environment?.name || [group.target?.companyName, group.target?.roleName].filter(Boolean).join(' · ')
    || (group.target?.jobDescription ? '已填写岗位 JD' : '未设置环境或目标')
}

export default function SessionContextDetails({ record, current }: SessionContextDetailsProps) {
  const groups = collectContexts(record, current)
  const hasAnswers = record.answers.length > 0
  const description = hasAnswers ? '以下为回答使用的面试信息。' : current ? '当前配置，将用于接下来的回答。' : '这场会话保存的面试环境。'
  return <details className="group min-w-0 shrink-0 border-b border-border bg-subtle text-xs text-text-secondary" aria-label="面试信息">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-5 py-3 font-medium text-text-secondary transition-colors hover:text-text-primary [&::-webkit-details-marker]:hidden">
      <CaretDown size={13} weight="bold" aria-hidden="true" className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" />
      面试信息
      <span className="ml-2 min-w-0 truncate text-accent-text">{groups.length > 1 ? `${groups.length} 组回答记录` : contextLabel(groups[0])}</span>
    </summary>
    <div className="flex max-h-[min(280px,28vh)] flex-col gap-4 overflow-y-auto px-5 pb-4" role="region" aria-label="面试环境与目标详情" tabIndex={0}>
      <p className="text-text-muted">{description}</p>
      {groups.map(group => <section key={group.key} className="min-w-0">
        {groups.length > 1 && <p className="mb-2 font-mono text-success [overflow-wrap:anywhere]">用于 {group.questions.join('、')}</p>}
        {group.environment || group.target ? <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
            {group.environment && <>
              <dt className="text-text-muted">面试环境</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">{group.environment.name}</dd>
              <dt className="text-text-muted">使用简历</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">{group.environment.resumeName || '未选择'}</dd>
              <dt className="text-text-muted">目标岗位</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">{group.environment.targetName || '未选择'}</dd>
              <dt className="text-text-muted">参考资料</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">已选择 {group.environment.referenceIds.length} 份</dd>
            </>}
            {group.target && <><dt className="text-text-muted">面试公司</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">{group.target.companyName || '未填写'}</dd><dt className="text-text-muted">岗位名称</dt><dd className="m-0 text-text-primary [overflow-wrap:anywhere]">{group.target.roleName || '未填写'}</dd></>}
          </dl>
          {group.target && <div className="mt-3"><strong className="font-medium text-text-primary">岗位 JD</strong><p className="mt-1 whitespace-pre-wrap leading-[1.85] [overflow-wrap:anywhere]">{group.target.jobDescription || '未填写岗位 JD。'}</p></div>}
        </> : <p className="text-text-muted">{hasAnswers ? '这组回答未记录面试信息，可查看各回答的本次发送内容。' : '尚未设置面试环境或目标。'}</p>}
      </section>)}
    </div>
  </details>
}
