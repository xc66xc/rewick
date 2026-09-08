export interface DocumentPage { number: number; text: string }
export interface DocumentChunk { text: string; pageStart?: number; pageEnd?: number }

export function chunkDocument(pages: DocumentPage[], isPdf: boolean): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  for (const page of pages) {
    const text = page.text.trim()
    let start = 0
    while (start < text.length) {
      let end = Math.min(start + 800, text.length)
      if (end < text.length) {
        const candidate = text.slice(start + 400, end)
        const boundaries = [...candidate.matchAll(/\n\n|[。！？.!?]\s|\n/g)]
        const boundary = boundaries.at(-1)
        if (boundary) end = start + 400 + boundary.index! + boundary[0].length
      }
      const content = text.slice(start, end).trim()
      if (content) chunks.push({ text: content, ...(isPdf ? { pageStart: page.number, pageEnd: page.number } : {}) })
      if (chunks.length > 5000) throw new Error('资料片段超过 5,000 条，请缩小文档范围。')
      if (end === text.length) break
      start = end - 100
    }
  }
  if (!chunks.length) throw new Error('文档没有可用于检索的文字。')
  return chunks
}
