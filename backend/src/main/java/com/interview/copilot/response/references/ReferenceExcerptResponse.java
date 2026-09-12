package com.interview.copilot.response.references;

public record ReferenceExcerptResponse(
        String source,
        String documentId,
        int revision,
        String name,
        String kind,
        String chunkId,
        String text,
        int pageStart,
        int pageEnd) {}
