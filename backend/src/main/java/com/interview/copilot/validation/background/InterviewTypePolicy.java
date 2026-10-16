package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Set;

/** Shared whitelist for preparation inputs and optional historical snapshots. */
public final class InterviewTypePolicy {
    private static final Set<String> TYPES = Set.of("technical", "general", "hr");

    private InterviewTypePolicy() {}

    /** Returns whether an explicitly supplied type is supported. */
    public static boolean isValid(JsonNode value) {
        return value != null && value.isTextual() && TYPES.contains(value.asText());
    }
}
