package com.interview.copilot.entity.references;

public record ReferenceContextEntity(String documentId, int revision, long contextId, String text, String sectionPath, String introduction, int paragraphStart, int paragraphEnd, boolean split) {}
