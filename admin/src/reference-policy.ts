import { z } from 'zod'

export const referencePolicySchema = z.object({
  maxFiles: z.number().int().min(1).max(100), maxTotalBytes: z.number().int().min(1048576).max(1073741824), maxChunks: z.number().int().min(1).max(50000),
  childTarget: z.number().int().min(100).max(640), childOverlap: z.number().int().min(0).max(100), parentTarget: z.number().int().min(400).max(1600),
  bm25K1: z.number().min(0.1).max(3), bm25B: z.number().min(0).max(1), vectorMinScore: z.number().min(0).max(1), rrfConstant: z.number().int().min(1).max(1000),
  bm25TimeoutMs: z.number().int().min(30).max(1000), maxTermRows: z.number().int().min(1000).max(2000000), cacheEnabled: z.boolean(), cacheWeightBytes: z.number().int().min(1048576).max(16777216),
  questionVectorMinScore: z.number().min(0).max(1), hybridEnabled: z.boolean(), version: z.number().int().nonnegative(),
  bm25TopK: z.number().int().min(1).max(20).default(4), vectorTopK: z.number().int().min(1).max(20).default(4),
  rrfTopN: z.number().int().min(1).max(40).default(2), rerankTopN: z.number().int().min(1).max(20).default(2),
}).refine(p => p.childOverlap < p.childTarget && p.parentTarget >= p.childTarget, '重叠必须小于子片段目标，父片段不能小于子片段。')
  .refine(p => p.rrfTopN <= p.bm25TopK + p.vectorTopK, 'RRF 保留数不能超过 BM25 与向量召回数之和。')
  .refine(p => p.rerankTopN <= p.rrfTopN, 'rerank 保留数不能超过 RRF 保留数，即使重排序关闭也须满足。')

export type ReferencePolicy = z.infer<typeof referencePolicySchema>
