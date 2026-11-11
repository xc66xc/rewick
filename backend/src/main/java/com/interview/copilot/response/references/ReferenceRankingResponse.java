package com.interview.copilot.response.references;

public record ReferenceRankingResponse(Integer bm25Rank, Integer vectorRank, Double bm25Score,
        Double vectorScore, double rrfScore, Integer rerankRank, Double rerankScore) {
    public ReferenceRankingResponse(Integer bm25Rank, Integer vectorRank, Double bm25Score,
            Double vectorScore, double rrfScore) { this(bm25Rank, vectorRank, bm25Score, vectorScore, rrfScore, null, null); }
}
