import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractDocument } from '../../src/main/services/document-extractor'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'copilot-extract-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

async function fixtures() {
  const fixtureModule = await import(new URL('../fixtures/pdf-rag.mjs', import.meta.url).href) as {
    createPdfRagFixtures(path: string): Promise<{ resume: string; cache: string; blank: string; broken: string }>
    syntheticResumeChineseMarker: string
  }
  return { files: await fixtureModule.createPdfRagFixtures(directory), marker: fixtureModule.syntheticResumeChineseMarker }
}

describe('Document extraction worker', () => {
  it('extracts Chinese and English text from a real text-layer PDF', async () => {
    const { files, marker } = await fixtures()
    const result = await extractDocument(files.resume)
    expect(result.pageCount).toBe(1)
    expect(result.text).toContain(marker)
    expect(result.text).toContain('SYNTHETIC_CANDIDATE_42')
    expect(result.pages[0].number).toBe(1)
  })

  it('preserves page numbers when splitting a multi-page PDF', async () => {
    const { files } = await fixtures()
    const result = await extractDocument(files.cache)
    expect(result.pageCount).toBe(2)
    expect(result.pages.map(page => page.number)).toEqual([1, 2])
  })

  it('rejects blank and damaged PDFs instead of importing empty usable documents', async () => {
    const { files } = await fixtures()
    await expect(extractDocument(files.blank)).rejects.toThrow('未提取到可读文字')
    await expect(extractDocument(files.broken)).rejects.toThrow(/PDF|解析/)
  })

  it('normalizes UTF-8 text while preserving headings and code', async () => {
    const path = join(directory, 'notes.md')
    await writeFile(path, '\uFEFF# Redis\r\n\r\n缓存一致性\r\n```ts\r\nconst count = 1\r\n```')
    const result = await extractDocument(path)
    expect(result).toMatchObject({ pageCount: 0, text: '# Redis\n\n缓存一致性\n```ts\nconst count = 1\n```' })
  })

  it('rejects invalid encodings, files over 10 MB and already cancelled requests', async () => {
    const path = join(directory, 'notes.txt')
    await writeFile(path, Buffer.from([0xff, 0xfe, 0x00]))
    await expect(extractDocument(path)).rejects.toThrow('UTF-8')
    await writeFile(path, Buffer.alloc(10 * 1024 * 1024 + 1, 97))
    await expect(extractDocument(path)).rejects.toThrow('10 MB')
    const controller = new AbortController()
    controller.abort()
    expect(() => extractDocument(path, controller.signal)).toThrow()
  })

})
