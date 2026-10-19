package com.interview.copilot.model.references;

import java.util.List;

public final class ReferenceModels {
    private ReferenceModels() {}
    public record Block(String text, int headingLevel, int paragraph) {}
    public record Section(int ordinal, Integer parentOrdinal, int level, String title,
            String path, String introduction, int paragraphStart, int paragraphEnd,
            Integer qaOrdinal, String questionText) {}
    public record Context(int ordinal, int sectionOrdinal, String text,
            int paragraphStart, int paragraphEnd, boolean split) {}
    public record Chunk(int ordinal, int contextOrdinal, String text,
            int paragraphStart, int paragraphEnd) {}
    public record Parsed(List<Section> sections, List<Context> contexts, List<Chunk> chunks,
            String format, String headingMode) {}
    public record Job(long id, String documentId, long userId, int revision, String token,
            String policyJson) {}
}
