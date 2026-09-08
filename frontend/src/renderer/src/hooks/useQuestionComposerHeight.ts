import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Size only an assembled question; ordinary drafts retain native manual resizing. */
export function useQuestionComposerHeight(elementRef: RefObject<HTMLTextAreaElement | null>, value: string, assembling: boolean): void {
  const wasAssembling = useRef(false)
  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    if (!assembling) {
      if (wasAssembling.current) { element.style.removeProperty('height'); element.scrollTop = 0 }
      wasAssembling.current = false
      return
    }
    wasAssembling.current = true
    function resize() {
      if (!element) return
      const previousScroll = element.scrollTop
      const computed = getComputedStyle(element)
      const lineHeight = Number.parseFloat(computed.lineHeight) || (Number.parseFloat(computed.fontSize) || 12) * 1.8
      const padding = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0)
      const border = (Number.parseFloat(computed.borderTopWidth) || 0) + (Number.parseFloat(computed.borderBottomWidth) || 0)
      element.style.height = 'auto'
      element.style.height = `${Math.min(element.scrollHeight + border, lineHeight * 3 + padding + border)}px`
      element.scrollTop = previousScroll
    }
    resize()
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth; resize()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [elementRef, value, assembling])
}
