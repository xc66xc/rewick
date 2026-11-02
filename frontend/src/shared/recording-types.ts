export interface RecordingInfo {
  sessionId: string
  status: 'recording' | 'saved' | 'interrupted'
  durationSeconds: number
  bytes: number
}

export interface RecordingProgress {
  sessionId: string
  stage: 'transcribing' | 'summarizing' | 'exporting' | RecordingResourceProgress['stage']
  completed: number
  total: number
  resourceId?: string
  downloadedBytes?: number
  totalBytes?: number
}

export interface RecordingResourceStatus {
  ready: boolean
  downloadBytes: number
  requiredBytes: number
}

export interface RecordingResourceProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'checking'
  resourceId: string
  downloadedBytes?: number
  totalBytes?: number
}
