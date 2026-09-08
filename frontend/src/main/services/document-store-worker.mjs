import { DatabaseSync } from 'node:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { chmodSync } from 'node:fs'

const db = new DatabaseSync(workerData.path)
chmodSync(workerData.path, 0o600)
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, document_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'technical',
  is_enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'parsing', page_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 0, source_path TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0, fingerprint TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, documents_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL, text TEXT NOT NULL, UNIQUE(documents_id, page_number)
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY, documents_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, text TEXT NOT NULL, page_start INTEGER, page_end INTEGER, vector BLOB,
  UNIQUE(documents_id, ordinal)
);
UPDATE documents SET status='error', error='上次解析被中断，请重试。' WHERE status='parsing';
UPDATE documents SET status='pending', error='上次索引被中断，等待重试。' WHERE status='indexing';`)
const columns = 'id, document_id, name, kind, is_enabled, status, page_count, content_hash, revision, source_path, chunk_count, fingerprint, error, created_at, updated_at'
const snapshots = new Map()
function raw(id) { return db.prepare(`SELECT ${columns} FROM documents WHERE document_id=?`).get(id) }
function required(id) { const row = raw(id); if (!row) throw new Error('资料不存在或已移除。'); return row }
function publicDocument(row) {
  return { id: row.document_id, name: row.name, kind: row.kind, enabled: Boolean(row.is_enabled), status: row.status,
    pageCount: row.page_count, contentHash: row.content_hash, revision: row.revision, chunkCount: row.chunk_count,
    createdAt: row.created_at, updatedAt: row.updated_at, ...(row.error ? { error: row.error } : {}) }
}
function transaction(run) {
  db.exec('BEGIN IMMEDIATE')
  try { const value = run(); db.exec('COMMIT'); return value }
  catch (error) { db.exec('ROLLBACK'); throw error }
}
function insertChunks(id, chunks, vectors) {
  const statement = db.prepare('INSERT INTO chunks(documents_id,ordinal,text,page_start,page_end,vector) VALUES(?,?,?,?,?,?)')
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    statement.run(id, i, chunk.text, chunk.pageStart ?? null, chunk.pageEnd ?? null,
      vectors ? Buffer.from(new Float32Array(vectors[i]).buffer) : null)
  }
}
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const stopWords = new Set(['的','了','是','在','和','与','或','什么','怎么','如何','为什么','请','这个','那个','可以','介绍','一下','我们','你','我','吗','吧','呢','有','用','一个','the','a','an','is','are','to','of','and','how','what','why','please'])
function tokens(text) {
  return [...segmenter.segment(text.toLowerCase())].filter((part) => part.isWordLike && !stopWords.has(part.segment)).map((part) => part.segment)
}
function rank(rows, query, context, vector, fingerprint) {
  const questionTerms = new Set(tokens(query))
  const refersBack = /这个|那个|这些|那些|上述|刚才|前面|刚刚|它|该项目|该方案|\b(this|that|these|those|it)\b/i.test(query)
  const terms = [...new Set([...questionTerms, ...(refersBack ? tokens(context) : [])])].slice(0, 80)
  const docs = rows.map((row) => {
    const words = tokens(row.text)
    const counts = new Map()
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)
    return { row, counts, length: words.length, lexical: 0, semantic: 0, score: 0 }
  })
  const average = docs.reduce((sum, item) => sum + item.length, 0) / Math.max(docs.length, 1)
  for (const term of terms) {
    const frequency = docs.filter((item) => item.counts.has(term)).length
    if (!frequency) continue
    const idf = Math.log(1 + (docs.length - frequency + 0.5) / (frequency + 0.5))
    for (const item of docs) {
      const count = item.counts.get(term) ?? 0
      item.lexical += (questionTerms.has(term) ? 4 : 1) * idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * item.length / Math.max(average, 1)))
    }
  }
  if (vector) {
    const magnitude = Math.hypot(...vector)
    for (const item of docs) {
      if (item.row.fingerprint !== fingerprint || !item.row.vector) continue
      const bytes = item.row.vector
      const stored = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      if (stored.length !== vector.length) continue
      let product = 0, norm = 0
      for (let i = 0; i < stored.length; i++) { product += stored[i] * vector[i]; norm += stored[i] * stored[i] }
      item.semantic = product / (Math.sqrt(norm) * magnitude || 1)
    }
  }
  const lexical = docs.filter((item) => item.lexical > 0).sort((a, b) => b.lexical - a.lexical)
  // Conservative initial semantic floor; keyword matches remain independently eligible.
  const semantic = docs.filter((item) => item.semantic >= 0.55).sort((a, b) => b.semantic - a.semantic)
  for (const results of [lexical, semantic]) results.forEach((item, index) => { item.score += 1 / (60 + index) })
  const selected = [], seen = new Set()
  let remaining = 6000
  for (const item of docs.filter((value) => value.score > 0).sort((a, b) => b.score - a.score || b.lexical - a.lexical)) {
    const row = item.row
    const normalized = row.text.replace(/\s+/g, '')
    if (seen.has(normalized) || row.text.length > remaining) continue
    seen.add(normalized)
    selected.push({ documentId: row.document_id, revision: row.revision, name: row.name, kind: row.kind,
      chunkId: `${row.document_id}:${row.revision}:${row.ordinal}`, text: row.text,
      ...(row.page_start !== null ? { pageStart: row.page_start, pageEnd: row.page_end } : {}) })
    remaining -= row.text.length
    if (selected.length === 6) break
  }
  return selected
}

const handlers = {
  list: () => db.prepare(`SELECT ${columns} FROM documents ORDER BY created_at DESC, id DESC`).all().map(publicDocument),
  findHash: ({ hash }) => { const row = db.prepare(`SELECT ${columns} FROM documents WHERE content_hash=?`).get(hash); return row ? publicDocument(row) : null },
  create: ({ id, name, hash, path }) => transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS count FROM documents').get().count >= 30) throw new Error('资料数量不能超过 30 份。')
    const now = new Date().toISOString()
    db.prepare('INSERT INTO documents(document_id,name,content_hash,source_path,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, name, hash, path, now, now)
    return publicDocument(required(id))
  }),
  preview: ({ id }) => { const row = required(id); return { document: publicDocument(row), text: db.prepare('SELECT text FROM pages WHERE documents_id=? ORDER BY page_number').all(row.id).map((page) => page.text).join('\n\n') } },
  indexData: ({ id }) => { const row = required(id); return { document: publicDocument(row), path: row.source_path, fingerprint: row.fingerprint,
    pages: db.prepare('SELECT page_number AS number,text FROM pages WHERE documents_id=? ORDER BY page_number').all(row.id) } },
  setText: ({ id, pages, pageCount, chunks }) => transaction(() => {
    const row = required(id)
    const used = db.prepare('SELECT COALESCE(SUM(chunk_count),0) AS count FROM documents WHERE id<>?').get(row.id).count
    if (used + chunks.length > 5000) throw new Error('资料库合计不能超过 5,000 个片段，请移除部分资料。')
    db.prepare('DELETE FROM pages WHERE documents_id=?').run(row.id)
    const insert = db.prepare('INSERT INTO pages(documents_id,page_number,text) VALUES(?,?,?)')
    for (const page of pages) insert.run(row.id, page.number, page.text)
    db.prepare('DELETE FROM chunks WHERE documents_id=?').run(row.id)
    insertChunks(row.id, chunks)
    db.prepare("UPDATE documents SET page_count=?,chunk_count=?,status='pending',error='',updated_at=? WHERE id=?").run(pageCount, chunks.length, new Date().toISOString(), row.id)
  }),
  update: ({ id, patch }) => {
    const row = required(id)
    db.prepare('UPDATE documents SET is_enabled=?,kind=?,updated_at=? WHERE id=?').run(patch.enabled === undefined ? row.is_enabled : Number(patch.enabled), patch.kind ?? row.kind, new Date().toISOString(), row.id)
  },
  mark: ({ id, status, error = '' }) => db.prepare('UPDATE documents SET status=?,error=?,updated_at=? WHERE document_id=?').run(status, error, new Date().toISOString(), id).changes,
  remove: ({ id }) => { const row = required(id); db.prepare('DELETE FROM documents WHERE id=?').run(row.id); return row.source_path },
  commit: ({ id, revision, fingerprint, chunks, vectors }) => transaction(() => {
    const row = raw(id)
    if (!row || row.revision !== revision) return false
    db.prepare('DELETE FROM chunks WHERE documents_id=?').run(row.id)
    insertChunks(row.id, chunks, vectors)
    db.prepare("UPDATE documents SET revision=revision+1,fingerprint=?,status='ready',error='',chunk_count=?,updated_at=? WHERE id=?").run(fingerprint, chunks.length, new Date().toISOString(), row.id)
    return true
  }),
  snapshot: ({ referenceIds }) => {
    const selected = referenceIds === undefined ? null : new Set(referenceIds)
    const rows = db.prepare(`SELECT d.document_id,d.revision,d.name,d.kind,d.fingerprint,c.ordinal,c.text,c.page_start,c.page_end,c.vector
      FROM documents d JOIN chunks c ON c.documents_id=d.id WHERE d.is_enabled=1 AND d.status='ready' AND d.revision>0 ORDER BY d.id,c.ordinal`).all()
      .filter(row => selected === null || selected.has(row.document_id))
    const id = randomUUID()
    snapshots.set(id, rows)
    return { id, count: rows.length, version: [...new Set(rows.map((row) => `${row.document_id}:${row.revision}:${row.kind}`))].join('|'), fingerprints: [...new Set(rows.map((row) => row.fingerprint))] }
  },
  search: ({ id, query, context = '', vector, fingerprint }) => { const rows = snapshots.get(id); if (!rows) throw new Error('检索快照已失效。'); return rank(rows, query, context, vector, fingerprint) },
  releaseSnapshot: ({ id }) => snapshots.delete(id),
  close: () => { snapshots.clear(); db.close() },
}
parentPort.on('message', ({ id, operation, args }) => {
  try {
    if (!Object.hasOwn(handlers, operation)) throw new Error('资料操作无效。')
    parentPort.postMessage({ id, value: handlers[operation](args ?? {}) })
  } catch (error) {
    parentPort.postMessage({ id, error: /^资料|^检索|^文档/.test(error.message) ? error.message : '资料数据库操作失败，请重试。' })
  }
})
parentPort.postMessage({ ready: true })
