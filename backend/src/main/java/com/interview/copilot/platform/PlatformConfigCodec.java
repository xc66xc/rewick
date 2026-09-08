package com.interview.copilot.platform;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public final class PlatformConfigCodec {
    private final ObjectMapper mapper;
    private final PlatformSecretCipher secrets;

    public PlatformConfigCodec(ObjectMapper mapper, PlatformSecretCipher secrets) {
        this.mapper = mapper;
        this.secrets = secrets;
    }

    String encode(PlatformSnapshot snapshot) {
        PlatformConfig config = snapshot.view();
        List<StoredPlatformConfig.Provider> providers = config.providers().stream().map(provider -> {
            String key = snapshot.key(provider.id());
            return new StoredPlatformConfig.Provider(provider.id(), provider.name(), provider.kind(), provider.url(),
                    provider.enabled(), key.isEmpty() ? "" : secrets.encrypt(provider.id(), key));
        }).toList();
        try {
            return mapper.writeValueAsString(new StoredPlatformConfig(providers, config.models(), config.defaultModelId(),
                    config.asr(), config.knowledge()));
        } catch (JsonProcessingException error) { throw PlatformConfigErrors.storageUnavailable(); }
    }

    PlatformConfig view(PlatformConfigMapper.Row row) {
        StoredPlatformConfig config = decode(row.payload());
        List<PlatformConfig.Provider> providers = config.providers().stream().map(provider -> new PlatformConfig.Provider(
                provider.id(), provider.name(), provider.kind(), provider.url(), provider.enabled(),
                !provider.encryptedKey().isEmpty(), null)).toList();
        return new PlatformConfig(row.version(), providers, config.models(), config.defaultModelId(), config.asr(), config.knowledge());
    }

    PlatformSnapshot snapshot(PlatformConfigMapper.Row row, PlatformPolicy policy) {
        StoredPlatformConfig config = decode(row.payload());
        Map<String, String> keys = new HashMap<>();
        config.providers().forEach(provider -> keys.put(provider.id(), secrets.decrypt(provider.id(), provider.encryptedKey())));
        return new PlatformSnapshot(view(row), keys, policy);
    }

    private StoredPlatformConfig decode(String payload) {
        try { return mapper.readValue(payload, StoredPlatformConfig.class); }
        catch (JsonProcessingException error) { throw PlatformConfigErrors.storageUnavailable(); }
    }
}
