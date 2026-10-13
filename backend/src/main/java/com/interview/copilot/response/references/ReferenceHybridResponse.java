package com.interview.copilot.response.references;

public record ReferenceHybridResponse(Branch bm25, Branch vector, Fusion fusion) {
    public record Branch(String status, int candidateCount, double durationMs) {}
    public record Fusion(String method, int rankConstant, int resultCount) {}
}
