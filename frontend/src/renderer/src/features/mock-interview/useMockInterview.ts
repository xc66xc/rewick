import { useEffect, useRef, useState } from 'react'
import type { MockBridge, MockSession } from '../../../../shared/mock-interview'
import { MockSessionController, type MockView } from './mock-session-controller'
export function useMockInterview(bridge: MockBridge, onActive: (active: boolean) => void) {
  const [view, setView] = useState<MockView>({ draft: '', partial: '', busy: false, editing: false, connected: false, micReady: false, level: 0, error: '' })
  const audioLevel = useRef(0)
  const controller = useRef<MockSessionController | null>(null)
  const activeCallback = useRef(onActive); activeCallback.current = onActive
  useEffect(() => {
    const instance = new MockSessionController(bridge, value => { setView(value); activeCallback.current(Boolean(value.session && !['completed', 'ready', 'paused', 'error'].includes(value.session.state))) }, level => { audioLevel.current = level })
    controller.current = instance
    return () => { controller.current = null; activeCallback.current(false); void instance.dispose().catch(error => console.error('模拟面试清理失败', error)) }
  }, [bridge])
  return { ...view, audioLevel, open: (session: MockSession) => controller.current?.open(session), command: (command: Parameters<MockSessionController['command']>[0]) => controller.current?.command(command), edit: (text: string) => controller.current?.edit(text), editing: (value: boolean) => controller.current?.editing(value), close: () => controller.current?.dispose() }
}
