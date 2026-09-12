package com.interview.copilot.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("copilot.limits")
public record PlatformLimitsProperties(@Min(1) @Max(14400) int maxAsrSessionSeconds) {}
