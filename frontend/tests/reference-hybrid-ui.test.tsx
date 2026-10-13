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
    bm25: { status: 'ready', candidateCount: 5, durationMs: 3 }, vector: { status: 'ready', candidateCount: 5, durationMs: 100 },
    fusion: { method: 'rrf', rankConstant: 60, resultCount: 1 },
  }, excerpts: [{ source: 'platform', documentId: 'doc', revision: 1, name: '缓存.md', kind: 'technical', chunkId: 'parent', text: '互斥锁保护热点数据。',
    sectionPath: '缓存 → 缓存击穿', matchedChunkIds: ['one', 'two'], contextExpansion: 'parent', ranking: { bm25Rank: 2, vectorRank: 1, rrfScore: 1 / 62 + 1 / 61 } }] }
  render(<ReferenceSources retrieval={retrieval} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /本次检索资料/ }))
  expect(screen.getByText(/BM25 5\/5 · 向量 5\/5 · RRF 1\/3/)).toBeTruthy()
  expect(screen.getByText(/BM25 名次：2 · 向量名次：1/)).toBeTruthy()
  expect(screen.getByText(/缓存 → 缓存击穿/)).toBeTruthy()
  expect(screen.getByText('互斥锁保护热点数据。')).toBeTruthy()
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
