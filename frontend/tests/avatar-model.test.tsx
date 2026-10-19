// @vitest-environment jsdom
import './ui/setup-dom'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Bone, BufferAttribute, BoxGeometry, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three'
import AvatarModel from '../src/renderer/src/features/mock-interview/AvatarModel'

const mocks = vi.hoisted(() => ({ parse: vi.fn(), dispose: vi.fn(), size: { width: 600, height: 800 }, camera: { position: { set: vi.fn() }, lookAt: vi.fn(), updateProjectionMatrix: vi.fn() }, invalidate: vi.fn() }))
vi.mock('@react-three/fiber', async () => {
  const { PerspectiveCamera } = await import('three')
  const camera = new PerspectiveCamera(32)
  return { useThree: () => ({ camera, size: mocks.size, invalidate: mocks.invalidate }) }
})
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
  resolve({ scene })
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

it('loads a static GLB with meshes and releases it when switching to 2D', async () => {
  const scene = new Group()
  scene.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()))
  mocks.parse.mockResolvedValueOnce({ scene })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))
  const onReady = vi.fn(), onError = vi.fn()
  const { unmount } = render(<AvatarModel state="speaking" level={1} onReady={onReady} onError={onError} />)
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
  expect(onError).not.toHaveBeenCalled()
  unmount()
  expect(mocks.dispose).toHaveBeenCalledWith(scene)
})

it('rejects an empty GLB rather than reporting a blank scene as ready', async () => {
  const scene = new Group()
  mocks.parse.mockResolvedValueOnce({ scene })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))
  const onReady = vi.fn(), onError = vi.fn()
  const { unmount } = render(<AvatarModel state="ready" level={0} onReady={onReady} onError={onError} />)
  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Avatar contains no renderable meshes' })))
  expect(onReady).not.toHaveBeenCalled()
  unmount()
  expect(mocks.dispose).toHaveBeenCalledWith(scene)
})

it('restores the bind pose instead of displaying an imported walking pose', async () => {
  const scene = new Group()
  const bone = new Bone()
  const mesh = new SkinnedMesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial())
  const count = mesh.geometry.attributes.position.count
  mesh.geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(count * 4), 4))
  const weights = new Float32Array(count * 4)
  for (let index = 0; index < count; index++) weights[index * 4] = 1
  mesh.geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4))
  mesh.add(bone)
  mesh.bind(new Skeleton([bone]))
  bone.position.y = 10
  scene.add(mesh)
  mocks.parse.mockResolvedValueOnce({ scene, animations: [{ name: 'Running' }, { name: 'Walking' }] })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }))
  const onReady = vi.fn(), onError = vi.fn()
  render(<AvatarModel state="listening" level={0} onReady={onReady} onError={onError} />)
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
  expect(bone.position.y).toBe(0)
  expect(onError).not.toHaveBeenCalled()
})
