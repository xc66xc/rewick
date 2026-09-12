package com.interview.copilot.response.platform;

public record PlatformProbeResponse(boolean success, String message, long latencyMs) {}
