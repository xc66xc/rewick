// macOS build utility: resize approved artwork without redrawing, then encode ICNS/ICO.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = join(root, 'assets/branding/rewick-icon-source.png')
async function png(size, destination) {
  const file = join(root, destination)
  await mkdir(join(file, '..'), { recursive: true })
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', file], { stdio: 'ignore' })
}
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) await png(size * scale, `frontend/build/AppIcon.iconset/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)
}
execFileSync('iconutil', ['-c', 'icns', join(root, 'frontend/build/AppIcon.iconset'), '-o', join(root, 'frontend/build/icon.icns')])
const sizes = [16, 32, 48, 64, 128, 256]
const images = []
for (const size of sizes) {
  const path = `frontend/build/win-icon/icon_${size}.png`
  await png(size, path)
  images.push(await readFile(join(root, path)))
}
const header = Buffer.alloc(6 + images.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
images.forEach((image, index) => {
  const entry = 6 + index * 16
  header[entry] = header[entry + 1] = sizes[index] % 256
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
await writeFile(join(root, 'frontend/build/icon.ico'), Buffer.concat([header, ...images]))
for (const target of ['frontend/src/renderer/src/assets/rewick-icon.png', 'admin/public/rewick-icon.png', 'landing/rewick-icon.png']) await png(256, target)
for (const target of ['admin/public/favicon.png', 'landing/favicon.png']) await png(64, target)
console.log('Generated Rewick desktop and web icons')
