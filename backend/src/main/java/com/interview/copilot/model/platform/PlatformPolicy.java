package com.interview.copilot.model.platform;

import com.interview.copilot.config.ProviderProperties;

public record PlatformPolicy(
        int concurrentLlm,
        int llmIdleSeconds,
        int llmTotalSeconds,
        int knowledgeSeconds,
        int asrSeconds) {
    public static PlatformPolicy from(ProviderProperties properties) {
        return new PlatformPolicy(
                properties.getLlm().getMaxConcurrent(),
                properties.getLlm().getIdleTimeoutSeconds(),
                properties.getLlm().getTotalTimeoutSeconds(),
                properties.getKnowledge().getTimeoutSeconds(),
                properties.getAsr().getMaxDurationSeconds());
    }
}
