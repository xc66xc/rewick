// @vitest-environment jsdom
import './ui/setup-dom'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AvatarModel from '../src/renderer/src/features/mock-interview/AvatarModel'

const mocks = vi.hoisted(() => ({ parse: vi.fn(), dispose: vi.fn(), camera: { position: { set: vi.fn() }, lookAt: vi.fn(), updateProjectionMatrix: vi.fn() }, invalidate: vi.fn() }))
vi.mock('@react-three/fiber', () => ({ useThree: () => ({ camera: mocks.camera, invalidate: mocks.invalidate }) }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { register() { return this }; parseAsync = mocks.parse } }))
vi.mock('../src/renderer/src/features/mock-interview/disposeAvatar', () => ({ disposeAvatar: mocks.dispose }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('disposes a model that finishes parsing after the user has left the 3D view', async () => {
  let resolve!: (value: unknown) => void
  mocks.parse.mockReturnValue(new Promise((done) => { resolve = done }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))
  const onReady = vi.fn(), onError = vi.fn()
  const { unmount } = render(<AvatarModel state="listening" level={0} onReady={onReady} onError={onError} />)
  await waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce())
  unmount()
  const scene = { name: 'late model' }
  resolve({ userData: { vrm: { scene } } })
  await waitFor(() => expect(mocks.dispose).toHaveBeenCalledWith(scene))
  expect(onReady).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})

it('reports a local model read failure without claiming the scene is ready', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
  const onReady = vi.fn(), onError = vi.fn()
  render(<AvatarModel state="ready" level={0} onReady={onReady} onError={onError} />)
  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Avatar HTTP 404' })))
  expect(onReady).not.toHaveBeenCalled()
})

it('aborts the model request when switching away before the fetch completes', () => {
  const fetchModel = vi.fn().mockReturnValue(new Promise(() => {}))
  vi.stubGlobal('fetch', fetchModel)
  const { unmount } = render(<AvatarModel state="ready" level={0} onReady={vi.fn()} onError={vi.fn()} />)
  const signal = fetchModel.mock.calls[0][1].signal as AbortSignal
  expect(signal.aborted).toBe(false)
  unmount()
  expect(signal.aborted).toBe(true)
})
