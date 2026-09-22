// Pinned Astral python-build-standalone release; verify SHA256 before extraction.
import { rootCertificates } from 'node:tls'
import { mkdir, readFile, rename, rm, writeFile, access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadVerified } from './recording-download.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const specs = {
  'mac-arm64': ['aarch64-apple-darwin', '3ee3ee547cedfeb7c2b16b2b7156039f7b470bb8f857e226fd3d2eb11db83c76'],
  'win-x64': ['x86_64-pc-windows-msvc', 'e90c1b6419da3bd812dd73bb3de40287a21abf153438147639ec5e20375ea93f']
}
const platform = process.argv[2] ?? (process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform)
const arch = process.argv[3] ?? process.arch
const target = `${platform}-${arch}`
const prepareAsr = () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/prepare-recording-asr.mjs'), platform, arch], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Local speech recognition preparation failed')
}
const spec = specs[target]
if (!spec) throw new Error('Python runtime supports mac arm64 and win x64 only')
const [triple, sha256] = spec
const version = '3.12.14+20260901'
const base = join(root, 'build', 'python-runtime')
const destination = join(base, 'python')
const marker = join(destination, '.rewick-runtime')
try {
  if (await readFile(marker, 'utf8') === `${target}:${sha256}`) {
    await access(join(destination, target.startsWith('win') ? 'python.exe' : 'bin/python3'))
    await writeFile(join(destination, 'cacert.pem'), rootCertificates.join('\n') + '\n')
    prepareAsr()
    process.exit(0)
  }
} catch (error) {
  if (error.message === 'Local speech recognition preparation failed') throw error
}
await mkdir(base, { recursive: true })
const archive = join(base, 'runtime.tar.gz')
const staging = join(base, 'staging')
try {
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/20260901/cpython-${encodeURIComponent(version)}-${triple}-install_only.tar.gz`
  await downloadVerified(url, archive, sha256)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const extracted = spawnSync('tar', ['-xzf', archive, '-C', staging], { stdio: 'inherit' })
  if (extracted.status !== 0) throw new Error('Python runtime extraction failed; tar is required for packaging')
  await rm(destination, { recursive: true, force: true })
  await rename(join(staging, 'python'), destination)
  await writeFile(join(destination, 'cacert.pem'), rootCertificates.join('\n') + '\n')
  await writeFile(marker, `${target}:${sha256}`)
} finally {
  await rm(archive, { force: true })
  await rm(staging, { recursive: true, force: true })
}

prepareAsr()
