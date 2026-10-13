import { useEffect, useRef } from 'react'
import type { DesktopBridge, SessionRecord } from '../../../shared/types'
import type { TelemetryEvent } from '../../../shared/telemetry'

interface PendingRender { operationId: string; requestId: string; started: number; startedAt: string; sent: boolean }
/** useEffect observes React's committed text, without depending on animation frames or visible windows. */
export function useOperationsTelemetry(bridge: DesktopBridge | undefined, record: SessionRecord, accountId?: string) {
  const enabled = useRef(false)
  const pending = useRef<PendingRender | undefined>(undefined)
  useEffect(() => {
    let active = true
    const refresh = () => { void bridge?.telemetryEnabled?.().then(value => { if (active) enabled.current = value }).catch(() => { enabled.current = false }) }
    refresh()
    const timer = setInterval(refresh, 60000)
    return () => { active = false; clearInterval(timer); enabled.current = false; pending.current = undefined }
  }, [bridge, accountId])
  useEffect(() => {
    const value = pending.current
    if (!value || value.sent || !enabled.current) return
    const answer = record.answers.find(answer => answer.id === value.requestId)
    if (!answer?.text.trim()) return
    value.sent = true
    bridge?.reportTelemetry?.({ eventId: crypto.randomUUID(), spanId: crypto.randomUUID(), operationId: value.operationId,
      requestId: value.requestId, sessionId: record.interviewSessionId, stage: 'answer.first_render', source: 'desktop', startedAt: value.startedAt,
      offsetMs: 0, durationMs: Math.max(0, performance.now() - value.started), outcome: 'success', providerType: 'llm' })
  }, [bridge, record])
  return {
    begin: (operationId: string, requestId: string) => { pending.current = enabled.current ? { operationId, requestId, started: performance.now(), startedAt: new Date().toISOString(), sent: false } : undefined },
    feedback: (filteredCount: number) => {
      if (!enabled.current) return
      const event: TelemetryEvent = { eventId: crypto.randomUUID(), spanId: crypto.randomUUID(), operationId: crypto.randomUUID(),
        sessionId: record.interviewSessionId, stage: 'auto.feedback', source: 'desktop', startedAt: new Date().toISOString(), offsetMs: 0, durationMs: 0,
        outcome: 'skipped', reason: 'feedback', providerType: 'system', metadata: { filteredCount } }
      bridge?.reportTelemetry?.(event)
    },
  }
}
