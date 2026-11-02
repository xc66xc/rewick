import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import OperationsSettings from '../src/views/operations/OperationsSettings.vue'
import OperationsTraces from '../src/views/operations/OperationsTraces.vue'
import { data, response } from './fixtures'
import { operationId, settings, trace, traces } from './operations-fixtures'

describe('Vue operations endpoint and provenance contracts', () => {
  it('saves every existing collection setting and deduplicates user IDs without extra endpoints', async () => {
    const writes: { url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push({ url, body: data(options) }); return response({ ...data(options), version: 2 }) }
      return response(settings)
    }))
    render(OperationsSettings, { props: { api: new ApiClient('test') } }); const actor = userEvent.setup()
    await actor.type(await screen.findByRole('textbox', { name: /^灰度用户 ID/ }), '7, 8\n7')
    await actor.click(screen.getByRole('button', { name: '保存观测设置' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ url: '/api/v1/admin/operations/settings', body: { ...settings, allowedUserIds: ['7', '8'] } })
  })
  it('keeps a conflicted settings draft and does not silently retry', async () => {
    let writes = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { if (options.method === 'PUT') { writes++; return response({ message: 'conflict' }, 409) }; return response(settings) }))
    render(OperationsSettings, { props: { api: new ApiClient('test') } }); const actor = userEvent.setup()
    await actor.type(await screen.findByRole('textbox', { name: /^灰度用户 ID/ }), '7')
    await actor.click(screen.getByRole('button', { name: '保存观测设置' })); await screen.findByRole('alert')
    expect(screen.getByRole('textbox', { name: /^灰度用户 ID/ })).toHaveProperty('value', '7'); expect(writes).toBe(1)
  })
  it('scopes detail lookup by both operation UUID and user ID, preserving provider provenance', async () => {
    const paths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { paths.push(url); return response(url.includes(`/traces/${operationId}`) ? trace : traces) }))
    render(OperationsTraces, { props: { api: new ApiClient('test'), hours: 720, active: true } }); const actor = userEvent.setup()
    await actor.click(await screen.findByRole('button', { name: '查看链路' }))
    await waitFor(() => expect(paths).toContain(`/api/v1/admin/operations/traces/${operationId}?userId=7`))
    expect(paths[0]).toBe('/api/v1/admin/operations/traces?hours=168&page=1&size=20')
    expect(screen.getAllByText('服务：资料数据库')).toHaveLength(3)
  })
  it('does not label session synchronization as a failed unknown model answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...traces, items: [{ ...traces.items[0], operationType: 'session-sync', model: null, outcome: 'error' }] })))
    render(OperationsTraces, { props: { api: new ApiClient('test'), hours: 24, active: true } })
    await screen.findByText('不涉及模型'); expect(screen.queryByText('未知')).toBeNull()
  })
})
