package com.interview.copilot.request.history;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SaveRecordRequest(
        @Min(0) long version, @NotNull UUID mutationId, @NotNull JsonNode record) {}
