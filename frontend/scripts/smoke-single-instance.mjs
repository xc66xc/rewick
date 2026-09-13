import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const userData = await mkdtemp(join(tmpdir(), 'copilot-single-instance-'))
const env = { ...process.env, COPILOT_USER_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
let first
let second
try {
  first = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: root, env })
  await first.firstWindow()
  await first.evaluate(({ app, BrowserWindow }) => {
    globalThis.secondInstanceSeen = false
    app.once('second-instance', () => { globalThis.secondInstanceSeen = true })
    BrowserWindow.getAllWindows()[0].minimize()
  })
  second = spawn(electronPath, ['.'], { cwd: root, env, stdio: 'ignore' })
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { second.kill(); reject(new Error('Second process did not exit')) }, 15_000)
    second.once('error', error => { clearTimeout(timeout); reject(error) })
    second.once('exit', code => { clearTimeout(timeout); resolve(code) })
  })
  assert.equal(code, 0)
  await expect.poll(() => first.evaluate(({ BrowserWindow }) => ({
    notified: globalThis.secondInstanceSeen,
    count: BrowserWindow.getAllWindows().length,
    minimized: BrowserWindow.getAllWindows()[0].isMinimized(),
    visible: BrowserWindow.getAllWindows()[0].isVisible()
  }))).toEqual({ notified: true, count: 1, minimized: false, visible: true })
  console.log('PASS: repeated launch exits and restores the existing desktop window')
} finally {
  if (second && second.exitCode === null) second.kill()
  await first?.close()
  await rm(userData, { recursive: true, force: true })
}
