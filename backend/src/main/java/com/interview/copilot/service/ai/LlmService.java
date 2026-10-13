package com.interview.copilot.service.ai;

import com.fasterxml.jackson.databind.JsonNode;

public interface LlmService {
    Object execute(long userId, String requestId, JsonNode input);
    default Object execute(long userId, String requestId, JsonNode input, com.interview.copilot.model.operations.OperationContext context) {return execute(userId,requestId,input);}
}
