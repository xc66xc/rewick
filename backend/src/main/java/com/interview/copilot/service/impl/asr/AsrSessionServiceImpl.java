package com.interview.copilot.service.impl.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.service.asr.AsrSessionService;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.util.asr.AsrEndpoint;
import com.interview.copilot.validation.background.HotwordPolicy;
import org.springframework.stereotype.Service;

@Service
public class AsrSessionServiceImpl implements AsrSessionService {
    private final BackgroundService backgrounds;
    private final PlatformLimitsProperties limits;

    public AsrSessionServiceImpl(BackgroundService backgrounds, PlatformLimitsProperties limits) {
        this.backgrounds = backgrounds;
        this.limits = limits;
    }

    public JsonNode withHotwords(long user, String sessionId, String model, JsonNode frame) {
        // Explicit vocabularies override saved terms, keeping controlled comparison requests intact.
        if (!AsrEndpoint.QWEN_STREAMING.equals(model)
                || frame.path("payload").path("parameters").has("vocabulary")) return frame;
        var words = backgrounds.asrHotwords(user, sessionId);
        if (words.isEmpty()) return frame;
        ObjectNode result = frame.deepCopy();
        ObjectNode parameters = (ObjectNode) result.path("payload").path("parameters");
        parameters.set("vocabulary", HotwordPolicy.vocabulary(words));
        return result;
    }

    public int maximumSeconds(int configuredMaximum) {
        return Math.min(configuredMaximum, limits.maxAsrSessionSeconds());
    }
}
