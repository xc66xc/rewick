package com.interview.copilot.request.background;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record SaveBackgroundRequest(
        @Min(0) long version,
        @NotNull @Pattern(regexp = "[0-9a-fA-F-]{36}") String mutationId,
        @NotNull JsonNode content) {}
