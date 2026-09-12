package com.interview.copilot.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record SmtpProperties(
        String host,
        @Min(1) @Max(65535) int port,
        String username,
        String password,
        String from,
        boolean starttls,
        boolean ssl,
        @Min(1000) @Max(15000) int timeoutMillis) {
    @Override
    public String toString() {
        return "SmtpProperties[credentials=redacted]";
    }
}
