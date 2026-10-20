import { useLayoutEffect, useRef } from 'react'
import type { Answer } from '../../../shared/types'

/** Compact chat is newest-first. Keep the reader's visible turn anchored while older text is read. */
export function useCompactAnswerScroll(compact: boolean, answers: Answer[], transcript?: string, recordId?: string) {
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const anchor = useRef<{ element: HTMLElement; offset: number } | null>(null)

  function rememberAnchor() {
    const element = viewport.current
    if (!element || !compact) return
    if (following.current) { anchor.current = null; return }
    const top = element.getBoundingClientRect().top
    const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-answer-id], [data-transcript-id]'))
      .find(turn => turn.getBoundingClientRect().bottom > top)
    anchor.current = visible ? { element: visible, offset: visible.getBoundingClientRect().top - top } : null
  }

  useLayoutEffect(() => { following.current = true; anchor.current = null }, [compact, recordId])
  useLayoutEffect(() => {
    const element = viewport.current
    if (!compact || !element) return
    if (following.current) element.scrollTop = 0
    else if (anchor.current && element.contains(anchor.current.element)) {
      const nextOffset = anchor.current.element.getBoundingClientRect().top - element.getBoundingClientRect().top
      element.scrollTop += nextOffset - anchor.current.offset
    }
    rememberAnchor()
  }, [compact, answers, transcript, recordId])

  function handleScroll() {
    const element = viewport.current
    if (compact && element) {
      following.current = element.scrollTop <= 24
      rememberAnchor()
    }
  }

  function followLatest() {
    following.current = true
    const element = viewport.current
    if (element) element.scrollTop = 0
    rememberAnchor()
  }

  return { viewport, handleScroll, followLatest }
}
