package com.interview.copilot.model.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import java.util.List;

public final class ReferenceRecall {
    private ReferenceRecall() {}
    public record Branch(String status, List<ReferenceCandidateEntity> candidates, double durationMs) {}
    public record Pair(Branch bm25, Branch vector) {}
    public record Fused(String documentId, int revision, long contextId, int ordinal,
            Integer bm25Rank, Integer vectorRank, Double bm25Score, Double vectorScore,
            double rrfScore, List<ReferenceCandidateEntity> matches, Integer rerankRank, Double rerankScore) {
        public Fused(String documentId, int revision, long contextId, int ordinal,
                Integer bm25Rank, Integer vectorRank, Double bm25Score, Double vectorScore,
                double rrfScore, List<ReferenceCandidateEntity> matches) {
            this(documentId, revision, contextId, ordinal, bm25Rank, vectorRank, bm25Score,
                    vectorScore, rrfScore, matches, null, null);
        }
        public Fused withRerank(int rank, double score) {
            return new Fused(documentId, revision, contextId, ordinal, bm25Rank, vectorRank,
                    bm25Score, vectorScore, rrfScore, matches, rank, score);
        }
    }
}
