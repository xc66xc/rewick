import { useLayoutEffect, useRef } from 'react'

function resizeTextarea(element: HTMLTextAreaElement | null): void {
  if (!element) return
  element.style.height = 'auto'
  const borderHeight = element.offsetHeight - element.clientHeight
  element.style.height = `${element.scrollHeight + borderHeight}px`
}

export function useAutosizeTextarea(value: string) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { resizeTextarea(textarea.current) }, [value])
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    let previousWidth = element.getBoundingClientRect().width
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width === undefined || width === previousWidth) return
      previousWidth = width
      resizeTextarea(element)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, []) // Observe width changes for the lifetime of this textarea without touching selection.
  return textarea
}
