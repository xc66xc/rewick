package com.interview.copilot.service.ai;

import com.fasterxml.jackson.databind.JsonNode;

public interface LlmService {
    Object execute(long userId, String requestId, JsonNode input);
}
