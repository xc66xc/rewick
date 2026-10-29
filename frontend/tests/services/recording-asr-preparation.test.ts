import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

let directory: string | undefined
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined })

it('replaces obsolete bundled dependencies and reuses an unchanged dependency lock', async () => {
  directory = await mkdtemp(join(tmpdir(), 'rewick-asr-preparation-'))
  const root = join(directory, 'frontend')
  const scripts = join(root, 'scripts')
  await mkdir(scripts, { recursive: true })
  for (const file of ['prepare-recording-asr.mjs', 'recording-download.mjs']) await cp(resolve('scripts', file), join(scripts, file))
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'junction')
  const target = process.platform === 'win32' ? 'win-x64' : 'mac-arm64'
  const runtime = join(root, 'build/python-runtime/python')
  const packages = join(runtime, target === 'win-x64' ? 'Lib/site-packages' : 'lib/python3.12/site-packages')
  await mkdir(join(packages, 'obsolete-1.0.dist-info'), { recursive: true })
  await writeFile(join(packages, 'obsolete-1.0.dist-info/METADATA'), 'old metadata')
  await writeFile(join(runtime, '.rewick-asr'), 'outdated dependency fingerprint')
  const source = join(directory, 'wheel-source')
  const archive = join(root, 'build/asr-wheel-cache/fixture.whl')
  await mkdir(source, { recursive: true })
  await mkdir(join(root, 'build/asr-wheel-cache'), { recursive: true })
  await writeFile(join(source, 'installed.py'), 'VALUE = "new dependency"\n')
  const packed = spawnSync('tar', ['-cf', 'fixture.whl', 'installed.py'], { cwd: source, encoding: 'utf8' })
  expect(packed.status, packed.stderr).toBe(0)
  await cp(join(source, 'fixture.whl'), archive)
  const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')
  await writeFile(join(scripts, 'recording-asr-wheels.json'), JSON.stringify({ [target]: [{ file: 'fixture.whl', url: 'https://example.invalid/fixture', sha256: hash(await readFile(archive)) }] }))
  const model = '{"fixture":true}'
  await mkdir(join(root, 'build/asr-model'), { recursive: true })
  await writeFile(join(root, 'build/asr-model/config.json'), model)
  await writeFile(join(scripts, 'recording-asr-model.json'), JSON.stringify({ files: [{ file: 'config.json', url: 'https://example.invalid/model', sha256: hash(model) }] }))
  await writeFile(join(scripts, 'recording-asr-model-LICENSE.txt'), 'Synthetic test fixture')
  const prepare = () => spawnSync(process.execPath, [join(scripts, 'prepare-recording-asr.mjs'), ...target.split('-')], { cwd: root, encoding: 'utf8', timeout: 10_000 })
  const first = prepare()
  expect(first.status, first.stderr).toBe(0)
  expect(await readFile(join(packages, 'installed.py'), 'utf8')).toContain('new dependency')
  await expect(readFile(join(packages, 'obsolete-1.0.dist-info/METADATA'))).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(join(packages, 'reuse-probe'), 'matching fingerprint')
  const second = prepare()
  expect(second.status, second.stderr).toBe(0)
  expect(await readFile(join(packages, 'reuse-probe'), 'utf8')).toBe('matching fingerprint')
}, 20_000)
