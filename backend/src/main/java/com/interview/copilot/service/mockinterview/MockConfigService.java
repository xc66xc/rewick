package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;

public interface MockConfigService {
    JsonNode get();
    JsonNode save(long actor, JsonNode input);
    JsonNode runtime();
    JsonNode capabilities(long userId);
    JsonNode test(JsonNode input);
}
