package com.interview.copilot.response.references;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReferenceBatchRetrievalResponse(String status, String message,
        List<ReferenceBatchExcerptResponse> excerpts, List<ReferenceQueryRetrievalResponse> queries,
        Long policyVersion, Long platformVersion) {
    public ReferenceBatchRetrievalResponse {
        excerpts = List.copyOf(excerpts);
        queries = List.copyOf(queries);
    }
}
