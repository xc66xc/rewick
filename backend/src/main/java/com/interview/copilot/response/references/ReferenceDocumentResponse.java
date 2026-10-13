package com.interview.copilot.response.references;

public record ReferenceDocumentResponse(String id, String name, String kind, boolean enabled, String status, String contentHash, int revision, String createdAt, String updatedAt, String error, int chunkCount, int contextCount, int sectionCount, String format, String headingMode, int splitterVersion, String indexStatus, String indexError) {}
