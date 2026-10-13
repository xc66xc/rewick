package com.interview.copilot.model.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import java.util.List;

public final class ReferenceRecall {
    private ReferenceRecall() {}
    public record Branch(String status, List<ReferenceCandidateEntity> candidates, double durationMs) {}
    public record Pair(Branch bm25, Branch vector) {}
    public record Fused(String documentId, int revision, long contextId, int ordinal,
            Integer bm25Rank, Integer vectorRank, Double bm25Score, Double vectorScore,
            double rrfScore, List<ReferenceCandidateEntity> matches) {}
}
