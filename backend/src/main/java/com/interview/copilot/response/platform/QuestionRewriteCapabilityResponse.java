package com.interview.copilot.response.platform;

/** Public capability only; provider credentials and prompts stay on the server. */
public record QuestionRewriteCapabilityResponse(boolean enabled, int timeoutMs,
        java.util.List<String> resultFormats, boolean batchReferencesAvailable) {
    public QuestionRewriteCapabilityResponse(boolean enabled, int timeoutMs) {
        this(enabled, timeoutMs, java.util.List.of("single", "questions-v1"), true);
    }
}
