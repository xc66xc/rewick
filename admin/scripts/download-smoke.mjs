import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = await mkdtemp(join(tmpdir(), 'client-download-nginx-'))
const name = `client-download-smoke-${process.pid}`
let enabled = true
const upstream = createServer((req, res) => {
  if (req.url === '/downloads/macos/arm64' && enabled) {
    res.writeHead(200, { 'X-Accel-Redirect': '/_client_files/macos-arm64/current.dmg', 'Content-Disposition': 'attachment; filename="Rewick-macos-arm64.dmg"' })
  } else res.writeHead(404)
  res.end()
})
await new Promise(resolve => upstream.listen(0, '0.0.0.0', resolve))
const port = upstream.address().port
try {
  await mkdir(join(root, 'files/macos-arm64'), { recursive: true })
  await writeFile(join(root, 'files/macos-arm64/current.dmg'), '0123456789')
  const config = (await readFile(new URL('../nginx.conf', import.meta.url), 'utf8')).replaceAll('backend:8080', `host.docker.internal:${port}`)
  await writeFile(join(root, 'nginx.conf'), config)
  execFileSync('docker', ['run', '-d', '--name', name, '--add-host=host.docker.internal:host-gateway', '-p', '127.0.0.1::80', '-v', `${root}/nginx.conf:/etc/nginx/conf.d/default.conf:ro`, '-v', `${root}/files:/usr/share/nginx/client-downloads:ro`, 'nginx:stable-alpine'], { stdio: 'pipe' })
  const address = execFileSync('docker', ['port', name, '80/tcp'], { encoding: 'utf8' }).trim()
  execFileSync('docker', ['exec', name, 'nginx', '-t'], { stdio: 'pipe' })
  const url = `http://${address}`
  // Wait on container startup without retrying any download assertions.
  for (let i = 0; i < 30; i++) { try { await fetch(url); break } catch { await new Promise(resolve => setTimeout(resolve, 100)) } }
  const complete = await fetch(`${url}/downloads/macos/arm64`)
  assert.equal(complete.status, 200)
  assert.match(complete.headers.get('content-disposition'), /attachment/)
  assert.equal(await complete.text(), '0123456789')
  const part = await fetch(`${url}/downloads/macos/arm64`, { headers: { Range: 'bytes=2-5' } })
  assert.equal(part.status, 206)
  assert.equal(await part.text(), '2345')
  assert.equal((await fetch(`${url}/_client_files/macos-arm64/current.dmg`)).status, 404)
  enabled = false
  assert.equal((await fetch(`${url}/downloads/macos/arm64`)).status, 404)
  console.log('Nginx download smoke passed: attachment, range, internal path protection, disabled download')
} finally {
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' }) } catch {}
  upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve))
  await rm(root, { recursive: true, force: true })
}
