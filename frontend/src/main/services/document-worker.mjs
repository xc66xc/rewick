import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

function clean(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
}

async function extract(path) {
  const extension = extname(path).toLowerCase()
  if (!['.pdf', '.txt', '.md'].includes(extension)) throw new Error('仅支持 PDF、TXT 和 MD 文件。')
  const info = await stat(path)
  if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB，且必须是普通文件。')
  const bytes = await readFile(path)
  if (bytes.length > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB。')
  const pages = []
  let pageCount = 0
  if (extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const packageUrl = import.meta.resolve('pdfjs-dist/package.json')
    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true,
      standardFontDataUrl: fileURLToPath(new URL('./standard_fonts/', packageUrl)),
      cMapUrl: fileURLToPath(new URL('./cmaps/', packageUrl)), cMapPacked: true, verbosity: 0 })
    let pdf
    try {
      pdf = await loading.promise
      pageCount = pdf.numPages
      if (pageCount > 100) throw new Error('PDF 超过 100 页，请拆分后导入。')
      for (let number = 1; number <= pageCount; number++) {
        const page = await pdf.getPage(number)
        const content = await page.getTextContent()
        let text = ''
        let previousY
        for (const item of content.items) {
          if (!('str' in item)) continue
          const y = item.transform?.[5]
          if (previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 2 && !text.endsWith('\n')) text += '\n'
          text += item.str + (item.hasEOL ? '\n' : ' ')
          previousY = y
        }
        pages.push({ number, text: clean(text) })
        page.cleanup()
      }
    } catch (error) {
      if (error?.name === 'PasswordException') throw new Error('PDF 已加密，请先提供解密后的副本。')
      if (error?.name === 'InvalidPDFException') throw new Error('PDF 已损坏或格式无效。')
      throw error
    } finally { await loading.destroy().catch(() => undefined) }
  } else {
    let text
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new Error('文本文件不是有效 UTF-8，请转换编码后重试。') }
    pages.push({ number: 1, text: clean(text) })
  }
  const text = pages.map((page) => page.text).join('\n\n')
  if (!/[\p{L}\p{N}]/u.test(text)) throw new Error('未提取到可读文字；扫描 PDF 需先做 OCR。')
  if (text.length > 3_500_000) throw new Error('文档文字超过容量限制，请拆分后导入。')
  if ((text.match(/\uFFFD|\u0000/g)?.length ?? 0) > text.length * 0.02) throw new Error('文档文字存在大量乱码，请检查文本层或编码。')
  return { text, pages, pageCount }
}

extract(workerData.path).then(
  (value) => parentPort.postMessage({ value }),
  (error) => parentPort.postMessage({ error: /PDF|文件|文字|乱码|编码|容量|OCR/.test(error.message) ? error.message : '无法读取或解析文档，请检查文件是否完整。' }),
)
