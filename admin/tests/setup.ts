import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/vue'

// Business tests run at the accessible final motion state. Native motion/geometry
// are covered in the Chromium migration suite rather than jsdom animations.
Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string): MediaQueryList => ({
  matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
}) })
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
Element.prototype.scrollIntoView = vi.fn()
class TestResizeObserver { observe() {} unobserve() {} disconnect() {} }
Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver })
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver })
if (!window.requestAnimationFrame) window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 0)
if (!window.cancelAnimationFrame) window.cancelAnimationFrame = handle => window.clearTimeout(handle)
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
