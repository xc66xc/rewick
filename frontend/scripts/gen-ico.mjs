// 生成 Windows 多尺寸 build/icon.ico：按落地页品牌 logo（渐变圆角方块 + 白色 audio-lines）
// 用 Chromium 矢量渲染每个尺寸后打包（ICO 内嵌 PNG 格式，Vista+ 均支持）。
// 用法：node scripts/gen-ico.mjs（改设计后重跑即可）；mac 的 icon.icns 走 AppIcon.iconset，与本脚本无关。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build/win-icon')
const SIZES = [16, 32, 48, 64, 128, 256]

// 设计出处：prototype/landing.html 顶部 Logo（30×30 方块 / 8px 圆角 / 16×16 图标）
const GLYPH_PATH =
  'M5.62939 1.20313q-0.09912 0.04443-0.1914 0.12988-0.08887 0.08203-0.1333 0.16406l-0.04102 0.09912 0 10.80762 0.04102 0.09912q0.12646 0.2666 0.42041 0.31445 0.29395 0.04785 0.50586-0.14697 0.08203-0.08545 0.14013-0.18115l0.04102-0.1128 0-10.75292-0.04102-0.1128q-0.09912-0.19482-0.29394-0.29394-0.08545-0.04102-0.21875-0.04102-0.1333 0-0.22901 0.02734z m4.77149 1.14843q-0.0957 0.01367-0.17432 0.05127-0.07519 0.03418-0.15381 0.12647-0.0752 0.08887-0.11962 0.17431l-0.02735 0.09571 0 7.86816 0.04102 0.08545q0.04443 0.06836 0.12646 0.15381 0.08545 0.08203 0.16065 0.12646 0.07861 0.04102 0.24609 0.04102 0.16748 0 0.24268-0.04102 0.07861-0.04443 0.16064-0.12646 0.08545-0.08545 0.12988-0.15381l0.04102-0.08545 0-7.04102q0-0.65967-0.02734-0.84082-0.01367-0.14014-0.05811-0.19482l-0.02734-0.02734q-0.09912-0.12646-0.2461-0.18116-0.14697-0.05811-0.31445-0.03076z m-7.05469 0.58789q-0.25293 0.08545-0.37939 0.30762l-0.04102 0.08545 0 6.69238 0.02735 0.0957q0.08545 0.21192 0.29394 0.32471 0.09912 0.04102 0.25293 0.04102 0.15381 0 0.25293-0.04102 0.2085-0.11279 0.29395-0.32471l0.02734-0.0957 0-6.69238-0.04102-0.08545q-0.09912-0.18115-0.28027-0.2666-0.08545-0.04102-0.22559-0.04785-0.14014-0.00684-0.18115 0.00683z m4.73047 1.16211q-0.18115 0.01367-0.31445 0.14698-0.1333 0.1333-0.17432 0.31445-0.01367 0.11279 0 2.21142l0 2.10205 0.04102 0.1128q0.05811 0.0957 0.14013 0.18115 0.21191 0.19482 0.50586 0.14697 0.29395-0.04785 0.42041-0.31445l0.04102-0.09912 0.01367-4.34082-0.04102-0.0957q-0.08545-0.19824-0.25293-0.30079-0.16748-0.10596-0.37939-0.06494z m-7.05469 1.16211q-0.14014 0.04102-0.2666 0.16065-0.12646 0.11963-0.15381 0.30078-0.02734 0.08545-0.02734 0.97412 0 0.88867 0.02734 0.98779 0.04102 0.23584 0.23584 0.36914 0.19824 0.1333 0.4375 0.09229 0.0957-0.01367 0.16406-0.04785 0.07178-0.0376 0.14014-0.1128 0.07178-0.07861 0.11621-0.16064l0.04102-0.09912 0.01367-1.73633q-0.01367-0.22217-0.02734-0.29736-0.01367-0.07861-0.07178-0.16407-0.08203-0.15381-0.2666-0.229-0.18115-0.07861-0.36231-0.0376z m11.67578 0q-0.08545 0.02734-0.18457 0.09229-0.0957 0.06152-0.15039 0.1333-0.0581 0.08203-0.07861 0.16064-0.02051 0.0752-0.03418 0.31446l0.01367 1.76367 0.04102 0.09912q0.04443 0.08203 0.11279 0.16064 0.07178 0.0752 0.14014 0.1128 0.07178 0.03418 0.16748 0.04785 0.23926 0.04102 0.43408-0.09229 0.19824-0.1333 0.25293-0.36914 0.01367-0.09912 0.01367-0.98096 0-0.88184-0.02734-0.98095-0.02734-0.16748-0.15381-0.29395-0.09912-0.11279-0.25293-0.15381-0.15381-0.04102-0.29395-0.01367z'

const pageHtml = (size) => {
  const radius = ((8 / 30) * size).toFixed(2)
  const glyph = ((16 / 30) * size).toFixed(2)
  return `<!doctype html><html><head><style>
* { margin: 0; padding: 0 }
html, body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent }
.logo { width: ${size}px; height: ${size}px; border-radius: ${radius}px;
  background: linear-gradient(94deg, #134CFF 3.154%, #8337FF 96.846%);
  display: flex; align-items: center; justify-content: center }
.logo svg { width: ${glyph}px; height: ${glyph}px; display: block }
</style></head><body>
<div class="logo"><svg viewBox="0 0 13.99993896484375 14" xmlns="http://www.w3.org/2000/svg">
<path d="${GLYPH_PATH}" fill="#FFFFFF"></path></svg></div>
</body></html>`
}

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(pageHtml(size), { waitUntil: 'load' })
  await page.screenshot({ path: join(outDir, `icon_${size}.png`), omitBackground: true })
}
await browser.close()

const entries = SIZES.map((size) => {
  const png = readFileSync(join(outDir, `icon_${size}.png`))
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  if (width !== size || height !== size) throw new Error(`icon_${size}.png 实际为 ${width}x${height}，预期 ${size}x${size}`)
  return { png, size }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4)
const dir = Buffer.alloc(16 * entries.length)
let offset = header.length + dir.length
entries.forEach(({ png, size }, i) => {
  const e = 16 * i
  dir.writeUInt8(size >= 256 ? 0 : size, e)          // 宽（256 用 0 表示）
  dir.writeUInt8(size >= 256 ? 0 : size, e + 1)      // 高
  dir.writeUInt16LE(1, e + 4)                        // planes
  dir.writeUInt16LE(32, e + 6)                       // bitCount
  dir.writeUInt32LE(png.length, e + 8)               // bytesInRes
  dir.writeUInt32LE(offset, e + 12)                  // imageOffset
  offset += png.length
})
writeFileSync(join(root, 'build/icon.ico'), Buffer.concat([header, dir, ...entries.map(e => e.png)]))
console.log(`build/icon.ico 已生成：${SIZES.join('/')} 共 ${offset} 字节（PNG 在 build/win-icon/）`)
