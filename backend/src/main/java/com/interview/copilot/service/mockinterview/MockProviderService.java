package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;

public interface MockProviderService {
    JsonNode completion(long userId, String modelId, String systemPrompt, JsonNode context, int maxTokens);
}
