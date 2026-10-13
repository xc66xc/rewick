import JobExperienceTag from './JobExperienceTag'
import EnvironmentStamp from './EnvironmentStamp'
import { ArrowRight, Briefcase, FileText, PencilSimple, Stack, Trash } from '@phosphor-icons/react'
import type { InterviewEnvironment, ResumeProfile, TargetProfile } from '../../../shared/types'
import { Button } from './ui/button'
import { Pill } from './ui/pill'
import { interviewTypeLabels } from '../../../shared/interview-type'
import { cn } from '../lib/cn'
import { textButtonClass } from '../lib/form'

interface EnvironmentCardProps {
  environment: InterviewEnvironment
  resume?: ResumeProfile
  target?: TargetProfile
  current: boolean
  resumeReady: boolean
  /** 开始按钮的阻断原因:简历无正文 / 无可用时长 */
  startBlocked: false | 'resume' | 'wallet'
  busy: boolean
  timerActive: boolean
  sessionActive: boolean
  onStamp?: () => void
  onEdit: () => void
  onDelete: () => void
  onStart: () => void
  /** 面试进行中且为当前卡:直接回到工作台 */
  onReturn: () => void
  onContext: () => void
}
function formatUpdatedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `更新于 ${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}` }
/* v30 环境卡(spec §5):字母标 + 当前使用/日期、名称与岗位行、资源三行、底部编辑/开始操作 */
export default function EnvironmentCard({ environment, resume, target, current, resumeReady, startBlocked, busy, timerActive, sessionActive, onStamp, onEdit, onDelete, onStart, onReturn, onContext }: EnvironmentCardProps) {
  const resumeLabel = resume?.name ?? (environment.resumeId ? '所选简历已失效' : '未选择')
  const targetLabel = target?.name ?? (environment.targetId ? '所选岗位已失效' : '未选择')
  const referenceLabel = environment.referenceIds.length ? `${environment.referenceIds.length} 份参考资料` : '未选择'
  const targetLine = target?.name ?? (environment.targetId ? '所选岗位已失效' : '未选择岗位')
  const blockTitle = startBlocked === 'resume' ? '请选择有正文内容的简历' : startBlocked === 'wallet' ? '暂无可用时长，请联系管理员分配' : undefined
  return <article aria-label={`面试环境 ${environment.name}`} className={cn('flex h-full min-w-0 flex-col rounded-card border p-[18px] shadow-card transition-[border-color,box-shadow] hover:shadow-pop', current ? 'env-card-selected' : 'border-border bg-card hover:border-border-hover')}>
    <div className="flex items-center gap-3 py-1.5">
      <span aria-hidden="true" className={cn('grid size-[34px] shrink-0 place-items-center rounded-control text-[15px] font-semibold', current ? 'brand-gradient text-text-on-fill' : 'bg-accent-subtle text-accent-text')}>
        {environment.name.trim().charAt(0).toUpperCase() || '面'}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-[650] text-text-heading" title={environment.name}>{environment.name}</h3>
        <p className="mt-0.5 truncate text-xs text-text-secondary" title={targetLine}>{targetLine}</p>
      </div>
      {current
        ? <Pill className="self-start border-accent-line bg-card text-accent-text"><span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />当前使用</Pill>
        : formatUpdatedAt(environment.updatedAt) && <span className="shrink-0 self-start text-[11px] text-text-muted">{formatUpdatedAt(environment.updatedAt)}</span>}
    </div>
    <div className="environment-card__status">
      <div className="environment-card__tags"><Pill className="shrink-0">{interviewTypeLabels[environment.interviewType]}</Pill><JobExperienceTag level={environment.jobExperienceLevel} /></div>
      <EnvironmentStamp stamp={environment.stamp} name={environment.name} disabled={busy} onEdit={onStamp} />
    </div>
    <dl className="mt-3 border-t border-border text-xs text-text-regular">
      <div className="flex items-center gap-2 border-b border-border py-2.5"><FileText size={13} aria-hidden="true" className="shrink-0 text-text-muted" /><dd className="m-0 min-w-0 flex-1 truncate" title={resumeLabel}>{resumeLabel}</dd><dt className="shrink-0 text-[10px] text-text-muted">简历</dt></div>
      <div className="flex items-center gap-2 border-b border-border py-2.5"><Briefcase size={13} aria-hidden="true" className="shrink-0 text-text-muted" /><dd className="m-0 min-w-0 flex-1 truncate" title={targetLabel}>{targetLabel}</dd><dt className="shrink-0 text-[10px] text-text-muted">岗位</dt></div>
      <div className="flex items-center gap-2 py-2.5"><Stack size={13} aria-hidden="true" className="shrink-0 text-text-muted" /><dd className="m-0 min-w-0 flex-1 truncate" title={referenceLabel}>{referenceLabel}</dd><dt className="shrink-0 text-[10px] text-text-muted">资料</dt></div>
    </dl>
    {!resumeReady && <p className="mt-2 text-xs leading-[1.7] text-text-secondary">请选择有正文内容的简历。<button type="button" className={textButtonClass} onClick={onContext}>填写或导入简历 PDF</button></p>}
    <div className="mt-auto flex flex-wrap items-center gap-[14px] pt-3">
      <button type="button" className={cn(textButtonClass, 'text-accent-text')} aria-label={`编辑环境 ${environment.name}`} disabled={busy || (current && sessionActive)} onClick={onEdit}><PencilSimple size={13} aria-hidden="true" className="shrink-0" />编辑</button>
      <button type="button" className={cn(textButtonClass, 'text-danger')} aria-label={`删除环境 ${environment.name}`} disabled={busy || current} title={current ? '当前环境需先切换到其他环境后才能删除' : undefined} onClick={onDelete}><Trash size={13} aria-hidden="true" className="shrink-0" />删除</button>
      <div className="ml-auto">
        {timerActive && current ? <Button variant="primary" size="sm" onClick={onReturn}>返回工作台</Button>
          : timerActive ? <Button variant="primary" size="sm" disabled title="面试进行中，请先结束本场面试">开始面试</Button>
            : <Button variant="primary" size="sm" disabled={Boolean(startBlocked) || busy} title={blockTitle} loading={busy} onClick={onStart}>开始面试<ArrowRight size={14} aria-hidden="true" /></Button>}
      </div>
    </div>
  </article>
}
