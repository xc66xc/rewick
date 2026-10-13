package com.interview.copilot.service.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationsSettings;
import java.util.Map;

public interface OperationsService {
    boolean enabled(long user);
    Map<String,Object> ingest(long user, JsonNode input);
    OperationsSettings settings();
    OperationsSettings save(long actor, OperationsSettings input);
    OperationsSettings saveInput(long actor, JsonNode input);
    Map<String,Object> overview(int hours);
    Map<String,Object> performance(int hours);
    Map<String,Object> traces(int hours, Long userId, String sessionId, String model, String appVersion, int page, int size);
    Map<String,Object> detail(String operationId, long userId);
    Map<String,Object> health();
    OperationContext start(long user, String operation, String parent, String requestId, String sessionId, String provider, String model);
    void finish(OperationContext context, String stage, String outcome, Map<String,Object> metadata);
    void point(OperationContext context, String stage, Map<String,Object> metadata);
}
