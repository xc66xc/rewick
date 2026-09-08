import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
Element.prototype.scrollIntoView = vi.fn()
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
