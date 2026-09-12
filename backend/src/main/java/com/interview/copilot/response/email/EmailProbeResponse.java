package com.interview.copilot.response.email;

public record EmailProbeResponse(boolean success, String message, long latencyMs) {}
