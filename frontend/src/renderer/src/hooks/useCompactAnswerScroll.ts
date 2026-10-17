import { useLayoutEffect, useRef } from 'react'
import type { Answer } from '../../../shared/types'

export function useCompactAnswerScroll(compact: boolean, answers: Answer[], transcript?: string) {
  const viewport = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useLayoutEffect(() => { following.current = true }, [compact])
  useLayoutEffect(() => {
    const element = viewport.current
    if (compact && following.current && element) {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    }
  }, [compact, answers, transcript])

  function handleScroll() {
    const element = viewport.current
    if (compact && element) {
      following.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 24
    }
  }

  function followLatest() {
    following.current = true
    const element = viewport.current
    if (element) element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  }

  return { viewport, handleScroll, followLatest }
}
