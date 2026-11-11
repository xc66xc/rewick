package com.interview.copilot.model.rerank;

/** Request-owned credentials; never serialized into retrieval diagnostics. */
public record RerankEndpoint(boolean enabled, String url, String apiKey, String model, int timeoutMs) {
    @Override
    public String toString() {
        return "RerankEndpoint[model=" + model + ", apiKey=redacted]";
    }
}
