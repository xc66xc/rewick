import { useLayoutEffect, useRef } from 'react'
import type { TranscriptSegment } from '../../../shared/types'

interface CompactTranscriptProps { segment?: TranscriptSegment }

export default function CompactTranscript({ segment }: CompactTranscriptProps) {
  const viewport = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const element = viewport.current
    if (element) element.scrollTop = element.scrollHeight
  }, [segment?.id, segment?.text])

  return <section aria-label="实时转写" className="shrink-0 border-b border-border px-4 py-3">
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-text-secondary">
      <h2 className="font-medium">实时转写</h2>
      <span>{segment ? segment.isFinal ? '已识别' : '识别中…' : '等待语音'}</span>
    </div>
    <p ref={viewport} tabIndex={0} aria-label="最新转写文字" aria-live="polite" aria-atomic="true"
      className="compact-transcript__text m-0 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
      {segment?.text || '开始转写后，识别文字会实时显示在这里。'}
    </p>
  </section>
}
