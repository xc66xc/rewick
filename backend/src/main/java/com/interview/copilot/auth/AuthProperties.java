package com.interview.copilot.auth;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("copilot.auth")
public record AuthProperties(
        @Min(1) @Max(720) int tokenHours,
        @Min(1) @Max(1000) int loginBurst,
        @Min(1) @Max(3600) int loginWindowSeconds,
        String bootstrapUsername,
        String bootstrapPassword) {
    @Override
    public String toString() { return "AuthProperties[credentials=redacted]"; }
}
