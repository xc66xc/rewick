import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import Modal from '../src/components/ui/Modal.vue'
import { overlayEnter, overlayLeave, pageEnter, pageLeave, prefersReducedMotion } from '../src/composables/motion'

const Consumer = defineComponent({
  props: { busy: Boolean },
  setup(props) {
    const open = ref(false)
    return () => h('section', [
      h('button', { onClick: () => { open.value = true } }, '打开配置'),
      h(Modal, { open: open.value, busy: props.busy, title: '配置窗口', onClose: () => { open.value = false } }, {
        default: () => h('label', ['配置名称', h('input', { type: 'text' })]),
        footer: () => h('button', { onClick: () => { open.value = false } }, '完成')
      })
    ])
  }
})
describe('Vue reference modal and reduced motion accessibility', () => {
  it('focuses the first editable field, loops keyboard focus and restores its trigger on close', async () => {
    render(Consumer)
    const actor = userEvent.setup(), trigger = screen.getByRole('button', { name: '打开配置' })
    await actor.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '配置窗口' })
    const input = screen.getByRole('textbox', { name: '配置名称' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    const first = screen.getByRole('button', { name: '关闭' }), last = screen.getByRole('button', { name: '完成' })
    for (const item of [first, input, last]) Object.defineProperty(item, 'offsetParent', { configurable: true, get: () => dialog })
    last.focus(); await fireEvent.keyDown(last, { key: 'Tab' }); expect(document.activeElement).toBe(first)
    await fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last)
    await actor.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
  it('blocks Escape and close while saving and allows dismissal after completion', async () => {
    const view = render(Consumer, { props: { busy: true } }), actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '打开配置' })); await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: '关闭' })).toHaveProperty('disabled', true)
    await actor.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeTruthy()
    await view.rerender({ busy: false }); await actor.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('honors reduced motion without leaving overlays or pages invisible or waiting on animation', async () => {
    expect(prefersReducedMotion()).toBe(true)
    const panel = document.createElement('section'), done = vi.fn()
    overlayEnter(panel, done); overlayLeave(panel, done); pageEnter(panel, done)
    expect(done).toHaveBeenCalledTimes(3)
    expect(panel.style.opacity).not.toBe('0')
    pageLeave(panel, done); expect(done).toHaveBeenCalledTimes(3)
    await new Promise(resolve => setTimeout(resolve, 1)); await nextTick()
    expect(done).toHaveBeenCalledTimes(4)
  })
})
