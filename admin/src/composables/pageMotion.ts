import { gsap, EASE, motionSkipped, pageEnter } from './motion'
const observers = new WeakMap<Element, MutationObserver>()
export function enterBusinessPage(el: Element, done: () => void) {
  pageEnter(el, done)
  const seen = new WeakSet<Element>()
  el.querySelectorAll('.reveal, .bento').forEach(node => seen.add(node))
  const observer = new MutationObserver(() => {
    const added = Array.from(el.querySelectorAll('.reveal, .bento')).filter(node => !seen.has(node)).slice(0, 20)
    added.forEach(node => seen.add(node))
    if (added.length && !motionSkipped()) gsap.fromTo(added, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .62, stagger: .05, ease: EASE.reveal, clearProps: 'opacity,transform' })
  })
  observer.observe(el, { childList: true, subtree: true })
  observers.get(el)?.disconnect(); observers.set(el, observer)
}
export function stopBusinessPage(el: Element) { observers.get(el)?.disconnect(); observers.delete(el); gsap.killTweensOf(el.querySelectorAll('.reveal, .bento, tbody tr')) }
