package com.interview.copilot.service.mockinterview;

public interface MockOrchestrationService {
 com.fasterxml.jackson.databind.JsonNode plan(long user,com.fasterxml.jackson.databind.JsonNode snapshot,com.fasterxml.jackson.databind.JsonNode config);
 void decide(long user,String session,int generation);
 void reports();
 void cancel(String sessionId);
}
