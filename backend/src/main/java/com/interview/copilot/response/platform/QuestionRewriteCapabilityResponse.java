package com.interview.copilot.response.platform;

/** Public capability only; provider credentials and prompts stay on the server. */
public record QuestionRewriteCapabilityResponse(boolean enabled, int timeoutMs) {}
