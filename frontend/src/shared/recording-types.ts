export interface RecordingInfo {
  sessionId: string
  status: 'recording' | 'saved' | 'interrupted'
  durationSeconds: number
  bytes: number
}

export interface RecordingProgress {
  sessionId: string
  stage: 'transcribing' | 'summarizing' | 'exporting'
  completed: number
  total: number
}
