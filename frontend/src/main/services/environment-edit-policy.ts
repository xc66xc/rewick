import type { EnvironmentInput, InterviewEnvironmentSnapshot } from '../../shared/types'

/** Only existing non-session environments can bypass the global interview edit lock. */
export function canSaveOtherEnvironment(input: EnvironmentInput, active: boolean, frozen?: InterviewEnvironmentSnapshot | null): boolean {
  return active && Boolean(input.id && (input.version ?? 0) > 0 && frozen?.id && input.id !== frozen.id)
}
