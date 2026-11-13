package com.interview.copilot.response.references;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReferenceQueryRetrievalResponse(String questionId, String status, String message,
        ReferenceHybridResponse hybrid, List<String> excerptIds) {
    public ReferenceQueryRetrievalResponse { excerptIds = List.copyOf(excerptIds); }
}
