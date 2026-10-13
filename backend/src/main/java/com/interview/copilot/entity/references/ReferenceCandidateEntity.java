package com.interview.copilot.entity.references;

public record ReferenceCandidateEntity(String documentId, int revision, long chunkId, long contextId, int ordinal, String text, double score) {}
