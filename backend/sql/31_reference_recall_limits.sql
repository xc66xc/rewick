BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE reference_policy
    ADD COLUMN IF NOT EXISTS bm25_top_k INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS vector_top_k INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS rrf_top_n INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS rerank_top_n INTEGER NOT NULL DEFAULT 2;

ALTER TABLE reference_policy DROP CONSTRAINT IF EXISTS reference_recall_limits_valid;
ALTER TABLE reference_policy ADD CONSTRAINT reference_recall_limits_valid CHECK (
    bm25_top_k BETWEEN 1 AND 20 AND vector_top_k BETWEEN 1 AND 20
    AND rrf_top_n BETWEEN 1 AND 40 AND rerank_top_n BETWEEN 1 AND 20
    AND rerank_top_n <= rrf_top_n AND rrf_top_n <= bm25_top_k + vector_top_k
);
COMMIT;
