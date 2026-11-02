import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RecordingReviewSetup } from '../../src/main/services/recording-review-setup'

const mocked = vi.hoisted(() => ({ status: vi.fn(), ensure: vi.fn(), invalidate: vi.fn(), construct: vi.fn() }))
vi.mock('../../src/main/services/recording-resource-manager', () => ({ RecordingResourceManager: class {
  status = mocked.status
  ensure = mocked.ensure
  invalidate = mocked.invalidate
  constructor(options: unknown) { mocked.construct(options) }
} }))
vi.mock('../../src/shared/recording-resources.json', () => ({ default: {
  schemaVersion: 1, model: {}, runtimes: { [`${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`]: {} },
} }))
let root: string
beforeEach(async () => {
  vi.clearAllMocks()
  mocked.status.mockResolvedValue({ ready: false, downloadBytes: 100, requiredBytes: 300 })
  mocked.ensure.mockResolvedValue({ pythonPath: '/cache/python', modelPath: '/cache/model' })
  mocked.invalidate.mockResolvedValue(undefined)
  root = await mkdtemp(join(tmpdir(), 'recording-setup-'))
})
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs() })
function setup(isPackaged = true) { return new RecordingReviewSetup({ isPackaged, resourcesPath: '/resources', appPath: root, userData: root }) }
it('does not initialize the downloader at ordinary application startup', () => {
  setup()
  expect(mocked.construct).not.toHaveBeenCalled()
})
it('requires explicit download permission and leaves resources untouched when declined', async () => {
  const service = setup()
  await expect(service.status()).resolves.toMatchObject({ ready: false, downloadBytes: 100 })
  await expect(service.ensure(false, new AbortController().signal, vi.fn())).rejects.toThrow('确认后继续')
  expect(mocked.ensure).not.toHaveBeenCalled()
})
it('prepares an explicitly allowed download and supplies only the verified paths to the runner', async () => {
  const service = setup(), controller = new AbortController(), progress = vi.fn()
  await expect(service.ensure(true, controller.signal, progress)).resolves.toEqual({ pythonPath: '/cache/python', modelPath: '/cache/model', scriptPath: join('/resources', 'recording-review.py') })
  expect(mocked.ensure).toHaveBeenCalledWith(controller.signal, progress)
  expect(mocked.construct).toHaveBeenCalledWith(expect.objectContaining({ root: join(root, 'shared-resources') }))
})
it('reuses ready resources without requiring download permission', async () => {
  mocked.status.mockResolvedValue({ ready: true, downloadBytes: 0, requiredBytes: 0 })
  await expect(setup().ensure(false, new AbortController().signal, vi.fn())).resolves.toHaveProperty('pythonPath', '/cache/python')
})
it('rejects a cancelled prepare before initialization and a late completion after cancellation', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await expect(setup().ensure(true, controller.signal, vi.fn())).rejects.toThrow('cancelled')
  expect(mocked.construct).not.toHaveBeenCalled()
  const late = new AbortController()
  mocked.ensure.mockImplementation(async () => { late.abort(new Error('late cancel')); return { pythonPath: '/cache/python', modelPath: '/cache/model' } })
  await expect(setup().ensure(true, late.signal, vi.fn())).rejects.toThrow('late cancel')
})
it('keeps development preparation explicit and never starts a resource download', async () => {
  vi.stubEnv('REWICK_PYTHON', '')
  const service = setup(false)
  await expect(service.status()).rejects.toThrow('npm run prepare:recording')
  const python = join(root, 'dev-python')
  vi.stubEnv('REWICK_PYTHON', python)
  await writeFile(python, '')
  await mkdir(join(root, 'build/asr-model'), { recursive: true })
  await writeFile(join(root, 'build/asr-model/model.bin'), '')
  await expect(service.status()).resolves.toMatchObject({ ready: true, downloadBytes: 0 })
  await expect(service.ensure(false, new AbortController().signal, vi.fn())).resolves.toHaveProperty('pythonPath', python)
  expect(mocked.construct).not.toHaveBeenCalled()
})
it('invalidates only the current packaged cache when asked to repair a local environment failure', async () => {
  await setup().invalidate()
  expect(mocked.invalidate).toHaveBeenCalledTimes(1)
  await setup(false).invalidate()
  expect(mocked.invalidate).toHaveBeenCalledTimes(1)
})
