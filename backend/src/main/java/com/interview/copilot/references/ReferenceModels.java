package com.interview.copilot.references;

import java.util.List;

public final class ReferenceModels {
    private ReferenceModels() { }
    public record Document(String id, String name, String kind, boolean enabled, String status, int pageCount,
            String contentHash, int revision, String createdAt, String updatedAt, String error, int chunkCount) { }
    public record Preview(Document document, String text) { }
    public record Excerpt(String source, String documentId, int revision, String name, String kind,
            String chunkId, String text, int pageStart, int pageEnd) { }
    public record Retrieval(String status, String message, List<Excerpt> excerpts) { }
    public record Chunk(int ordinal, String text, int pageStart, int pageEnd) { }
    public record Parsed(List<Chunk> chunks, int pageCount) { }
    public record Job(long id, String documentId, long userId, int revision, String token) { }
}
