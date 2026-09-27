import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../../../shared/types'
import { MixedRecordingCapture } from '../audio/mixed-recording-capture'
import { RecordingWriter } from '../audio/recording-writer'
import { errorMessage } from './useSettings'

interface Operation {
  id: string
  capture: MixedRecordingCapture
  writer: RecordingWriter | null
  opening?: Promise<void>
  cancelled: boolean
}
export function useInterviewRecording(bridge: DesktopBridge, sessionId: string, active: boolean, prepare: () => Promise<void>) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const operation = useRef<Operation | null>(null)
  const stopping = useRef<Promise<void> | null>(null)
  const clock = useRef({ seconds: 0, started: 0 })
  const latest = useRef({ active, sessionId, prepare })
  latest.current = { active, sessionId, prepare }
  async function stop() {
    if (stopping.current) return stopping.current
    const current = operation.current
    if (!current) return
    current.cancelled = true
    setState('stopping')
    stopping.current = (async () => {
      try { await current.capture.stop() } catch (reason) { setError(errorMessage(reason)) }
      try { await current.writer?.finish() } catch (reason) { setError(errorMessage(reason)) }
      if (current.opening) {
        await current.opening
        const saved = await bridge.recordings?.stop(current.id)
        if (latest.current.sessionId === current.id) setState(saved && saved.bytes > 0 ? 'saved' : 'idle')
      } else setState('idle')
    })().catch(reason => { setError(errorMessage(reason)); setState('idle') }).finally(() => {
      if (operation.current === current) operation.current = null
      stopping.current = null
    })
    return stopping.current
  }
  async function start() {
    const api = bridge.recordings
    if (!api || operation.current || !latest.current.active) return
    const current: Operation = { id: latest.current.sessionId, capture: new MixedRecordingCapture(), writer: null, cancelled: false }
    operation.current = current
    setError(''); setState('starting'); setSeconds(0)
    try {
      await latest.current.prepare()
      if (current.cancelled) return
      const info = await api.info(current.id)
      if (current.cancelled) return
      setSeconds(Math.floor(info?.durationSeconds ?? 0))
      current.opening = api.start(current.id)
      await current.opening
      if (current.cancelled) return
      current.writer = new RecordingWriter(buffer => api.append(current.id, buffer), reason => { setError(errorMessage(reason)); void stop() })
      await current.capture.start(buffer => current.writer?.append(buffer), () => { setError('录音已中断，已保存已录制的内容。'); void stop() })
      if (!current.cancelled) {
        clock.current = { seconds: Math.floor(info?.durationSeconds ?? 0), started: performance.now() }
        setState('recording')
      }
    } catch (reason) {
      if (!current.cancelled) {
        setError(reason instanceof Error && reason.name === 'NotAllowedError'
          ? '录音权限未开启，请允许系统声音与麦克风访问后重试录音。' : errorMessage(reason))
        await stop()
      }
    }
  }
  const actions = useRef({ start, stop })
  actions.current = { start, stop }
  useEffect(() => {
    let live = true
    // Serialize session changes with the previous file's final flush.
    void (async () => {
      await stopping.current
      if (!live) return
      setState('idle'); setSeconds(0); setError('')
      if (active) await actions.current.start()
    })()
    return () => { live = false; void actions.current.stop() }
  }, [bridge, sessionId, active])
  useEffect(() => bridge.onEvent(event => {
    if (event.kind === 'session-stopping') void actions.current.stop()
  }), [bridge])
  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => setSeconds(clock.current.seconds + Math.floor((performance.now() - clock.current.started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [state])
  return { state, error, seconds, start, stop, supported: Boolean(bridge.recordings) }
}
