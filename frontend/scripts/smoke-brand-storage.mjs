// Verify the real entry point can decrypt a fixture created under the stable pre-brand identity.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'rewick-brand-storage-'))
const env = { ...process.env, COPILOT_USER_DATA: directory }
delete env.ELECTRON_RUN_AS_NODE
try {
  const seed = join(directory, 'seed.cjs')
  const fixture = join(directory, 'fixture.txt')
  await writeFile(seed, `const { app, safeStorage } = require('electron');
const fs = require('node:fs');
app.setName('Interview Copilot');
app.setPath('userData', process.env.COPILOT_USER_DATA);
app.whenReady().then(() => {
  fs.writeFileSync(${JSON.stringify(fixture)}, safeStorage.encryptString('synthetic-brand-fixture').toString('base64'));
  app.exit(0);
}).catch(() => app.exit(1));`)
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [seed], { env, stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Seed exited: ${code}`)))
  })
  const encrypted = await readFile(fixture, 'utf8')
  const probe = join(directory, 'probe.cjs')
  await writeFile(probe, `const { app, safeStorage } = require('electron');
app.whenReady().then(() => setTimeout(() => {
  try {
    const recovered = safeStorage.decryptString(Buffer.from(${JSON.stringify(encrypted)}, 'base64')) === 'synthetic-brand-fixture';
    process.stdout.write(JSON.stringify({ name: app.getName(), recovered }) + '\\n');
    app.exit(recovered ? 0 : 1);
  } catch { app.exit(2); }
}, 500));`)
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['-r', probe, '.'], { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', data => { output += data.toString() })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(`App exited: ${code}`)))
  })
  assert.deepEqual(result, { name: 'Interview Copilot', recovered: true })
  console.log('PASS: branded app retains existing Safe Storage identity')
} finally {
  await rm(directory, { recursive: true, force: true })
}
