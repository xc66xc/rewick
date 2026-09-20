import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'
import { fileURLToPath } from 'node:url'
const directory = await mkdtemp(join(tmpdir(), 'copilot-compact-'))
try {
  await build({ entryPoints: [fileURLToPath(new URL('../src/main/services/desktop-windows.ts', import.meta.url))], outfile: join(directory, 'windows.cjs'), bundle: true, platform: 'node', external: ['electron'] })
  await writeFile(join(directory, 'main.cjs'), `
const { app } = require('electron')
const assert = require('node:assert/strict')
const { DesktopWindows } = require('./windows.cjs')
app.setPath('userData', ${JSON.stringify(join(directory, 'data'))})
app.whenReady().then(async () => {
  let disposed = false
  const modes = []
  const windows = new DesktopWindows({ sandbox: true, contextIsolation: true, backgroundThrottling: false },
    { backgroundOpacity: 35, contentProtection: true }, (_, compact) => modes.push(compact), () => { disposed = true })
  const contents = windows.view.webContents
  await contents.loadURL('data:text/html,<html style="background:transparent"><body>compact smoke</body></html>')
  await contents.executeJavaScript('window.marker = 123; window.ticks = 0; setInterval(() => window.ticks++, 20)')
  windows.full.show()
  const bounds = windows.full.getBounds()
  for (let i = 0; i < 3; i++) {
    windows.setCompact(true)
    assert.equal(windows.active.isContentProtected(), true)
    assert.equal(windows.full.isVisible(), false)
    assert.equal(windows.active.webContents.id, contents.id)
    assert.equal(await contents.executeJavaScript('window.marker'), 123)
    windows.setPinned(true)
    assert.equal(windows.active.isAlwaysOnTop(), true)
    windows.setPreferences({ backgroundOpacity: 0, contentProtection: false })
    assert.equal(windows.active.isContentProtected(), false)
    windows.setPreferences({ backgroundOpacity: 35, contentProtection: true })
    windows.active.close()
    assert.equal(windows.active, windows.full)
    assert.deepEqual(windows.full.getBounds(), bounds)
    assert.equal(windows.full.isContentProtected(), false)
  }
  assert.deepEqual(modes, [true, false, true, false, true, false])
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.ok(await contents.executeJavaScript('window.ticks > 0'))
  windows.setCompact(true)
  windows.prepareQuit()
  const destroyed = new Promise(resolve => contents.once('destroyed', resolve))
  windows.full.close()
  await destroyed
  assert.equal(disposed, true)
  assert.equal(contents.isDestroyed(), true)
  console.log('PASS: persistent renderer, protection toggle, restore, close and cleanup')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await new Promise((resolve, reject) => {
    const child = spawn(electron, [join(directory, 'main.cjs')], { env, stdio: 'inherit' })
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Native window smoke timed out')) }, 30000)
    child.on('error', reject)
    child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Electron exited ${code}`)) })
  })
} finally { await rm(directory, { recursive: true, force: true }) }
