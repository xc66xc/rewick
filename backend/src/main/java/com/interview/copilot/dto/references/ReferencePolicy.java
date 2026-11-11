package com.interview.copilot.dto.references;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;

public record ReferencePolicy(
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
    @org.apache.ibatis.annotations.AutomapConstructor
    public ReferencePolicy {
        bm25TopK = bm25TopK == null ? 4 : bm25TopK;
        vectorTopK = vectorTopK == null ? 4 : vectorTopK;
        rrfTopN = rrfTopN == null ? 2 : rrfTopN;
        rerankTopN = rerankTopN == null ? 2 : rerankTopN;
    }
    public ReferencePolicy(int maxFiles, long maxTotalBytes, int maxChunks, int childTarget,
            int childOverlap, int parentTarget, double bm25K1, double bm25B, double vectorMinScore,
            int rrfConstant, int bm25TimeoutMs, int maxTermRows, boolean cacheEnabled,
            long cacheWeightBytes, long version, boolean hybridEnabled, double questionVectorMinScore) {
        this(maxFiles, maxTotalBytes, maxChunks, childTarget, childOverlap, parentTarget, bm25K1,
                bm25B, vectorMinScore, rrfConstant, bm25TimeoutMs, maxTermRows, cacheEnabled,
                cacheWeightBytes, version, hybridEnabled, questionVectorMinScore, 4, 4, 2, 2);
    }
    public static ReferencePolicy defaults() { return new ReferencePolicy(20, 104857600L, 10000, 600, 100, 1400, 1.2, 0.75, 0.55, 60, 300, 2000000, false, 8388608L, 0, true, 0); }
}
