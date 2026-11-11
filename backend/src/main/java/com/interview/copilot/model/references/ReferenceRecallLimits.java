package com.interview.copilot.model.references;

/** Shared SQL recall and in-memory ranking limits. */
public final class ReferenceRecallLimits {
    public static boolean isValid(com.interview.copilot.dto.references.ReferencePolicy policy) {
        return policy.bm25TopK() >= 1 && policy.bm25TopK() <= 20
                && policy.vectorTopK() >= 1 && policy.vectorTopK() <= 20
                && policy.rrfTopN() >= 1 && policy.rrfTopN() <= 40
                && policy.rerankTopN() >= 1 && policy.rerankTopN() <= 20
                && policy.rerankTopN() <= policy.rrfTopN()
                && policy.rrfTopN() <= policy.bm25TopK() + policy.vectorTopK();
    }

    private ReferenceRecallLimits() {}
}
