import type { EnvironmentInput, InterviewLibrary, ReferenceDocument, Settings } from '../../../shared/types'
import EnvironmentHotwords from './EnvironmentHotwords'
import { environmentHotwordsError } from '../../../shared/environment-hotwords'
import EnvironmentReferencePicker from './EnvironmentReferencePicker'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { Dot } from './ui/pill'
import { TextField } from './ui/field'
import { ChoiceRow } from './ui/check-row'
import { interviewTypeDescriptions, interviewTypeLabels } from '../../../shared/interview-type'
import { AppSelect } from './ui/select'
import { cn } from '../lib/cn'
import { formNoteClass, inlineErrorClass } from '../lib/form'

interface EnvironmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: EnvironmentInput
  dirty: boolean
  library: InterviewLibrary | null
  references: ReferenceDocument[]
  referencesReady: boolean
  settings: Settings
  busy: boolean
  /** 当前环境 + 转写/回答进行中:字段与保存禁用 */
  editingBlocked: boolean
  error: string
  onChange: (draft: EnvironmentInput) => void
  onExtractHotwords: (input: EnvironmentInput) => Promise<string[]>
  onSave: () => void
}
/* v30 环境弹窗(spec §8.2):名称/简历/岗位/资料四段,底部状态/取消/保存;删除在卡片上 */
export default function EnvironmentDialog({ open, onOpenChange, draft, dirty, library, references, referencesReady, settings, busy, editingBlocked, error, onChange, onSave, onExtractHotwords }: EnvironmentDialogProps) {
  if (!library) return null
  const missingResume = Boolean(draft.resumeId && !library.resumes.some(record => record.id === draft.resumeId))
  const missingTarget = Boolean(draft.targetId && !library.targets.some(record => record.id === draft.targetId))
  const fieldsDisabled = busy || editingBlocked || !referencesReady
  const resumeOptions = [
    { value: '', label: '不选择简历' },
    ...(missingResume ? [{ value: draft.resumeId ?? '', label: '所选简历已失效，请重新选择' }] : []),
    ...library.resumes.map(record => ({ value: record.id, label: record.name })),
  ]
  const targetOptions = [
    { value: '', label: '不选择目标岗位' },
    ...(missingTarget ? [{ value: draft.targetId ?? '', label: '所选岗位已失效，请重新选择' }] : []),
    ...library.targets.map(record => ({ value: record.id, label: record.name })),
  ]
  return <>
    <Modal open={open} onOpenChange={onOpenChange} title={draft.id ? '编辑面试准备' : '新建面试准备'}
      footer={<>
        <span className="mr-3 inline-flex items-center gap-1.5 text-xs text-text-secondary" role="status" aria-live="polite">
          <Dot tone={dirty ? 'accent' : draft.id ? 'success' : 'muted'} pulse={false} />
          {dirty ? '尚未保存' : draft.id ? '已同步' : '新环境草稿'}
        </span>
        <Button variant="default" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
        <Button variant="primary" disabled={fieldsDisabled || !dirty || !draft.name.trim() || missingResume || missingTarget || Boolean(environmentHotwordsError(draft.hotwords ?? []))} onClick={onSave}>{busy ? '保存中…' : '保存环境'}</Button>
      </>}>
      <form onSubmit={event => { event.preventDefault(); onSave() }} noValidate>
        {editingBlocked && <p className="mb-4 rounded-chip border border-accent-line bg-accent-subtle px-4 py-3 text-xs leading-[1.8] text-text-secondary">面试进行中，当前面试准备已锁定。结束面试后可修改。</p>}
        {!settings.remoteKnowledge.enabled && !settings.retrieval.enabled && draft.referenceIds.length > 0 && <p className="mb-4 text-xs leading-[1.85] text-text-secondary">本地资料检索已关闭，需在个人背景 → 参考资料开启后使用。当前选择会保留。</p>}
        {!referencesReady && <p className={formNoteClass} role="status">正在读取可选参考资料…</p>}
        {error && <p className={cn(inlineErrorClass, 'mt-0 mb-4')} role="alert">{error}</p>}
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={fieldsDisabled}>
          <TextField className="mb-4" id="environment-name" label="环境名称" required maxLength={100} placeholder="例如：公司 A · 后端技术面" value={draft.name} disabled={fieldsDisabled} onChange={event => onChange({ ...draft, name: event.target.value })} />
          <fieldset className="mb-4 border-0 p-0" disabled={fieldsDisabled}>
            <legend className="text-sm font-medium text-text-regular">面试类型</legend>
            {(['technical', 'general'] as const).map(type => <ChoiceRow key={type} name="interview-type" value={type}
              label={interviewTypeLabels[type]} description={interviewTypeDescriptions[type]}
              checked={draft.interviewType === type} disabled={fieldsDisabled}
              onChange={checked => { if (checked) onChange({ ...draft, interviewType: type }) }} />)}
          </fieldset>
          <div className="mb-4 flex flex-col gap-2">
            <label htmlFor="environment-resume" className="text-[12.5px] font-medium text-text-regular">环境简历</label>
            <AppSelect id="environment-resume" size="lg" value={draft.resumeId ?? ''} options={resumeOptions} aria-invalid={missingResume} disabled={fieldsDisabled} onValueChange={value => onChange({ ...draft, resumeId: value || null })} />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <label htmlFor="environment-target" className="text-[12.5px] font-medium text-text-regular">环境目标岗位</label>
            <AppSelect id="environment-target" size="lg" value={draft.targetId ?? ''} options={targetOptions} aria-invalid={missingTarget} disabled={fieldsDisabled} onValueChange={value => onChange({ ...draft, targetId: value || null })} />
          </div>
          {(missingResume || missingTarget) && <p className={cn(inlineErrorClass, 'mt-0 mb-4')} role="alert">存在失效的简历或岗位，请重新选择或改为不选择后保存。</p>}
          <EnvironmentReferencePicker documents={references} selected={draft.referenceIds} disabled={fieldsDisabled} onChange={referenceIds => onChange({ ...draft, referenceIds })} />
          {open && <EnvironmentHotwords key={draft.id ?? 'new'} draft={draft} disabled={fieldsDisabled} onChange={onChange} onExtract={onExtractHotwords} />}
        </fieldset>
      </form>
    </Modal>
  </>
}
