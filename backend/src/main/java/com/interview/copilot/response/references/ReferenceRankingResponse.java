package com.interview.copilot.response.references;

public record ReferenceRankingResponse(Integer bm25Rank, Integer vectorRank, Double bm25Score,
        Double vectorScore, double rrfScore) {}
