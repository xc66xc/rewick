import { describe, expect, it, vi } from 'vitest'
import type { DesktopCapturerSource } from 'electron'
import { DisplayCaptureService, screenPermissionMessage } from '../../src/main/services/display-capture'

const source = { id: 'screen:1:0', name: 'Screen 1' } as DesktopCapturerSource

describe('system audio grants', () => {
  it('reports denial for the current version without requesting a source again', async () => {
    const getSources = vi.fn(async () => [source])
    const service = new DisplayCaptureService({ getSources, screenPermission: () => 'denied' })
    const callback = vi.fn()
    await service.grant(true, true, callback)
    expect(service.getFailure()).toBe(screenPermissionMessage)
    expect(getSources).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledExactlyOnceWith({})
  })

  it('preserves the source failure instead of replacing it with invalid constraints', async () => {
    const service = new DisplayCaptureService({ getSources: async () => { throw new Error('ScreenCaptureKit unavailable') }, screenPermission: () => 'granted' })
    const callback = vi.fn(() => { throw new TypeError('Video was requested, but no video stream was provided') })
    await service.grant(true, true, callback)
    expect(service.getFailure()).toBe('ScreenCaptureKit unavailable')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('clears an earlier error after a successful retry and grants only requested tracks', async () => {
    const getSources = vi.fn<() => Promise<DesktopCapturerSource[]>>().mockResolvedValueOnce([]).mockResolvedValue([source])
    const service = new DisplayCaptureService({ getSources, screenPermission: () => 'granted' })
    await service.grant(true, true, vi.fn())
    expect(service.getFailure()).toContain('没有提供可用')
    const callback = vi.fn()
    await service.grant(true, false, callback)
    expect(service.getFailure()).toBeNull()
    expect(callback).toHaveBeenCalledExactlyOnceWith({ video: source })
    await service.grant(true, true, callback)
    expect(callback).toHaveBeenLastCalledWith({ video: source, audio: 'loopback' })
  })

  it('rejects requests from other frames before enumerating screens', async () => {
    const getSources = vi.fn(async () => [source])
    const service = new DisplayCaptureService({ getSources, screenPermission: () => 'granted' })
    await service.grant(false, true, vi.fn())
    expect(getSources).not.toHaveBeenCalled()
    expect(service.getFailure()).toContain('请求已失效')
  })

  it('explains a policy restriction without instructing the user to toggle permission', async () => {
    const service = new DisplayCaptureService({ getSources: async () => [source], screenPermission: () => 'restricted' })
    await service.grant(true, true, vi.fn())
    expect(service.getFailure()).toContain('设备管理员')
  })
})
