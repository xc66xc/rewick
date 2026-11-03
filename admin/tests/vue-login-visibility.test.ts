import { expect, it } from 'vitest'
import { render } from '@testing-library/vue'
import LoginPage from '../src/views/LoginPage.vue'
import loginStyles from '../src/styles/pages.css?raw'

it('keeps the login form and its introduction painted when entrance motion is skipped', () => {
  // Use the shipped CSS: DOM presence and toBeVisible miss transparent content.
  const stylesheet = document.createElement('style')
  stylesheet.textContent = loginStyles
  document.head.append(stylesheet)
  const view = render(LoginPage, { props: { busy: false, error: '', login: async () => false } })
  try {
    const nodes = view.container.querySelectorAll('.login-card,.hero-line,.cap-item,.login-brand,.login-plate,.login-dial')
    expect(nodes.length).toBeGreaterThan(8)
    for (const node of nodes) expect(getComputedStyle(node).opacity).not.toBe('0')
  } finally { view.unmount(); stylesheet.remove() }
})
