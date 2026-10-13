import type { JobExperienceLevel } from '../../../shared/job-experience-level'
import { jobExperienceShortLabels } from '../../../shared/job-experience-level'
import { Pill } from './ui/pill'

interface JobExperienceTagProps { level?: JobExperienceLevel | null }
export default function JobExperienceTag({ level }: JobExperienceTagProps) {
  return level ? <Pill className="shrink-0">岗位要求：{jobExperienceShortLabels[level]}</Pill> : null
}
