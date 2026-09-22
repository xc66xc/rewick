package com.interview.copilot.service.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.response.wallet.WalletResponse;

import java.util.List;

public interface BackgroundService {
    List<String> asrHotwords(long user, String sessionId);

    JsonNode library(long user);

    JsonNode detail(long user, BackgroundKind kind, String id);

    JsonNode save(
            long user,
            BackgroundKind kind,
            String id,
            long version,
            String mutation,
            JsonNode content);

    void delete(long user, BackgroundKind kind, String id);

    void activate(long user, String id);

    WalletResponse start(long user, String requestId, String environmentId);
}
