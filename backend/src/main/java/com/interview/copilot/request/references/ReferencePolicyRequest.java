package com.interview.copilot.request.references;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;

public record ReferencePolicyRequest(
        @Min(1) @Max(100) int maxFiles,
        @Min(1048576) @Max(1073741824) long maxTotalBytes,
        @Min(1) @Max(50000) int maxChunks,
        @Min(100) @Max(640) int childTarget,
        @Min(0) @Max(100) int childOverlap,
        @Min(400) @Max(1600) int parentTarget,
        @DecimalMin("0.1") @DecimalMax("3") double bm25K1,
        @DecimalMin("0") @DecimalMax("1") double bm25B,
        @DecimalMin("0") @DecimalMax("1") double vectorMinScore,
        @Min(1) @Max(1000) int rrfConstant,
        @Min(30) @Max(1000) int bm25TimeoutMs,
        @Min(1000) @Max(2000000) int maxTermRows,
        boolean cacheEnabled,
        @Min(1048576) @Max(16777216) long cacheWeightBytes,
        @Min(0) long version, boolean hybridEnabled,
        @DecimalMin("0") @DecimalMax("1") double questionVectorMinScore,
        @Min(1) @Max(20) Integer bm25TopK,
        @Min(1) @Max(20) Integer vectorTopK,
        @Min(1) @Max(40) Integer rrfTopN,
        @Min(1) @Max(20) Integer rerankTopN) {
    @jakarta.validation.constraints.AssertTrue(message = "重叠必须小于子片段目标长度，父片段目标不能小于子片段。")
    public boolean isLengthsValid() { return childOverlap < childTarget && parentTarget >= childTarget; }
    @jakarta.validation.constraints.AssertTrue(message = "rerank 数量不能超过 RRF 数量，RRF 数量不能超过两路召回数量之和。")
    public boolean isRecallLimitsValid() {
        if (bm25TopK == null || vectorTopK == null || rrfTopN == null || rerankTopN == null) return true;
        return rerankTopN <= rrfTopN && rrfTopN <= bm25TopK + vectorTopK;
    }
}
