package com.interview.copilot.entity.references;

public record ReferenceDocumentEntity(
        String id,
        String name,
        String kind,
        boolean enabled,
        String status,
        int pageCount,
        String contentHash,
        int revision,
        String createdAt,
        String updatedAt,
        String error,
        int chunkCount) {}
