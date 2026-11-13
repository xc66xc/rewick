package com.interview.copilot.response.references;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Scores belong to individual queries, not to a cross-query aggregate. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReferenceBatchExcerptResponse(String source, String documentId, int revision, String name,
        String kind, String chunkId, String text, int paragraphStart, int paragraphEnd, String sectionPath,
        List<String> matchedChunkIds, String contextExpansion, String excerptId, List<String> questionIds) {
    public ReferenceBatchExcerptResponse {
        matchedChunkIds = List.copyOf(matchedChunkIds);
        questionIds = List.copyOf(questionIds);
    }
}
