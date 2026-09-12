package com.interview.copilot.common.platform;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.service.platform.PlatformRuntimeService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/** Builds isolated supplier settings for tests without publishing database configuration. */
public final class PlatformRuntimeFixture implements PlatformRuntimeService {
    private final ProviderProperties properties;

    public PlatformRuntimeFixture(ProviderProperties properties) {
        this.properties = properties;
    }

    @Override
    public PlatformSnapshot snapshot() {
        List<PlatformConfig.Provider> providers = new ArrayList<>();
        Map<String, String> keys = new HashMap<>();
        add(providers, keys, "environment-llm", "环境回答服务", "llm", properties.getLlm());
        add(providers, keys, "environment-asr", "环境转写服务", "asr", properties.getAsr());
        add(
                providers,
                keys,
                "environment-knowledge",
                "环境知识服务",
                "knowledge",
                properties.getKnowledge());
        List<PlatformConfig.Model> models = models();
        String defaultId =
                properties.getLlm().isEnabled() ? modelId(properties.getLlm().getModel()) : "";
        PlatformConfig config =
                new PlatformConfig(
                        0,
                        providers,
                        models,
                        defaultId,
                        new PlatformConfig.Asr(
                                properties.getAsr().isEnabled(),
                                reference("asr"),
                                properties.getAsr().getModel()),
                        new PlatformConfig.Knowledge(
                                properties.getKnowledge().isEnabled(),
                                reference("knowledge"),
                                properties.getKnowledge().getAgentId()));
        Map<String, String> aliases = new HashMap<>();
        models.forEach(model -> aliases.put(model.model(), model.id()));
        return new PlatformSnapshot(config, keys, PlatformPolicy.from(properties), aliases);
    }

    private List<PlatformConfig.Model> models() {
        if (!properties.getLlm().isEnabled()) {
            return List.of();
        }
        return properties.getLlm().models().stream()
                .distinct()
                .map(
                        model ->
                                new PlatformConfig.Model(
                                        modelId(model),
                                        model.substring(0, Math.min(120, model.length())),
                                        "environment-llm",
                                        model,
                                        true,
                                        properties.getLlm().getMaxOutputTokens()))
                .toList();
    }

    private String modelId(String model) {
        if (model.matches("[A-Za-z0-9_.-]{1,64}")) {
            return model;
        }
        try {
            byte[] hash =
                    MessageDigest.getInstance("SHA-256")
                            .digest(model.getBytes(StandardCharsets.UTF_8));
            return "environment-model-" + HexFormat.of().formatHex(hash, 0, 16);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is required", error);
        }
    }

    private String reference(String kind) {
        ProviderProperties.Endpoint endpoint =
                switch (kind) {
                    case "asr" -> properties.getAsr();
                    default -> properties.getKnowledge();
                };
        return endpoint.isEnabled() ? "environment-" + kind : "";
    }

    private void add(
            List<PlatformConfig.Provider> providers,
            Map<String, String> keys,
            String id,
            String name,
            String kind,
            ProviderProperties.Endpoint endpoint) {
        if (!endpoint.isEnabled()) {
            return;
        }
        providers.add(
                new PlatformConfig.Provider(id, name, kind, endpoint.getUrl(), true, true, null));
        keys.put(id, endpoint.getApiKey());
    }
}
