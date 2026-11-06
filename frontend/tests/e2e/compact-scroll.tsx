import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import AnswerPanel from '../../src/renderer/src/components/AnswerPanel'
import { defaultSettings } from '../../src/shared/defaults'
import type { Answer, SessionRecord, TranscriptSegment } from '../../src/shared/types'
import { PendingTranscript } from '../../src/renderer/src/hooks/pendingTranscript'
import '../../src/renderer/src/styles/tokens.css'

interface Scenario { answers: Answer[]; segments?: TranscriptSegment[]; compact?: boolean; fontSize?: number; id?: string }
declare global { interface Window { compactScrollFixture: { set: (value: Scenario) => void } } }
function Fixture() {
  const [scenario, setScenario] = useState<Scenario>({ answers: [] })
  const [question, setQuestion] = useState('')
  useLayoutEffect(() => { window.compactScrollFixture = { set: setScenario } }, [])
  const record: SessionRecord = { id: scenario.id ?? 'scroll-fixture', title: '合成滚动测试', createdAt: '2026-11-03T10:00:00+08:00', answers: scenario.answers, segments: scenario.segments ?? [] }
  const preview = new PendingTranscript()
  for (const segment of record.segments) preview.receive(segment)
  const style = { '--compact-font-size': `${scenario.fontSize ?? 19}px` } as CSSProperties
  return <main className={`flex h-dvh min-h-0 flex-col${scenario.compact !== false ? ' compact-surface' : ''}`} style={style}><AnswerPanel settings={defaultSettings} compact={scenario.compact !== false} onSettings={() => {}} onContext={() => {}}
    session={{ record, questionPreview: preview.snapshot(), question, setQuestion, questionAssembling: false, busy: scenario.answers.some(a => a.status === 'streaming'), desktop: true, generate: async () => {}, cancel: async () => {} }} /></main>
}
const element = document.getElementById('root')
if (element) createRoot(element).render(<Fixture />)
