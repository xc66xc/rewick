import { useEffect, useRef } from 'react'
export function useWorkspaceMotion(page: string, enabled: boolean) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const animations = new Set<Animation>()
    function stop() { animations.forEach(animation => animation.cancel()); animations.clear() }
    function visibility() {
      root.dataset.pageHidden = String(document.hidden)
      if (document.hidden) stop()
    }
    visibility()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (enabled && !document.hidden && !reduced?.matches) {
      const visible = Array.from(ref.current?.children ?? []).filter(node => node instanceof HTMLElement && !node.hidden)
      const targets = visible.flatMap(node => Array.from(node.children).slice(0, 4))
      targets.slice(0, 6).forEach((node, index) => {
        const animation = node.animate?.([{ opacity: .35, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 380, delay: index * 35, easing: 'cubic-bezier(.16,1,.3,1)' })
        if (animation) { animations.add(animation); animation.onfinish = () => { animation.cancel(); animations.delete(animation) } }
      })
    }
    function preference() { if (root.dataset.motion === 'reduced') stop() }
    const observer = new MutationObserver(preference)
    observer.observe(root, { attributes: true, attributeFilter: ['data-motion'] })
    document.addEventListener('visibilitychange', visibility)
    return () => { stop(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [page, enabled])
  return ref
}
