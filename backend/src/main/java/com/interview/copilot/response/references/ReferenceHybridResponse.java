package com.interview.copilot.response.references;

public record ReferenceHybridResponse(Branch bm25, Branch vector, Fusion fusion, Rerank rerank) {
    public ReferenceHybridResponse(Branch bm25, Branch vector, Fusion fusion) { this(bm25, vector, fusion, null); }
    public record Branch(String status, int candidateCount, double durationMs, Integer topK) {
        public Branch(String status, int candidateCount, double durationMs) { this(status, candidateCount, durationMs, null); }
    }
    public record Fusion(String method, int rankConstant, int resultCount,
            Integer candidateCount, Integer selectedCount, Integer topN) {
        public Fusion(String method, int rankConstant, int resultCount) { this(method, rankConstant, resultCount, null, null, null); }
    }
    public record Rerank(String status, String model, int candidateCount, int resultCount,
            int topN, double durationMs, String reason) {}
}
