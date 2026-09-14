import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
const html = readFileSync(resolve('../landing/index.html'), 'utf8')
const script = readFileSync(resolve('../landing/vendor/downloads.js'), 'utf8')
const data = ['windows-x64', 'macos-arm64', 'macos-x64'].map(id => ({ id, enabled: id !== 'macos-x64', fileSize: 1024, version: '0.5.0', minimumOsVersion: '12+', releaseNotes: '<script>untrusted</script>' }))
it('loads current packages and keeps unavailable architectures disabled without rendering HTML from the server', async () => {
  document.body.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(data)))
  new Function(script)()
  await vi.waitFor(() => expect(document.querySelector('[data-download="macos-arm64"] a')?.getAttribute('href')).toBe('/downloads/macos/arm64'))
  expect(document.querySelector('[data-download="macos-x64"] a')?.getAttribute('href')).toBeNull()
  expect(document.querySelector('[data-download-notes] p')?.textContent).toBe('<script>untrusted</script>')
  expect(document.querySelector('[data-download-notes] script')).toBeNull()
})
it('offers retry on network failure and then restores valid download links', async () => {
  document.body.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Response.json(data)))
  new Function(script)()
  const retry = document.getElementById('download-retry') as HTMLButtonElement
  await vi.waitFor(() => expect(retry.hidden).toBe(false))
  retry.click()
  await vi.waitFor(() => expect(document.querySelector('[data-download="windows-x64"] a')?.getAttribute('href')).toBe('/downloads/windows/x64'))
})
