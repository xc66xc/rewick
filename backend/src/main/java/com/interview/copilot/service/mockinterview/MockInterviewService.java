package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

public interface MockInterviewService {
    JsonNode create(long userId, JsonNode input);
    JsonNode list(long userId);
    JsonNode get(long userId, UUID id);
    JsonNode command(long userId, UUID id, JsonNode input);
    void pause(long userId, UUID id, String reason);
    JsonNode report(long userId, UUID id);
    JsonNode retryReport(long userId, UUID id, JsonNode input);
    JsonNode remove(long userId, UUID id);
    JsonNode runtime(long userId, UUID id);
    void expire();
    boolean reserveSpeech(long userId, UUID id, int generation, int characters);
}
