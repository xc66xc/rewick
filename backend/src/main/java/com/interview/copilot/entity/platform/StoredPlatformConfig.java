package com.interview.copilot.entity.platform;

import com.interview.copilot.model.platform.PlatformConfig;

import java.util.List;

public record StoredPlatformConfig(
        List<Provider> providers,
        List<PlatformConfig.Model> models,
        String defaultModelId,
        PlatformConfig.Asr asr,
        PlatformConfig.Knowledge knowledge,
        PlatformConfig.Embedding embedding) {
    public StoredPlatformConfig {
        providers = List.copyOf(providers);
        models = List.copyOf(models);
    }

    public record Provider(
            String id, String name, String kind, String url, boolean enabled, String encryptedKey) {
        @Override
        public String toString() {
            return "StoredProvider[id=" + id + ", encryptedKey=redacted]";
        }
    }
}
