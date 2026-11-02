import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { flushPromises } from '@vue/test-utils'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ClientDownloadEditor from '../src/components/services-rewick/ClientDownloadEditor.vue'
const download = { id: 'windows-x64', platform: 'windows', architecture: 'x64', version: '2.3.0', filename: 'old.exe', fileSize: 10, sha256: 'old', minimumOsVersion: '10', releaseNotes: '', enabled: true, updatedAt: '2026-11-03T08:00:00+08:00' }
type Uploaded = { uploadId: string; filename: string; fileSize: number; sha256: string }
describe('Vue release upload cancellation', () => {
  it('aborts an explicit cancellation and ignores a late response without publishing', async () => {
    const pending: { resolve?: (value: Uploaded) => void; signal?: AbortSignal } = {}, api = new ApiClient('test')
    const requests = vi.fn(); vi.stubGlobal('fetch', requests)
    vi.spyOn(api, 'upload').mockImplementation(<T>(_path: string, _file: File, schema: z.ZodType<T>, progress: (value: number) => void, signal?: AbortSignal): Promise<T> => {
      pending.signal = signal; progress(38)
      return new Promise<T>(resolve => { pending.resolve = value => resolve(schema.parse(value)) })
    })
    render(ClientDownloadEditor, { props: { api, initial: download } }); const actor = userEvent.setup()
    await actor.upload(screen.getByLabelText('安装包（最大 500 MB）'), new File(['package'], 'new.exe'))
    expect(screen.getByRole('progressbar', { name: '安装包上传进度' })).toHaveProperty('value', 38)
    await actor.click(screen.getByRole('button', { name: '取消上传' })); expect(pending.signal?.aborted).toBe(true)
    pending.resolve?.({ uploadId: 'not-published', filename: 'new.exe', fileSize: 20, sha256: 'new' }); await flushPromises()
    expect(screen.queryByText('上传完成，点击保存后生效。')).toBeNull()
    expect(screen.getByText('old.exe · 0.0 MB')).toBeTruthy(); expect(requests).not.toHaveBeenCalled()
  })
  it('aborts pending upload on unmount', async () => {
    const api = new ApiClient('test'), pending: { signal?: AbortSignal } = {}
    vi.spyOn(api, 'upload').mockImplementation(<T>(_path: string, _file: File, _schema: z.ZodType<T>, _progress: (value: number) => void, signal?: AbortSignal): Promise<T> => { pending.signal = signal; return new Promise<T>(() => undefined) })
    const view = render(ClientDownloadEditor, { props: { api, initial: download } })
    await userEvent.setup().upload(screen.getByLabelText('安装包（最大 500 MB）'), new File(['package'], 'new.exe'))
    view.unmount(); expect(pending.signal?.aborted).toBe(true)
  })
})
