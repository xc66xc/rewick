package com.interview.copilot.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(min = 3, max = 254) String identifier,
        @NotBlank @Size(max = 128) String password) {
    @Override
    public String toString() {
        return "LoginRequest[password=redacted]";
    }
}
