package com.interview.copilot.response.auth;

import java.time.Instant;

public record LoginResponse(String accessToken, Instant expiresAt, PublicUserResponse user) {
    @Override
    public String toString() {
        return "LoginResponse[accessToken=redacted]";
    }
}
