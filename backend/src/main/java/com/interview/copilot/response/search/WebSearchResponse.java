package com.interview.copilot.response.search;

import java.util.List;

@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record WebSearchResponse(String status, String message, List<WebExcerptResponse> excerpts) {
    public static WebSearchResponse degraded() {
        return new WebSearchResponse("degraded", "联网检索暂时不可用，本次继续回答。", List.of());
    }
}
