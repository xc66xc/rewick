package com.interview.copilot.model.search;

/** Immutable endpoint owned by one platform configuration snapshot. */
public record WebSearchEndpoint(boolean enabled, String url, String apiKey, int topK,
        String searchDepth, int timeoutMs) {
    @Override
    public String toString() {
        return "WebSearchEndpoint[enabled=" + enabled + ", apiKey=redacted]";
    }
}
