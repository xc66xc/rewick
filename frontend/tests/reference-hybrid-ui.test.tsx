// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReferenceSources from '../src/renderer/src/components/ReferenceSources'
import ReferenceDocumentRow from '../src/renderer/src/components/ReferenceDocumentRow'
import type { ReferenceDocument, RetrievalContext } from '../src/shared/types'

afterEach(cleanup)
it('shows both recall ranks and RRF without treating the score as correctness', async () => {
  const retrieval: RetrievalContext = { status: 'ready', hybrid: {
    bm25: { status: 'ready', candidateCount: 4, durationMs: 3 }, vector: { status: 'ready', candidateCount: 4, durationMs: 100 },
    fusion: { method: 'rrf', rankConstant: 60, resultCount: 1 },
  }, excerpts: [{ source: 'platform', documentId: 'doc', revision: 1, name: '缓存.md', kind: 'technical', chunkId: 'parent', text: '互斥锁保护热点数据。',
    sectionPath: '缓存 → 缓存击穿', matchedChunkIds: ['one', 'two'], contextExpansion: 'parent', ranking: { bm25Rank: 2, vectorRank: 1, rrfScore: 1 / 62 + 1 / 61 } }] }
  render(<ReferenceSources retrieval={retrieval} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /本次检索资料/ }))
  expect(screen.getByText(/BM25 4\/4 · 向量 4\/4 · RRF 1\/2/)).toBeTruthy()
  expect(screen.getByText(/BM25 名次：2 · 向量名次：1/)).toBeTruthy()
  expect(screen.getByText(/缓存 → 缓存击穿/)).toBeTruthy()
  expect(screen.getByText('互斥锁保护热点数据。')).toBeTruthy()
})
it('distinguishes RRF candidates, pool size and rerank fallback in development diagnostics', async () => {
  const retrieval: RetrievalContext = { status: 'ready', hybrid: {
    bm25: { status: 'ready', candidateCount: 12, durationMs: 3, topK: 20 }, vector: { status: 'ready', candidateCount: 15, durationMs: 100, topK: 20 },
    fusion: { method: 'rrf', rankConstant: 60, candidateCount: 24, selectedCount: 6, topN: 6, resultCount: 2 },
    rerank: { status: 'degraded', model: 'qwen3-rerank', candidateCount: 6, resultCount: 2, topN: 2, durationMs: 1500, reason: 'timeout' },
  }, excerpts: [{ source: 'platform', documentId: 'doc', revision: 1, name: '缓存.md', kind: 'technical', chunkId: 'parent', text: '缓存正文。',
    ranking: { bm25Rank: 12, vectorRank: 15, rrfScore: .02, rerankRank: 40, rerankScore: .15 } }] }
  render(<ReferenceSources retrieval={retrieval} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /本次检索资料/ }))
  expect(screen.getByText(/BM25 12\/20 · 向量 15\/20/)).toBeTruthy()
  expect(screen.getByText('RRF 去重候选：24 · 入池：6/6 · 最终装箱：2')).toBeTruthy()
  expect(screen.getByText(/重排序：已回退 RRF · qwen3-rerank · 输入：6 · 保留数 TopN：2 · 选中：2（装箱前） · 1500 ms · 超时/)).toBeTruthy()
  expect(screen.getByText(/重排序名次：40 · 重排序分数：0.15000/)).toBeTruthy()
})
it('keeps ready documents usable while displaying the rebuild state and parent count', () => {
  const document: ReferenceDocument = { id: 'doc', name: '岗位.docx', kind: 'technical', enabled: true, status: 'ready', contentHash: 'hash', revision: 1,
    createdAt: '', updatedAt: '', chunkCount: 16, contextCount: 7, sectionCount: 4, format: 'docx', headingMode: 'headings', splitterVersion: 1, indexStatus: 'indexing', indexError: '' }
  render(<ReferenceDocumentRow document={document} busy={false} removing={false} onPreview={vi.fn()} onUpdate={vi.fn()} onReindex={vi.fn()} onRemove={vi.fn()} />)
  expect(screen.getByText(/16 个检索片段 · 7 个上下文块 · 标题分片/)).toBeTruthy()
  expect(screen.getByText('正在重建，当前索引仍可用。')).toBeTruthy()
  expect(screen.getByRole('button', { name: /重建索引/ })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: /预览资料/ })).toHaveProperty('disabled', false)
})
it('shows one actionable failure when the document and build carry the same error', () => {
  const document: ReferenceDocument = { id: 'doc', name: '资料.md', kind: 'technical', enabled: true, status: 'error', contentHash: 'hash', revision: 0,
    createdAt: '', updatedAt: '', chunkCount: 0, contextCount: 0, sectionCount: 0, format: '', headingMode: '', splitterVersion: 0, indexStatus: 'error',
    indexError: '向量生成失败：供应商返回 HTTP 401。', error: '向量生成失败：供应商返回 HTTP 401。' }
  render(<ReferenceDocumentRow document={document} busy={false} removing={false} onPreview={vi.fn()} onUpdate={vi.fn()} onReindex={vi.fn()} onRemove={vi.fn()} />)
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert').textContent).toBe(document.indexError)
  expect(screen.getByRole('button', { name: /重建索引/ })).toHaveProperty('disabled', false)
})
