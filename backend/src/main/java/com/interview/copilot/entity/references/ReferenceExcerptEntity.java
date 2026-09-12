package com.interview.copilot.entity.references;

public record ReferenceExcerptEntity(
        String source,
        String documentId,
        int revision,
        String name,
        String kind,
        String chunkId,
        String text,
        int pageStart,
        int pageEnd) {}
