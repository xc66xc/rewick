import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as tar from 'tar'
let root: string
const script = resolve('scripts/recording-resources.mjs')
const release = 'desktop-v2.1.0'
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'speech-resource-packaging-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function file(path: string, value = 'synthetic speech resource') { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, value) }
async function fixture(kind: 'runtime' | 'model', target = 'mac-arm64') {
  const source = join(root, `${kind}-${target}`)
  const files = kind === 'model' ? ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt', 'LICENSE.txt']
    : [target === 'win-x64' ? 'python.exe' : 'bin/python3.12', '.rewick-runtime', '.rewick-asr', 'cacert.pem', ...['faster_whisper', 'ctranslate2', 'onnxruntime'].map(name => `${target === 'win-x64' ? 'Lib/site-packages' : 'lib/python3.12/site-packages'}/${name}/__init__.py`)]
  for (const path of files) await file(join(source, path))
  return source
}
function command(...args: string[]) { return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 15000 }) }
async function pack(kind: 'runtime' | 'model', target: string, source: string, output: string) {
  const result = command('pack', kind, target, source, output, release)
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(await readFile(join(output, `${target}-${kind}.json`), 'utf8'))
}
it('creates deterministic independently downloadable archives, preserving internal links and excluding Python caches', async () => {
  const source = await fixture('runtime')
  await symlink('python3.12', join(source, 'bin/python3'))
  await file(join(source, 'lib/__pycache__/discard.pyc'))
  const first = await pack('runtime', 'mac-arm64', source, join(root, 'first'))
  const second = await pack('runtime', 'mac-arm64', source, join(root, 'second'))
  const resource = first.runtimes['mac-arm64']
  expect(second).toEqual(first)
  expect(resource.url).toBe(`https://github.com/xc66xc/rewick/releases/download/${release}/${resource.fileName}`)
  expect(resource.archiveBytes).toBeGreaterThan(0)
  expect(resource.criticalFiles[0]).toMatchObject({ path: 'bin/python3.12', size: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
  const entries: { path: string; type: string; linkpath?: string }[] = []
  await tar.t({ file: join(root, 'first', resource.fileName), onReadEntry: entry => { entries.push({ path: entry.path, type: entry.type, linkpath: entry.linkpath }); entry.resume() } })
  expect(entries.some(entry => entry.path.includes('__pycache__'))).toBe(false)
  expect(entries.find(entry => entry.path === 'bin/python3')).toMatchObject({ type: 'SymbolicLink', linkpath: 'python3.12' })
})
it('rejects outbound links before producing an archive', async () => {
  const source = await fixture('runtime')
  await symlink('../../outside', join(source, 'escape'))
  const result = command('pack', 'runtime', 'mac-arm64', source, join(root, 'out'), release)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('link outside its root')
})
it('merges real platform metadata and refuses empty or corrupted manifests for packaging', async () => {
  const output = join(root, 'out')
  const mac = await pack('runtime', 'mac-arm64', await fixture('runtime'), output)
  await pack('runtime', 'win-x64', await fixture('runtime', 'win-x64'), output)
  await pack('model', 'mac-arm64', await fixture('model'), output)
  const manifest = join(root, 'resolved.json')
  const fragments = ['mac-arm64-runtime.json', 'win-x64-runtime.json', 'mac-arm64-model.json'].map(name => join(output, name))
  const merged = command('merge', manifest, ...fragments)
  expect(merged.status, merged.stderr).toBe(0)
  expect(command('validate', 'mac-arm64', manifest).status).toBe(0)
  expect(command('validate', 'win-x64', manifest).status).toBe(0)
  const value = JSON.parse(await readFile(manifest, 'utf8'))
  expect(value.runtimes['mac-arm64']).toEqual(mac.runtimes['mac-arm64'])
  expect(value.model.kind).toBe('model')
  await writeFile(manifest, JSON.stringify({ schemaVersion: 1, releaseTag: release, runtimes: {}, model: null }))
  expect(command('validate', 'mac-arm64', manifest).status).not.toBe(0)
  expect((await readdir(output)).some(name => name.endsWith('.tar.gz.sha256'))).toBe(true)
})
it('keeps regular installer packaging independent of resource preparation', async () => {
  const packaging = await readFile(resolve('scripts/package.mjs'), 'utf8')
  expect(packaging).not.toContain('prepare-recording-python')
  expect(packaging).toContain('recording-resources.mjs')
  const configuration = await readFile(resolve('electron-builder.yml'), 'utf8')
  expect(configuration).not.toContain('from: build/python-runtime')
  expect(configuration).not.toContain('from: build/asr-model')
  expect(configuration).toContain('from: scripts/recording-review.py')
})
