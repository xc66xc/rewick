package com.interview.copilot.service.impl.platform;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.converter.platform.PlatformConfigCodec;
import com.interview.copilot.entity.platform.PlatformConfigRow;
import com.interview.copilot.exception.platform.PlatformConfigErrors;
import com.interview.copilot.mapper.platform.PlatformConfigMapper;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.platform.PlatformConfigService;
import com.interview.copilot.validation.platform.PlatformConfigValidator;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PlatformConfigServiceImpl implements PlatformConfigService {
    private final PlatformConfigMapper mapper;
    private final PlatformConfigCodec codec;
    private final PlatformConfigValidator validator;
    private final ProviderProperties properties;
    private final AuditService audit;

    public PlatformConfigServiceImpl(
            PlatformConfigMapper mapper,
            PlatformConfigCodec codec,
            PlatformConfigValidator validator,
            ProviderProperties properties,
            AuditService audit) {
        this.mapper = mapper;
        this.codec = codec;
        this.validator = validator;
        this.properties = properties;
        this.audit = audit;
    }

    public PlatformConfig get() {
        PlatformConfigRow row = row();
        return row.published() ? codec.view(row) : empty(row.version()).view();
    }

    @Override
    public PlatformSnapshot snapshot() {
        PlatformConfigRow row = row();
        return row.published()
                ? codec.snapshot(row, PlatformPolicy.from(properties))
                : empty(row.version());
    }

    @Transactional
    public PlatformConfig publish(long actorId, PlatformConfig input) {
        mapper.lock();
        PlatformSnapshot prepared = draft(input);
        com.interview.copilot.validation.platform.DesktopDefaultsValidator.validate(
                mapper.desktopDefaults(), prepared);
        if (mapper.publish(input.version(), codec.encode(prepared)) != 1) {
            throw PlatformConfigErrors.conflict();
        }
        audit.record(actorId, "platform.config.publish", "version:" + (input.version() + 1));
        PlatformConfig view = prepared.view();
        return new PlatformConfig(
                input.version() + 1,
                view.providers(),
                view.models(),
                view.defaultModelId(),
                view.asr(),
                view.knowledge(),
                view.embedding());
    }

    public PlatformSnapshot draft(PlatformConfig input) {
        PlatformConfigRow row = row();
        if (input == null) {
            throw PlatformConfigErrors.invalid("请提供完整平台配置。");
        }
        if (input.version() != row.version()) {
            throw PlatformConfigErrors.conflict();
        }
        PlatformSnapshot previous =
                row.published()
                        ? codec.snapshot(row, PlatformPolicy.from(properties))
                        : empty(row.version());
        validator.validate(input, previous.view());
        Map<String, String> keys = new HashMap<>();
        for (PlatformConfig.Provider provider : input.providers()) {
            String key = resolveKey(provider, previous);
            if (provider.enabled() && key.isEmpty() && !localEmbedding(provider)) {
                throw PlatformConfigErrors.invalid("启用提供商前请填写 API Key。");
            }
            keys.put(provider.id(), key);
        }
        return new PlatformSnapshot(input, keys, PlatformPolicy.from(properties));
    }

    private boolean localEmbedding(PlatformConfig.Provider provider) {
        if (!"embedding".equals(provider.kind())) {
            return false;
        }
        var endpoint = new ProviderProperties.Embedding();
        endpoint.setUrl(provider.url());
        return endpoint.isLocalWithoutKey();
    }

    private String resolveKey(PlatformConfig.Provider provider, PlatformSnapshot previous) {
        if (provider.apiKey() == null || provider.apiKey().isBlank()) {
            return previous.key(provider.id());
        }
        return provider.apiKey().trim();
    }

    private PlatformSnapshot empty(long version) {
        PlatformConfig config =
                new PlatformConfig(
                        version,
                        List.of(),
                        List.of(),
                        "",
                        new PlatformConfig.Asr(false, "", ""),
                        new PlatformConfig.Knowledge(false, "", ""));
        return new PlatformSnapshot(config, Map.of(), PlatformPolicy.from(properties));
    }

    private PlatformConfigRow row() {
        PlatformConfigRow row = mapper.read();
        if (row == null) {
            throw PlatformConfigErrors.storageUnavailable();
        }
        return row;
    }
}
