package com.interview.copilot.model.references;

import java.util.List;

public final class ReferenceModels {
    private ReferenceModels() {}

    public record Chunk(int ordinal, String text, int pageStart, int pageEnd) {}

    public record Parsed(List<Chunk> chunks, int pageCount) {}

    public record Job(long id, String documentId, long userId, int revision, String token) {}
}
