package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;

public interface MockWalletService {
    JsonNode state(long userId);
    JsonNode ledger(long userId, Long cursor);
    JsonNode adjust(long actor, long userId, JsonNode input);
}
