// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InterviewRecordingStore } from '../../src/main/services/interview-recording-store'
import { recordingReviewRuntime } from '../../src/main/services/interview-recording-review'

describe('local interview recordings', () => {
  let root: string
  let store: InterviewRecordingStore
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'recording-test-')); store = new InterviewRecordingStore(root) })
  afterEach(async () => { await store.closeAll(); await rm(root, { recursive: true, force: true }) })
  it('streams a valid WAV and keeps accounts isolated', async () => {
    await store.start('account-a', 'session-1')
    await store.append('account-a', 'session-1', new ArrayBuffer(32_000))
    const result = await store.stop('account-a', 'session-1')
    expect(result).toMatchObject({ bytes: 32_000, durationSeconds: 1, status: 'saved' })
    const file = await readFile(await store.audioPath('account-a', 'session-1'))
    expect(file.toString('ascii', 0, 4)).toBe('RIFF')
    expect(file.readUInt32LE(40)).toBe(32_000)
    expect(await store.info('account-b', 'session-1')).toBeNull()
    expect(await store.stop('account-a', 'session-1')).toEqual(result)
  })
  it('recovers interrupted audio after process restart', async () => {
    await store.start('a', 's')
    await store.append('a', 's', new ArrayBuffer(640))
    await store.closeAll()
    const recovered = new InterviewRecordingStore(root)
    expect(await recovered.info('a', 's')).toMatchObject({ status: 'interrupted', bytes: 640 })
    expect(await recovered.info('a', 's')).toMatchObject({ status: 'interrupted' })
    expect((await readFile(await recovered.audioPath('a', 's'))).readUInt32LE(40)).toBe(640)
  })
  it('exports the original WAV without changing it and rejects other accounts or active recordings', async () => {
    const destination = join(root, 'download.wav')
    await store.start('a', 's')
    await store.append('a', 's', new Uint8Array([1, 2, 3, 4]).buffer)
    await expect(store.exportFile('a', 's', destination)).rejects.toThrow('请先结束并保存录音')
    await store.stop('a', 's')
    await expect(store.exportFile('b', 's', destination)).rejects.toThrow()
    const original = await readFile(await store.audioPath('a', 's'))
    await store.exportFile('a', 's', destination)
    expect(await readFile(destination)).toEqual(original)
    expect(await readFile(await store.audioPath('a', 's'))).toEqual(original)
  })
  it('rejects traversal, overwriting recordings, invalid PCM and deleting active audio', async () => {
    await expect(store.start('a', '../s')).rejects.toThrow()
    await store.start('a', 's')
    await expect(store.append('a', 's', new ArrayBuffer(3))).rejects.toThrow()
    await expect(store.append('a', 's', new ArrayBuffer(320_002))).rejects.toThrow()
    await expect(store.remove('a', 's')).rejects.toThrow()
    await store.append('a', 's', new ArrayBuffer(640))
    await store.stop('a', 's')
    await expect(store.start('a', 's')).rejects.toThrow()
    await store.remove('a', 's')
    expect(await store.info('a', 's')).toBeNull()
  })
  it('allows retry after capture permission failure left no audio', async () => {
    await store.start('a', 's')
    await store.stop('a', 's')
    await store.start('a', 's')
    await store.append('a', 's', new ArrayBuffer(640))
    expect(await store.stop('a', 's')).toMatchObject({ bytes: 640 })
  })
  it('allows bounded audio writes behind concurrent history metadata reads', async () => {
    await store.start('a', 's')
    const metadata = store.info('a', 's')
    const write = store.append('a', 's', new ArrayBuffer(640))
    await expect(store.append('a', 's', new ArrayBuffer(640))).rejects.toThrow('请等待上一段录音保存完成。')
    await expect(metadata).resolves.toMatchObject({ status: 'recording' })
    await expect(write).resolves.toBeUndefined()
    expect(await store.stop('a', 's')).toMatchObject({ bytes: 640 })
  })
  it('never falls back to a system Python in packaged apps', () => {
    const result = recordingReviewRuntime({ isPackaged: true, resourcesPath: '/resources', appPath: '/app' })
    expect(result.pythonPath).toContain('/resources/python/')
    expect(result.scriptPath).toBe('/resources/recording-review.py')
  })
})

describe('review process launcher', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'review-process-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  it('passes credentials over stdin and forwards progress', async () => {
    const { writeFile } = await import('node:fs/promises')
    const { runRecordingReview } = await import('../../src/main/services/interview-recording-review')
    const script = join(root, 'fixture.py')
    await writeFile(script, `import json, sys, os\nassert os.environ.get("ORT_DISABLE_TELEMETRY")=="1"\nc=json.load(sys.stdin)\nassert c['token']=='test-secret'\nassert 'test-secret' not in str(sys.argv)\nprint(json.dumps({'type':'progress','stage':'summarizing','completed':0,'total':1}), flush=True)\nprint(json.dumps({'type':'result'}), flush=True)\n`)
    const events: unknown[] = []
    const result = await runRecordingReview({ pythonPath: process.env.REWICK_PYTHON ?? 'python3', scriptPath: script, audioPath: 'unused', outputPath: join(root, 'out.md'), baseUrl: 'https://example.invalid', token: 'test-secret', sessionId: 's', onProgress: event => events.push(event), signal: new AbortController().signal })
    expect(result.path).toBe(join(root, 'out.md'))
    expect(events).toEqual([{ sessionId: 's', stage: 'summarizing', completed: 0, total: 1 }])
  })
  it('cancels a running process after progress without exposing stderr', async () => {
    const { writeFile } = await import('node:fs/promises')
    const { runRecordingReview } = await import('../../src/main/services/interview-recording-review')
    const script = join(root, 'fixture.py')
    await writeFile(script, `import json, sys, time\njson.load(sys.stdin)\nprint('secret detail', file=sys.stderr)\nprint(json.dumps({'type':'progress','stage':'transcribing','completed':0,'total':1}), flush=True)\ntime.sleep(30)\n`)
    const controller = new AbortController()
    await expect(runRecordingReview({ pythonPath: process.env.REWICK_PYTHON ?? 'python3', scriptPath: script, audioPath: 'unused', outputPath: join(root, 'out.md'), baseUrl: 'https://example.invalid', token: 'test-secret', sessionId: 's', onProgress: () => controller.abort(), signal: controller.signal })).rejects.toThrow('已取消复盘导出。')
  })
  it('reports a failed process using a safe generic error', async () => {
    const { writeFile } = await import('node:fs/promises')
    const { runRecordingReview } = await import('../../src/main/services/interview-recording-review')
    const script = join(root, 'fixture.py')
    await writeFile(script, `import sys\nprint('sensitive transcript',file=sys.stderr)\nsys.exit(2)\n`)
    await expect(runRecordingReview({ pythonPath: process.env.REWICK_PYTHON ?? 'python3', scriptPath: script, audioPath: 'unused', outputPath: join(root, 'out.md'), baseUrl: 'https://example.invalid', token: 'test-secret', sessionId: 's', onProgress: () => {}, signal: new AbortController().signal })).rejects.toThrow('本地复盘进程未完成（退出码 2）')
  })
})
