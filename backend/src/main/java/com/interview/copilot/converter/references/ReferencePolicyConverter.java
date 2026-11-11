package com.interview.copilot.converter.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.request.references.ReferencePolicyRequest;
import com.interview.copilot.response.references.ReferencePolicyResponse;

public final class ReferencePolicyConverter {
    private ReferencePolicyConverter() {}
    public static ReferencePolicy fromRequest(ReferencePolicyRequest value, ReferencePolicy current) {
        return new ReferencePolicy(value.maxFiles(), value.maxTotalBytes(), value.maxChunks(), value.childTarget(), value.childOverlap(), value.parentTarget(), value.bm25K1(), value.bm25B(), value.vectorMinScore(), value.rrfConstant(), value.bm25TimeoutMs(), value.maxTermRows(), value.cacheEnabled(), value.cacheWeightBytes(), value.version(), value.hybridEnabled(), value.questionVectorMinScore(),
                value.bm25TopK() == null ? current.bm25TopK() : value.bm25TopK(),
                value.vectorTopK() == null ? current.vectorTopK() : value.vectorTopK(),
                value.rrfTopN() == null ? current.rrfTopN() : value.rrfTopN(),
                value.rerankTopN() == null ? current.rerankTopN() : value.rerankTopN());
    }
    public static ReferencePolicyResponse toResponse(ReferencePolicy value) {
        return new ReferencePolicyResponse(value.maxFiles(), value.maxTotalBytes(), value.maxChunks(), value.childTarget(), value.childOverlap(), value.parentTarget(), value.bm25K1(), value.bm25B(), value.vectorMinScore(), value.rrfConstant(), value.bm25TimeoutMs(), value.maxTermRows(), value.cacheEnabled(), value.cacheWeightBytes(), value.version(), value.hybridEnabled(), value.questionVectorMinScore(), value.bm25TopK(), value.vectorTopK(), value.rrfTopN(), value.rerankTopN());
    }
}
