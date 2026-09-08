import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const syntheticResumeMarker = 'SYNTHETIC_CANDIDATE_42'
export const syntheticResumeChineseMarker = '合成候选人：参与演示订单系统。'
export const syntheticCacheMarker = 'CACHE_REFERENCE_ONLY_73'

// A small standards-based PDF with actual text objects, not an image or mocked extractor.
function textPdf(pages, unicode = false) {
  const hex = text => [...text].map(character => character.codePointAt(0).toString(16).padStart(4, '0')).join('')
  const pageObjectStart = unicode ? 7 : 4
  const fontObjects = unicode ? (() => {
    const characters = [...new Set(pages.flat().join(''))]
    const blocks = []
    for (let index = 0; index < characters.length; index += 100) {
      const group = characters.slice(index, index + 100)
      blocks.push(`${group.length} beginbfchar\n${group.map(character => `<${hex(character)}> <${hex(character)}>`).join('\n')}\nendbfchar`)
    }
    const map = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SyntheticUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`
    return [
      '<< /Type /Font /Subtype /Type0 /BaseFont /SyntheticCJK /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>',
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SyntheticCJK /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 1000 >>',
      `<< /Length ${Buffer.byteLength(map)} >>\nstream\n${map}endstream`,
      '<< /Type /FontDescriptor /FontName /SyntheticCJK /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>',
    ]
  })() : ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageObjectStart + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ...fontObjects,
  ]
  for (const [index, lines] of pages.entries()) {
    const content = `BT /F1 12 Tf 16 TL 40 800 Td\n${lines.map(line => `${unicode ? `<${hex(line)}>` : `(${line.replace(/[\\()]/g, '\\$&')})`} Tj T*`).join('\n')}\nET\n`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObjectStart + 1 + index * 2} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`)
  }
  let document = '%PDF-1.4\n% Synthetic fixtures contain no personal information.\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(document)
  document += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  document += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  document += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(document)
}

export async function createPdfRagFixtures(directory) {
  await mkdir(directory, { recursive: true })
  const files = {
    resume: join(directory, 'synthetic-resume.pdf'),
    cache: join(directory, 'synthetic-cache-reference.pdf'),
    database: join(directory, 'synthetic-database-reference.txt'),
    blank: join(directory, 'synthetic-blank.pdf'),
    broken: join(directory, 'synthetic-broken.pdf'),
  }
  await Promise.all([
    writeFile(files.resume, textPdf([[syntheticResumeMarker, syntheticResumeChineseMarker, 'Synthetic resume for automated tests only.',
      'Built a demo orders service and investigated SQL query latency.', 'No real candidate, employer, or private information.']], true)),
    writeFile(files.cache, textPdf([
      ['Synthetic technical reference. This is not personal career history.', 'Redis cache consistency: use cache-aside and invalidate stale keys.', syntheticCacheMarker],
      ['Redis cache invalidation details.', 'Update the database first, then remove the affected cache key.', 'Use a bounded TTL and monitor delayed invalidation events.'],
    ])),
    writeFile(files.database, '# 合成数据库参考资料\n\nMYSQL_REFERENCE_ONLY_89\n使用 EXPLAIN 分析 MySQL 慢查询，检查索引覆盖和扫描行数。此内容只作自动测试的技术参考，不描述任何人的亲身经历。\n'),
    writeFile(files.blank, textPdf([[]])),
    writeFile(files.broken, '%PDF-1.7\nintentionally invalid synthetic fixture'),
  ])
  return files
}
