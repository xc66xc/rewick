import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ReferencePolicy from '../src/components/ReferencePolicy'
import { response } from './fixtures'

const policy = { maxFiles: 20, maxTotalBytes: 104857600, maxChunks: 10000, childTarget: 600, childOverlap: 100, parentTarget: 1400, bm25K1: 1.2, bm25B: 0.75, vectorMinScore: 0.55, questionVectorMinScore: 0, rrfConstant: 60, bm25TimeoutMs: 300, maxTermRows: 2000000, cacheEnabled: false, cacheWeightBytes: 8388608, hybridEnabled: true, version: 0 }

describe('reference upload policy', () => {
  it('loads user limits and saves capacity in bytes', async () => {
    let submitted: unknown
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') { submitted = JSON.parse(String(options.body)); return new Response(null, { status: 204 }) }
      return response(policy)
    }))
    const actor = userEvent.setup()
    render(<ReferencePolicy api={new ApiClient('test-token')} />)
    const capacity = await screen.findByLabelText('每用户资料总容量（MB）')
    expect(capacity).toHaveProperty('value', '100')
    expect(screen.getByLabelText('问题向量相似度阈值')).toHaveProperty('value', '0')
    expect(screen.getByLabelText('正文向量相似度阈值')).toHaveProperty('value', '0.55')
    await actor.clear(capacity)
    await actor.type(capacity, '50')
    await actor.click(screen.getByRole('button', { name: '保存资料策略' }))
    expect((await screen.findByRole('status')).textContent).toContain('已保存')
    expect(submitted).toEqual({ ...policy, maxTotalBytes: 52428800 })
  })
  it('preserves edited limits and explains failed save', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => options.method === 'PUT'
      ? response({ message: '保存失败' }, 500)
      : response(policy)))
    const actor = userEvent.setup()
    render(<ReferencePolicy api={new ApiClient('test-token')} />)
    const count = await screen.findByLabelText('每用户文件数量')
    await actor.clear(count); await actor.type(count, '30')
    await actor.click(screen.getByRole('button', { name: '保存资料策略' }))
    expect((await screen.findByRole('alert')).textContent).toContain('保存失败')
    expect(count).toHaveProperty('value', '30')
  })
})
