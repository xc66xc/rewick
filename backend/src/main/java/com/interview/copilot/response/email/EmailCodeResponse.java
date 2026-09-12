package com.interview.copilot.response.email;

public record EmailCodeResponse(int retryAfterSeconds, int expiresInSeconds) {}
