package com.interview.copilot.service.knowledge;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

public interface KnowledgeService {
    Map<String, Object> search(long userId, String requestId, JsonNode input);
    default Map<String,Object> search(long userId,String requestId,JsonNode input,com.interview.copilot.model.operations.OperationContext context) {return search(userId,requestId,input);}
}
