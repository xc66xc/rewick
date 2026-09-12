package com.interview.copilot.response.references;

import java.util.List;

public record ReferenceRetrievalResponse(
        String status, String message, List<ReferenceExcerptResponse> excerpts) {}
