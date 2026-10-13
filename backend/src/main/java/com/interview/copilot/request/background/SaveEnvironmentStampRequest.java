package com.interview.copilot.request.background;

import com.fasterxml.jackson.databind.JsonNode;

public record SaveEnvironmentStampRequest(long version, String mutationId, JsonNode stamp) {}
