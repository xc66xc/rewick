package com.interview.copilot.service.background;

import com.fasterxml.jackson.databind.JsonNode;

public interface EnvironmentStampService {
    JsonNode save(long user, String id, long version, String mutationId, JsonNode stamp);
}
