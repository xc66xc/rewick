package com.interview.copilot.entity.platform;

import com.interview.copilot.model.platform.PlatformConfig;

import java.util.List;

public record StoredPlatformConfig(
        List<Provider> providers,
        List<PlatformConfig.Model> models,
        String defaultModelId,
        PlatformConfig.Asr asr,
        PlatformConfig.Embedding embedding,
        PlatformConfig.WebSearch webSearch) {
    public StoredPlatformConfig {
        providers = List.copyOf(providers);
        models = List.copyOf(models);
    }

    public record Provider(
            String id, String name, String kind, String url, boolean enabled, String encryptedKey, String searchProtocol) {
        public Provider(String id, String name, String kind, String url, boolean enabled, String encryptedKey) {
            this(id, name, kind, url, enabled, encryptedKey, "tavily");
        }

        public Provider {
            if (searchProtocol == null) searchProtocol = "tavily";
        }
        @Override
        public String toString() {
            return "StoredProvider[id=" + id + ", encryptedKey=redacted]";
        }
    }
}
