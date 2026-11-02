// Immutable, independently versioned speech resources. This script never runs in the app.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, lstat, mkdir, readFile, readdir, readlink, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { downloadVerified } from './recording-download.mjs'
import { fileURLToPath } from 'node:url'
import * as tar from 'tar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifest = join(root, 'src/shared/recording-resources.json')
const targets = ['mac-arm64', 'win-x64']
const tagPattern = /^desktop-v\d+\.\d+\.\d+$/
const digestPattern = /^[a-f0-9]{64}$/
const normalize = value => value.split(sep).join('/')
const inside = value => value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
async function hash(path) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
async function entriesAt(directory) {
  const result = []
  async function walk(parent) {
    for (const name of (await readdir(join(directory, parent))).sort()) {
      if (name === '__pycache__' || name === '.DS_Store' || /\.(?:pyc|pyo)$/.test(name)) continue
      const path = join(parent, name)
      const info = await lstat(join(directory, path))
      if (info.isSymbolicLink()) {
        const target = await readlink(join(directory, path))
        if (isAbsolute(target) || !inside(relative(directory, resolve(directory, dirname(path), target)))) throw new Error('Resource contains a link outside its root')
      } else if (!info.isDirectory() && !info.isFile()) throw new Error('Resource contains an unsupported file type')
      result.push({ path: normalize(path), size: info.isFile() ? info.size : 0 })
      if (info.isDirectory()) await walk(path)
    }
  }
  await walk('')
  return result
}
function requiredFiles(kind, target) {
  if (kind === 'model') return ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt', 'LICENSE.txt']
  const site = target === 'win-x64' ? 'Lib/site-packages' : 'lib/python3.12/site-packages'
  return [target === 'win-x64' ? 'python.exe' : 'bin/python3.12', '.rewick-runtime', '.rewick-asr', 'cacert.pem', ...['faster_whisper', 'ctranslate2', 'onnxruntime'].map(name => `${site}/${name}/__init__.py`)]
}
export async function archiveResource({ source, kind, target, output, releaseTag }) {
  if (!['runtime', 'model'].includes(kind) || !targets.includes(target) || !tagPattern.test(releaseTag)) throw new Error('Invalid speech resource build target')
  source = resolve(source)
  output = resolve(output)
  const entries = await entriesAt(source)
  if (!entries.length) throw new Error('Resource directory is empty')
  const criticalFiles = []
  for (const path of requiredFiles(kind, target)) {
    const info = await stat(join(source, path))
    if (!info.isFile()) throw new Error(`Missing required resource file: ${path}`)
    criticalFiles.push({ path, size: info.size, sha256: await hash(join(source, path)) })
  }
  await mkdir(output, { recursive: true })
  const temporary = join(output, `${kind}-${target}.building.tar.gz`)
  await tar.c({ cwd: source, file: temporary, portable: true, noDirRecurse: true, strict: true,
    mtime: new Date(0), gzip: { level: 6, mtime: 0 }, onWriteEntry(entry) {
      entry.stat.mode = entry.type === 'Directory' || entry.path.startsWith('bin/') || entry.path.endsWith('.exe') ? 0o755 : entry.type === 'SymbolicLink' ? 0o777 : 0o644
    } }, entries.map(entry => entry.path))
  const sha256 = await hash(temporary)
  const resourceId = `${kind}-${kind === 'runtime' ? `${target}-` : ''}${sha256.slice(0, 16)}`
  const fileName = `Rewick-speech-${resourceId}.tar.gz`
  const destination = join(output, fileName)
  await rename(temporary, destination)
  await writeFile(`${destination}.sha256`, `${sha256}  ${fileName}\n`)
  return { resourceId, kind, fileName, url: `https://github.com/xc66xc/rewick/releases/download/${releaseTag}/${fileName}`, sha256,
    archiveBytes: (await stat(destination)).size, unpackedBytes: entries.reduce((sum, entry) => sum + entry.size, 0), maxEntries: entries.length + 32, criticalFiles }
}
function validateResource(value, kind, releaseTag) {
  if (!value || value.kind !== kind || !/^[a-z0-9-]{8,120}$/.test(value.resourceId) || !/^Rewick-speech-[a-z0-9-]+\.tar\.gz$/.test(value.fileName)
    || !digestPattern.test(value.sha256) || !Number.isSafeInteger(value.archiveBytes) || value.archiveBytes <= 0
    || !Number.isSafeInteger(value.unpackedBytes) || value.unpackedBytes <= 0 || !Number.isSafeInteger(value.maxEntries) || value.maxEntries < 1
    || value.url !== `https://github.com/xc66xc/rewick/releases/download/${releaseTag}/${value.fileName}`
    || !Array.isArray(value.criticalFiles) || !value.criticalFiles.length) throw new Error('Speech resource manifest is missing verified build metadata')
  for (const file of value.criticalFiles) {
    if (!file.path || file.path.includes('\\') || file.path.startsWith('/') || file.path.split('/').some(part => ['..', '.', ''].includes(part))
      || !digestPattern.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Invalid critical resource metadata')
  }
}
export function validateManifest(manifest, target) {
  if (manifest.schemaVersion !== 1 || !tagPattern.test(manifest.releaseTag) || !targets.includes(target)) throw new Error('Invalid speech resource manifest version/target')
  validateResource(manifest.runtimes?.[target], 'runtime', manifest.releaseTag)
  validateResource(manifest.model, 'model', manifest.releaseTag)
  return manifest
}
export async function build(target, output) {
  if (!targets.includes(target)) throw new Error('Only mac-arm64 and win-x64 resources are supported')
  const manifest = JSON.parse(await readFile(defaultManifest, 'utf8'))
  if (!tagPattern.test(manifest.releaseTag)) throw new Error('A fixed desktop resource release tag is required')
  const [platform, arch] = target.split('-')
  const prepared = spawnSync(process.execPath, [join(root, 'scripts/prepare-recording-python.mjs'), platform, arch, ...(target === 'win-x64' ? ['--runtime-only'] : [])], { stdio: 'inherit' })
  if (prepared.status !== 0) throw new Error('Speech resource preparation failed')
  const runtime = await archiveResource({ source: join(root, 'build/python-runtime/python'), kind: 'runtime', target, output, releaseTag: manifest.releaseTag })
  const result = { schemaVersion: 1, releaseTag: manifest.releaseTag, runtimes: { [target]: runtime } }
  if (target === 'mac-arm64') result.model = await archiveResource({ source: join(root, 'build/asr-model'), kind: 'model', target, output, releaseTag: manifest.releaseTag })
  await writeFile(join(output, `${target}.json`), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
export async function stage(target, output, releaseTag) {
  const manifest = JSON.parse(await readFile(defaultManifest, 'utf8'))
  if (manifest.releaseTag === releaseTag) return build(target, output)
  validateManifest(manifest, target)
  await mkdir(output, { recursive: true })
  await writeFile(join(output, `${target}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
export async function verify(target, manifestPath, archives, destination) {
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), target)
  const paths = {}
  for (const resource of [manifest.runtimes[target], manifest.model]) {
    const archive = join(archives, resource.fileName)
    try { await access(archive) } catch { await downloadVerified(resource.url, archive, resource.sha256) }
    if (await hash(archive) !== resource.sha256) throw new Error('Resource archive checksum does not match the app manifest')
    const directory = join(destination, resource.resourceId)
    await mkdir(directory, { recursive: true })
    await tar.x({ file: archive, cwd: directory, strict: true, preservePaths: false })
    for (const file of resource.criticalFiles) {
      const path = join(directory, file.path)
      if ((await stat(path)).size !== file.size || await hash(path) !== file.sha256) throw new Error('Extracted resource critical file mismatch')
    }
    paths[resource.kind] = directory
  }
  const executable = join(paths.runtime, target === 'win-x64' ? 'python.exe' : 'bin/python3')
  const wheels = JSON.parse(await readFile(join(root, 'scripts/recording-asr-wheels.json'), 'utf8'))
  const expectedCt2 = wheels[target].find(wheel => wheel.name === 'ctranslate2').version
  const check = spawnSync(executable, ['-I', '-c', 'import sys, os, faster_whisper, ctranslate2; assert ctranslate2.__version__ == os.environ["EXPECTED_CT2"]; from faster_whisper import WhisperModel; WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=1, local_files_only=True); print("Speech resources loaded successfully")', paths.model], {
    stdio: 'inherit', timeout: 120000, env: { ...process.env, ORT_DISABLE_TELEMETRY: '1', HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', EXPECTED_CT2: expectedCt2 }
  })
  if (check.status !== 0) throw new Error('Extracted speech environment/model failed to load')
}
export async function merge(paths, output) {
  const result = { schemaVersion: 1, releaseTag: '', runtimes: {}, model: null }
  for (const path of paths) {
    const part = JSON.parse(await readFile(path, 'utf8'))
    if (result.releaseTag && result.releaseTag !== part.releaseTag) throw new Error('Resource fragments belong to different releases')
    result.releaseTag = part.releaseTag
    for (const [target, value] of Object.entries(part.runtimes ?? {})) {
      if (result.runtimes[target] && JSON.stringify(result.runtimes[target]) !== JSON.stringify(value)) throw new Error('Conflicting runtime resource fragments')
      result.runtimes[target] = value
    }
    if (part.model) {
      if (result.model && JSON.stringify(result.model) !== JSON.stringify(part.model)) throw new Error('Conflicting model resource fragments')
      result.model = part.model
    }
  }
  for (const target of targets) validateManifest(result, target)
  await mkdir(dirname(resolve(output)), { recursive: true })
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  await writeFile(`${output}.sha256`, `${await hash(output)}  ${output.split(/[\\/]/).at(-1)}\n`)
  return result
}
async function cli() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'build') await build(args[0], resolve(args[1] ?? join(root, '../dist/speech-resources', args[0])))
  else if (command === 'stage') await stage(args[0], resolve(args[1]), args[2])
  else if (command === 'verify') await verify(args[0], args[1], args[2], args[3])
  else if (command === 'merge') await merge(args.slice(1), args[0] ?? defaultManifest)
  else if (command === 'validate') {
    try { validateManifest(JSON.parse(await readFile(args[1] ?? defaultManifest, 'utf8')), args[0]) }
    catch (error) { throw new Error('Speech resource metadata is not prepared. Build/merge verified resource archives before packaging.', { cause: error }) }
  } else if (command === 'pack') {
    const resource = await archiveResource({ kind: args[0], target: args[1], source: args[2], output: args[3], releaseTag: args[4] })
    await writeFile(join(args[3], `${args[1]}-${args[0]}.json`), `${JSON.stringify({ schemaVersion: 1, releaseTag: args[4], runtimes: args[0] === 'runtime' ? { [args[1]]: resource } : {}, ...(args[0] === 'model' ? { model: resource } : {}) }, null, 2)}\n`)
  } else throw new Error('Usage: recording-resources.mjs build <target> [output] | merge <output> <fragments...> | validate <target> [manifest]')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli()
