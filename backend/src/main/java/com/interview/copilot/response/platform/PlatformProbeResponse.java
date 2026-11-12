package com.interview.copilot.response.platform;

public record PlatformProbeResponse(boolean success, String message, long latencyMs,
        QuestionRewriteProbeResponse questionRewrite) {
    public PlatformProbeResponse(boolean success, String message, long latencyMs) {
        this(success, message, latencyMs, null);
    }
}
