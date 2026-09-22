import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../../../shared/types'
import { MixedRecordingCapture } from '../audio/mixed-recording-capture'
import { RecordingWriter } from '../audio/recording-writer'
import { errorMessage } from './useSettings'

export function useInterviewRecording(bridge: DesktopBridge, sessionId: string, active: boolean, prepare: () => Promise<void>) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const operation = useRef<{ id: string; capture: MixedRecordingCapture; writer: RecordingWriter | null; opened: boolean } | null>(null)
  const stopping = useRef<Promise<void> | null>(null)
  async function stop() {
    if (stopping.current) return stopping.current
    const current = operation.current
    if (!current) return
    setState('stopping')
    stopping.current = (async () => {
      try { await current.capture.stop() } catch (reason) { setError(errorMessage(reason)) }
      try { await current.writer?.finish() } catch (reason) { setError(errorMessage(reason)) }
      const saved = current.opened ? await bridge.recordings?.stop(current.id) : null
      if (operation.current === current) operation.current = null
      setState(saved && saved.bytes > 0 ? 'saved' : 'idle')
    })().catch(reason => { setError(errorMessage(reason)); operation.current = null; setState('idle') }).finally(() => { stopping.current = null })
    return stopping.current
  }
  async function start() {
    const api = bridge.recordings
    if (!api || operation.current || !active) return
    const current = { id: sessionId, capture: new MixedRecordingCapture(), writer: null as RecordingWriter | null, opened: false }
    operation.current = current
    setError(''); setState('starting'); setSeconds(0)
    try {
      await prepare()
      if (operation.current !== current) return
      await api.start(current.id)
      current.opened = true
      if (operation.current !== current) { await api.stop(current.id); return }
      current.writer = new RecordingWriter(buffer => api.append(current.id, buffer), reason => { setError(errorMessage(reason)); void stop() })
      await current.capture.start(buffer => current.writer?.append(buffer), () => { setError('音频采集已结束，录音已停止。'); void stop() })
      if (operation.current === current && !stopping.current) setState('recording')
    } catch (reason) { setError(errorMessage(reason)); await stop() }
  }
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    setState('idle'); setSeconds(0); setError('')
    let current = true
    void bridge.recordings?.info(sessionId).then(info => { if (current && info && info.bytes > 0 && !operation.current) setState('saved') }).catch(reason => { if (current) setError(errorMessage(reason)) })
    return () => { current = false; void stopRef.current() }
  }, [bridge, sessionId])
  useEffect(() => {
    if (!active) void stopRef.current()
  }, [active])
  useEffect(() => {
    const off = bridge.onEvent(event => { if (event.kind === 'session-stopping') void stopRef.current() })
    return () => { off(); void stopRef.current() }
  }, [bridge])
  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => setSeconds(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [state])
  return { state, error, seconds, start, stop, supported: Boolean(bridge.recordings) }
}
