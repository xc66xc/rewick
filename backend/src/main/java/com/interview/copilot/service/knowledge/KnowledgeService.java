package com.interview.copilot.service.knowledge;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

public interface KnowledgeService {
    Map<String, Object> search(long userId, String requestId, JsonNode input);
}
