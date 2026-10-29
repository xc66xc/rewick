import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm, readdir, cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { downloadVerified } from './recording-download.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wheelLock = JSON.parse(await readFile(join(root, 'scripts/recording-asr-wheels.json'), 'utf8'))
const modelLock = JSON.parse(await readFile(join(root, 'scripts/recording-asr-model.json'), 'utf8'))
const target = `${process.argv[2]}-${process.argv[3]}`
const wheels = wheelLock[target]
if (!wheels) throw new Error('Offline speech recognition supports mac arm64 and win x64 only')
const runtime = join(root, 'build/python-runtime/python')
const sitePackages = join(runtime, target.startsWith('win') ? 'Lib/site-packages' : 'lib/python3.12/site-packages')
const fingerprint = createHash('sha256').update(JSON.stringify(wheels)).digest('hex')
const marker = join(runtime, '.rewick-asr')
let prepared = false
try { prepared = await readFile(marker, 'utf8') === `${target}:${fingerprint}` } catch {}
if (!prepared) {
  console.log(`Preparing local speech recognition dependencies (${target})…`)
  // The bundled environment is generated from this lock; remove obsolete modules
  // and dist-info before installing a different dependency fingerprint.
  await rm(sitePackages, { recursive: true, force: true })
  await mkdir(sitePackages, { recursive: true })
  for (const wheel of wheels) {
    const archive = join(root, 'build/asr-wheel-cache', wheel.file)
    await downloadVerified(wheel.url, archive, wheel.sha256)
    // Relative paths from root with cwd: Windows GNU tar treats "G:\..." drive letters as remote host specs.
    const extracted = spawnSync('tar', ['-xf', archive.replace(root + '\\', ''), '-C', sitePackages.replace(root + '\\', '')], { stdio: 'inherit', cwd: root })
    if (extracted.status !== 0) throw new Error(`Cannot extract ASR wheel ${wheel.file}; tar with ZIP support is required`)
  }
  // Wheel data directories use installation schemes, not importable package paths.
  for (const entry of await readdir(sitePackages)) {
    if (!entry.endsWith('.data')) continue
    for (const scheme of ['purelib', 'platlib']) {
      const source = join(sitePackages, entry, scheme)
      try { await cp(source, sitePackages, { recursive: true }); await rm(source, { recursive: true }) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
  await writeFile(marker, `${target}:${fingerprint}`)
}
console.log('Checking bundled local speech model…')
for (const file of modelLock.files) {
  await downloadVerified(file.url, join(root, 'build/asr-model', file.file), file.sha256)
}
await cp(join(root, 'scripts/recording-asr-model-LICENSE.txt'), join(root, 'build/asr-model/LICENSE.txt'))
console.log('Local speech recognition resources ready (audio stays on this computer).')
