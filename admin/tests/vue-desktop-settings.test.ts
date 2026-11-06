import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import DesktopSettingsPolicy from '../src/components/services-rewick/DesktopSettingsPolicy.vue'
import { config, data, response } from './fixtures'

const initial = { version: 3, llmModelId: '', temperature: .7, asrServiceId: '', sessionRecordMaxMiB: 20 }

describe('desktop session record capacity', () => {
  it('shows 20 MiB and saves the capacity without requiring default model or ASR selections', async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push({ url, body: data(options) }); return response({ ...data(options), version: 4 }) }
      return response(url.endsWith('/users') ? [] : initial)
    }))
    render(DesktopSettingsPolicy, { props: { api: new ApiClient('test'), config } })
    const actor = userEvent.setup(), capacity = await screen.findByLabelText(/单次会话大小上限/)
    expect(capacity).toHaveProperty('value', '20')
    await actor.clear(capacity); await actor.type(capacity, '30')
    await actor.click(screen.getByRole('button', { name: '保存桌面设置' }))
    await screen.findByText('桌面设置已保存。')
    expect(writes).toEqual([{ url: '/api/v1/admin/desktop-settings', body: { ...initial, sessionRecordMaxMiB: 30 } }])
  })
  it.each([0, 51, 1.5])('rejects invalid capacity %s before a PUT', async capacity => {
    const put = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { if (options.method === 'PUT') put(); return response(url.endsWith('/users') ? [] : initial) }))
    render(DesktopSettingsPolicy, { props: { api: new ApiClient('test'), config } })
    const input = await screen.findByLabelText(/单次会话大小上限/)
    await fireEvent.update(input, String(capacity))
    await fireEvent.submit(screen.getByRole('form', { name: '桌面默认设置' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '单次会话大小上限需为 1–50 MiB 的整数。')
    expect(put).not.toHaveBeenCalled()
  })
  it('keeps capacity and version after a conflict', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push(data(options)); return response({ message: 'conflict' }, 409) }
      return response(url.endsWith('/users') ? [] : initial)
    }))
    render(DesktopSettingsPolicy, { props: { api: new ApiClient('test'), config } })
    await fireEvent.update(await screen.findByLabelText(/单次会话大小上限/), '40')
    await userEvent.setup().click(screen.getByRole('button', { name: '保存桌面设置' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText(/单次会话大小上限/)).toHaveProperty('value', '40')
    await waitFor(() => expect(writes).toEqual([{ ...initial, sessionRecordMaxMiB: 40 }]))
  })
})
