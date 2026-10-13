package com.interview.copilot.response.references;

import java.util.List;
public record ReferenceExcerptResponse(String source, String documentId, int revision, String name,
        String kind, String chunkId, String text, int paragraphStart, int paragraphEnd,
        String sectionPath, List<String> matchedChunkIds, String contextExpansion, ReferenceRankingResponse ranking) {}
