package com.interview.copilot.service.asr;

import com.fasterxml.jackson.databind.JsonNode;

public interface AsrSessionService {
    JsonNode withHotwords(long user, String sessionId, String model, JsonNode frame);
    int maximumSeconds(int configuredMaximum);
}
