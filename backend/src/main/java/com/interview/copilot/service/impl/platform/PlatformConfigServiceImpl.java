package com.interview.copilot.service.impl.platform;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.converter.platform.PlatformConfigCodec;
import com.interview.copilot.entity.platform.PlatformConfigRow;
import com.interview.copilot.entity.platform.DesktopSettingsEntity;
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

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 原子发布平台服务并同步被替换的桌面默认语音服务。
 */
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
        PlatformConfig previous = get();
        PlatformSnapshot prepared = draft(input);
        DesktopSettingsEntity defaults = mapper.desktopDefaults();
        DesktopSettingsEntity nextDefaults = replacedAsrDefault(previous, prepared, defaults);
        com.interview.copilot.validation.platform.DesktopDefaultsValidator.validate(
                nextDefaults, prepared);
        if (mapper.publish(input.version(), codec.encode(prepared)) != 1) {
            throw PlatformConfigErrors.conflict();
        }
        if (nextDefaults != defaults) {
            if (mapper.replaceDefaultAsr(defaults.version(), nextDefaults.asrServiceId()) != 1) {
                throw PlatformConfigErrors.conflict();
            }
            audit.record(actorId, "desktop.defaults.update", "version:" + (defaults.version() + 1));
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
                view.embedding(), view.webSearch());
    }

    private DesktopSettingsEntity replacedAsrDefault(
            PlatformConfig previous, PlatformSnapshot prepared, DesktopSettingsEntity defaults) {
        String oldId = previous.asr().providerId();
        String newId = prepared.view().asr().providerId();
        boolean replacement = !oldId.isEmpty() && !oldId.equals(newId)
                && oldId.equals(defaults.asrServiceId())
                && prepared.availableAsrServices().stream().anyMatch(item -> item.id().equals(newId));
        if (!replacement) {
            return defaults;
        }
        return new DesktopSettingsEntity(
                defaults.version(), defaults.llmModelId(), defaults.temperature(), newId,
                defaults.retrievalMode(), defaults.knowledgeServiceId());
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
        input = preserveWebSearch(input, previous.view());
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

    private PlatformConfig preserveWebSearch(PlatformConfig input, PlatformConfig previous) {
        if (input.webSearch() != null) return input;
        return new PlatformConfig(input.version(), input.providers(), input.models(), input.defaultModelId(),
                input.asr(), input.knowledge(), input.embedding(), previous.webSearch());
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
