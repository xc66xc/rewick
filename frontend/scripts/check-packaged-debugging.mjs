import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, access, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

// Use a fresh profile for every launch; never attach to the user's signed-in application.
const executable = resolve(process.argv[2] || '../dist/debug-hardened/mac-arm64/掌灯 Rewick.app/Contents/MacOS/掌灯 Rewick')
await access(executable)
const ports = [39222, 39229, 9229]
async function listening(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = value => { socket.destroy(); resolve(value) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(100, () => finish(false))
  })
}
for (const port of ports) assert.equal(await listening(port), false, `Stop the existing listener on ${port} before testing`)

async function check(name, args, { normal = false, inject = false, signal = false } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'copilot-debug-security-'))
  const sentinel = join(profile, 'injected')
  const injection = join(profile, 'injection.cjs')
  await writeFile(injection, `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')`)
  const env = { ...process.env, COPILOT_USER_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  delete env.NODE_EXTRA_CA_CERTS
  if (inject) env.NODE_OPTIONS = `--require=${injection} --inspect=39229`
  const child = spawn(executable, args, { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  let exited = false
  let exitCode
  let exitSignal
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, receivedSignal) => { exited = true; exitCode = code; exitSignal = receivedSignal; resolve() })
  })
  child.stderr.on('data', data => { stderr += data.toString() })
  try {
    for (let step = 0; step < 160; step++) {
      for (const port of ports) assert.equal(await listening(port), false, `${name}: debugger listening on ${port}`)
      if (signal && step === 120 && !exited) child.kill('SIGUSR1')
      if (exited) break
      await delay(50)
    }
    assert.doesNotMatch(stderr, /Debugger listening|DevTools listening/)
    // With Node's inspector signal handler disabled, macOS may apply SIGUSR1's
    // default termination action. It must never start an inspector.
    if (signal && exited) assert.equal(exitSignal, 'SIGUSR1')
    else if (normal) assert.equal(exited, false, `${name}: normal startup unexpectedly exited (${exitCode})`)
    else {
      assert.equal(exited, true, `${name}: debugging launch did not exit`)
      assert.equal(exitCode, 1, `${name}: expected explicit rejection`)
      assert.match(stderr, /打包版不允许使用调试启动参数/)
    }
    assert.equal(await access(sentinel).then(() => true, () => false), false, 'NODE_OPTIONS executed injected code')
    console.log(`PASS ${name}`)
  } finally {
    if (!exited) child.kill('SIGTERM')
    await Promise.race([completion, delay(2000)])
    if (!exited) { child.kill('SIGKILL'); await completion }
    await rm(profile, { recursive: true, force: true })
  }
}

await check('remote port equals', ['--remote-debugging-port=39222'])
await check('remote port separate argument', ['--remote-debugging-port', '39222'])
await check('remote port auto allocation', ['--remote-debugging-port=0'])
await check('remote debugging pipe', ['--remote-debugging-pipe'])
await check('Node inspector', ['--inspect=39229'])
await check('Node inspector break', ['--inspect-brk=39229'])
await check('normal startup', [], { normal: true })
await check('SIGUSR1 cannot start inspector', [], { normal: true, signal: true })
await check('NODE_OPTIONS ignored', [], { normal: true, inject: true })
