import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ClientDownloadEditor from '../src/components/ClientDownloadEditor'
import ClientDownloadsPage from '../src/pages/ClientDownloadsPage'
import { data, response } from './fixtures'
const item = { id: 'macos-arm64', platform: 'macos', architecture: 'arm64', version: '0.4.0', filename: 'old.dmg', fileSize: 10, sha256: '', minimumOsVersion: 'macOS 12+', releaseNotes: '', enabled: true, updatedAt: '2026-09-14T04:00:00Z' }
it('uploads first and publishes only on save, retaining the draft after a failed save', async () => {
  const payloads: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { payloads.push(data(options)); return payloads.length === 1 ? response({ message: '保存失败' }, 500) : response({ ...item, filename: 'new.dmg' }) }))
  const api = new ApiClient('token')
  vi.spyOn(api, 'upload').mockResolvedValue({ uploadId: 'new-upload', filename: 'new.dmg', fileSize: 20, sha256: 'test-hash' })
  render(<ClientDownloadEditor api={api} initial={item} />)
  const actor = userEvent.setup()
  await actor.upload(screen.getByLabelText('安装包（最大 500 MB）'), new File(['package'], 'new.dmg'))
  await screen.findByText('上传完成，点击保存后生效。')
  expect(payloads).toHaveLength(0)
  await actor.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByRole('alert')
  expect(screen.getByText(/new.dmg.*待保存/)).toBeTruthy()
  await actor.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByText('已保存，落地页将使用当前配置。')
  expect(payloads.map(value => value.uploadId)).toEqual(['new-upload', 'new-upload'])
})
it('keeps the existing package after upload failure', async () => {
  const api = new ApiClient('token')
  vi.spyOn(api, 'upload').mockRejectedValue(new Error('上传失败'))
  render(<ClientDownloadEditor api={api} initial={item} />)
  await userEvent.setup().upload(screen.getByLabelText('安装包（最大 500 MB）'), new File(['package'], 'new.dmg'))
  await screen.findByRole('alert')
  expect(screen.getByText(/old.dmg/)).toBeTruthy()
})
it('shows three independently configurable platform slots', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response([item, { ...item, id: 'macos-x64', architecture: 'x64' }, { ...item, id: 'windows-x64', platform: 'windows', architecture: 'x64' }])))
  render(<ClientDownloadsPage api={new ApiClient('token')} />)
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
  expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  await userEvent.setup().click(screen.getByRole('button', { name: '编辑 Windows · x64' }))
  expect(screen.getByRole('form', { name: 'Windows · x64' })).toBeTruthy()
})

it('updates the release summary after saving and discards a cancelled edit', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => response(options.method === 'PUT' ? { ...item, ...data(options) } : [item])))
  const actor = userEvent.setup()
  render(<ClientDownloadsPage api={new ApiClient('token')} />)
  await actor.click(await screen.findByRole('button', { name: '编辑发布信息' }))
  await actor.clear(screen.getByLabelText('版本号'))
  await actor.type(screen.getByLabelText('版本号'), '0.5.0')
  await actor.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByText('已保存，落地页将使用当前配置。')
  await actor.click(screen.getByRole('button', { name: '取消编辑' }))
  expect(screen.getAllByText('0.5.0')).toHaveLength(2)
  await actor.click(screen.getByRole('button', { name: '编辑发布信息' }))
  await actor.clear(screen.getByLabelText('版本号'))
  await actor.type(screen.getByLabelText('版本号'), 'not-saved')
  await actor.click(screen.getByRole('button', { name: '取消编辑' }))
  await actor.click(screen.getByRole('button', { name: '编辑发布信息' }))
  expect(screen.getByLabelText('版本号')).toHaveProperty('value', '0.5.0')
})
