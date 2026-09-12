package com.interview.copilot.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("copilot.auth.email")
public record EmailAuthProperties(
        boolean enabled,
        String codeSecret,
        @Min(60) @Max(1800) int codeTtlSeconds,
        @Min(30) @Max(600) int resendSeconds,
        @Min(1) @Max(20) int hourlySendLimit,
        @Min(1) @Max(10) int maximumAttempts,
        @Min(1) @Max(1000) int ipHourlySendLimit,
        @Min(1) @Max(1000) int ipRegistrationLimit) {
    @Override
    public String toString() {
        return "EmailAuthProperties[codeSecret=redacted]";
    }
}
