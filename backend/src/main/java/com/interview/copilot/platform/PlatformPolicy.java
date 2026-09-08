package com.interview.copilot.platform;

import com.interview.copilot.ai.ProviderProperties;

record PlatformPolicy(int concurrentLlm, int llmIdleSeconds, int llmTotalSeconds,
                      int knowledgeSeconds, int asrSeconds) {
    static PlatformPolicy from(ProviderProperties properties) {
        return new PlatformPolicy(properties.getLlm().getMaxConcurrent(), properties.getLlm().getIdleTimeoutSeconds(),
                properties.getLlm().getTotalTimeoutSeconds(), properties.getKnowledge().getTimeoutSeconds(),
                properties.getAsr().getMaxDurationSeconds());
    }
}
