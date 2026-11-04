// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LocalStoragePreferences from '../src/renderer/src/components/LocalStoragePreferences'
import type { DesktopBridge } from '../src/shared/types'

afterEach(cleanup)
function fixture() {
  const getLocalStorageStatus = vi.fn(async () => ({ available: true, canImport: true }))
  const migrateLocalStorage = vi.fn(async () => ({ settings: 2, drafts: 1 }))
  const bridge = { getLocalStorageStatus, migrateLocalStorage, onEvent: () => () => undefined } as unknown as DesktopBridge
  return { bridge, getLocalStorageStatus, migrateLocalStorage }
}
describe('local storage recovery', () => {
  it('loads metadata without initiating keychain migration and requires an explicit confirmation', async () => {
    const { bridge, migrateLocalStorage } = fixture(), user = userEvent.setup()
    render(<LocalStoragePreferences bridge={bridge} />)
    await screen.findByRole('button', { name: '尝试迁移旧本机数据' })
    expect(migrateLocalStorage).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '尝试迁移旧本机数据' }))
    expect(screen.getByRole('dialog', { name: '迁移旧本机数据' })).toBeTruthy()
    expect(migrateLocalStorage).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '尝试迁移' }))
    await waitFor(() => expect(migrateLocalStorage).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '已迁移 2 份本机配置、1 份待同步草稿，旧文件仍然保留。')
  })
  it('keeps an unsuccessful import actionable without an automatic retry', async () => {
    const { bridge, migrateLocalStorage } = fixture(), user = userEvent.setup()
    migrateLocalStorage.mockRejectedValue(new Error('旧钥匙串拒绝授权，原文件保留。'))
    render(<LocalStoragePreferences bridge={bridge} />)
    await user.click(await screen.findByRole('button', { name: '尝试迁移旧本机数据' }))
    await user.click(screen.getByRole('button', { name: '尝试迁移' }))
    expect((await screen.findByRole('alert')).textContent).toContain('原文件保留')
    expect(migrateLocalStorage).toHaveBeenCalledTimes(1)
  })
  it('does not offer an overwrite when the new store has credentials or drafts', async () => {
    const { bridge, getLocalStorageStatus } = fixture()
    getLocalStorageStatus.mockResolvedValue({ available: true, canImport: false })
    render(<LocalStoragePreferences bridge={bridge} />)
    expect(await screen.findByRole('button', { name: '尝试迁移旧本机数据' })).toHaveProperty('disabled', true)
  })
})
