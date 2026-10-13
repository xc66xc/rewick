import type { JobExperienceLevel } from '../../../shared/job-experience-level'
import { jobExperienceLevels, jobExperienceLabels, jobExperienceDescriptions } from '../../../shared/job-experience-level'
import { ChoiceRow } from './ui/check-row'
import { Button } from './ui/button'

interface JobExperiencePickerProps {
  value?: JobExperienceLevel | null
  disabled: boolean
  onChange: (value: JobExperienceLevel | null) => void
}
export default function JobExperiencePicker({ value, disabled, onChange }: JobExperiencePickerProps) {
  return <fieldset className="mb-4 min-w-0 border-0 p-0" disabled={disabled}>
    <legend className="text-sm font-medium text-text-regular">岗位经验要求</legend>
    <div className="grid grid-cols-2 gap-x-2 max-[400px]:grid-cols-1">
      {jobExperienceLevels.map(level => <ChoiceRow key={level} name="job-experience-level" value={level}
        label={<span className="flex flex-col gap-1"><span>{jobExperienceLabels[level]}</span><span className="text-xs text-text-secondary">{jobExperienceDescriptions[level]}</span></span>}
        checked={value === level} disabled={disabled} onChange={checked => { if (checked) onChange(level) }} />)}
    </div>
    <div className="mt-2 flex items-start gap-2"><p className="flex-1 text-xs leading-relaxed text-text-secondary">这是岗位要求，用于调整回答侧重点，不代表你的实际工作年限。</p>
      <Button variant="quiet" size="xs" disabled={disabled || !value} onClick={() => onChange(null)}>不设置</Button></div>
  </fieldset>
}
