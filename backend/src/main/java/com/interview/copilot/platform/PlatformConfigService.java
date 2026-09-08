package com.interview.copilot.platform;

import com.interview.copilot.admin.audit.AuditService;
import com.interview.copilot.ai.ProviderProperties;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlatformConfigService implements PlatformRuntimeResolver {
    private final PlatformConfigMapper mapper;
    private final PlatformConfigCodec codec;
    private final PlatformConfigValidator validator;
    private final ProviderProperties properties;
    private final AuditService audit;

    public PlatformConfigService(PlatformConfigMapper mapper, PlatformConfigCodec codec, PlatformConfigValidator validator,
                                 ProviderProperties properties, AuditService audit) {
        this.mapper = mapper;
        this.codec = codec;
        this.validator = validator;
        this.properties = properties;
        this.audit = audit;
    }

    public PlatformConfig get() {
        PlatformConfigMapper.Row row = row();
        return row.published() ? codec.view(row) : environment().view();
    }

    @Override public PlatformSnapshot snapshot() {
        PlatformConfigMapper.Row row = row();
        return row.published() ? codec.snapshot(row, PlatformPolicy.from(properties)) : environment();
    }

    @Transactional
    public PlatformConfig publish(long actorId, PlatformConfig input) {
        PlatformSnapshot prepared = draft(input);
        if (mapper.publish(input.version(), codec.encode(prepared)) != 1) { throw PlatformConfigErrors.conflict(); }
        audit.record(actorId, "platform.config.publish", "version:" + (input.version() + 1));
        PlatformConfig view = prepared.view();
        return new PlatformConfig(input.version() + 1, view.providers(), view.models(), view.defaultModelId(), view.asr(), view.knowledge());
    }

    public PlatformSnapshot draft(PlatformConfig input) {
        PlatformConfigMapper.Row row = row();
        if (input == null) { throw PlatformConfigErrors.invalid("请提供完整平台配置。"); }
        if (input.version() != row.version()) { throw PlatformConfigErrors.conflict(); }
        PlatformSnapshot previous = row.published() ? codec.snapshot(row, PlatformPolicy.from(properties)) : environment();
        validator.validate(input, previous.view());
        Map<String, String> keys = new HashMap<>();
        for (PlatformConfig.Provider provider : input.providers()) {
            String key = resolveKey(provider, previous);
            if (provider.enabled() && key.isEmpty()) { throw PlatformConfigErrors.invalid("启用提供商前请填写 API Key。"); }
            keys.put(provider.id(), key);
        }
        return new PlatformSnapshot(input, keys, PlatformPolicy.from(properties));
    }

    private String resolveKey(PlatformConfig.Provider provider, PlatformSnapshot previous) {
        if (provider.apiKey() == null || provider.apiKey().isBlank()) { return previous.key(provider.id()); }
        return provider.apiKey().trim();
    }

    private PlatformSnapshot environment() { return new EnvironmentPlatformResolver(properties).snapshot(); }
    private PlatformConfigMapper.Row row() {
        PlatformConfigMapper.Row row = mapper.read();
        if (row == null) { throw PlatformConfigErrors.storageUnavailable(); }
        return row;
    }
}
