package com.interview.copilot.platform;

import java.util.List;

record StoredPlatformConfig(List<Provider> providers, List<PlatformConfig.Model> models,
                            String defaultModelId, PlatformConfig.Asr asr, PlatformConfig.Knowledge knowledge) {
    StoredPlatformConfig {
        providers = List.copyOf(providers);
        models = List.copyOf(models);
    }

    record Provider(String id, String name, String kind, String url, boolean enabled, String encryptedKey) {
        @Override public String toString() { return "StoredProvider[id=" + id + ", encryptedKey=redacted]"; }
    }
}
