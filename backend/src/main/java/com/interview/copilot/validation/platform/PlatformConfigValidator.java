package com.interview.copilot.validation.platform;

import com.interview.copilot.exception.platform.PlatformConfigErrors;
import com.interview.copilot.model.platform.PlatformConfig;

import jakarta.validation.Validator;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 校验语音协议配置并验证实时语音服务的完整生命周期。
 */
@Component
public final class PlatformConfigValidator {
    private final Validator validator;

    public PlatformConfigValidator(Validator validator) {
        this.validator = validator;
    }

    public void validate(PlatformConfig config, PlatformConfig previous) {
        if (config == null || !validator.validate(config).isEmpty()) {
            throw PlatformConfigErrors.invalid("配置字段不完整或超出允许范围。");
        }
        Map<String, PlatformConfig.Provider> providers = providers(config.providers());
        validateModels(config, providers);
        validateServices(config, providers);
        preserveSecrets(config.providers(), previous.providers());
    }

    private Map<String, PlatformConfig.Provider> providers(List<PlatformConfig.Provider> values) {
        Map<String, PlatformConfig.Provider> indexed = new HashMap<>();
        for (PlatformConfig.Provider provider : values) {
            if (indexed.putIfAbsent(provider.id(), provider) != null) {
                throw PlatformConfigErrors.invalid("提供商 ID 不能重复。");
            }
            validateUrl(provider);
            if ("web-search".equals(provider.kind())) validateSearchUrl(provider.url());
            if (provider.apiKey() != null && provider.apiKey().matches("(?s).*[\\r\\n].*")) {
                throw PlatformConfigErrors.invalid("API Key 格式无效。");
            }
        }
        return indexed;
    }

    private void validateUrl(PlatformConfig.Provider provider) {
        try {
            URI uri = URI.create(provider.url());
            if (uri.getHost() == null) {
                throw PlatformConfigErrors.invalid("服务地址格式无效。");
            }
            boolean websocket = provider.kind().equals("asr");
            String secure = websocket ? "wss" : "https";
            String local = websocket ? "ws" : "http";
            boolean loopback = List.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
            boolean protocol =
                    secure.equals(uri.getScheme()) || (loopback && local.equals(uri.getScheme()));
            if (!protocol || uri.getUserInfo() != null || uri.getFragment() != null) {
                throw PlatformConfigErrors.invalid("服务地址协议或格式无效。");
            }
        } catch (IllegalArgumentException error) {
            throw PlatformConfigErrors.invalid("服务地址格式无效。");
        }
    }

    private void validateSearchUrl(String url) {
        URI uri = URI.create(url);
        if (!"/search".equals(uri.getRawPath()) || uri.getRawQuery() != null) {
            throw PlatformConfigErrors.invalid("Tavily 服务地址必须包含 /search 路径，且不能包含查询参数。");
        }
    }

    private void validateModels(
            PlatformConfig config, Map<String, PlatformConfig.Provider> providers) {
        Set<String> identifiers = new HashSet<>();
        Set<String> available = new HashSet<>();
        for (PlatformConfig.Model model : config.models()) {
            if (!identifiers.add(model.id())) {
                throw PlatformConfigErrors.invalid("模型 ID 不能重复。");
            }
            PlatformConfig.Provider provider = reference(providers, model.providerId(), "llm");
            if (!"default".equals(model.thinkingMode()) && "none".equals(model.thinkingProtocol())) {
                throw PlatformConfigErrors.invalid("开启或关闭思考模式前，请选择模型支持的思考参数协议。");
            }
            if (model.enabled() && provider.enabled()) {
                available.add(model.id());
            }
        }
        if (config.defaultModelId().isEmpty() && available.isEmpty()) {
            return;
        }
        if (!available.contains(config.defaultModelId())) {
            throw PlatformConfigErrors.invalid("请选择已启用的默认回答模型。");
        }
    }

    private void validateServices(
            PlatformConfig config, Map<String, PlatformConfig.Provider> providers) {
        var search = config.webSearch();
        if (search.enabled() || !search.providerId().isEmpty()) {
            var provider = reference(providers, search.providerId(), "web-search");
            if (search.enabled() && !provider.enabled()) {
                throw PlatformConfigErrors.invalid("开启联网搜索前请启用对应提供商。");
            }
        }
        validateService(
                config.embedding().enabled(),
                config.embedding().providerId(),
                config.embedding().model(),
                "embedding",
                providers);
        validateService(
                config.asr().enabled(),
                config.asr().providerId(),
                config.asr().model(),
                "asr",
                providers);

    }

    private void validateService(
            boolean enabled,
            String providerId,
            String model,
            String kind,
            Map<String, PlatformConfig.Provider> providers) {
        if (!enabled && providerId.isEmpty()) {
            return;
        }
        PlatformConfig.Provider provider = reference(providers, providerId, kind);
        if (enabled && "asr".equals(kind)) {
            com.interview.copilot.util.asr.AsrEndpoint.resolve(provider.url(), model);
        }
        if (enabled && (!provider.enabled() || model.isBlank())) {
            throw PlatformConfigErrors.invalid("启用服务前请填写模型标识，并启用对应提供商。");
        }
    }

    private PlatformConfig.Provider reference(
            Map<String, PlatformConfig.Provider> providers, String id, String kind) {
        PlatformConfig.Provider provider = providers.get(id);
        if (provider == null || !provider.kind().equals(kind)) {
            throw PlatformConfigErrors.invalid("配置引用的提供商不存在或能力类型不匹配。");
        }
        return provider;
    }

    private void preserveSecrets(
            List<PlatformConfig.Provider> values, List<PlatformConfig.Provider> previous) {
        Map<String, PlatformConfig.Provider> existing = new HashMap<>();
        previous.forEach(provider -> existing.put(provider.id(), provider));
        for (PlatformConfig.Provider provider : values) {
            if (provider.apiKey() != null && !provider.apiKey().isBlank()) {
                continue;
            }
            PlatformConfig.Provider old = existing.get(provider.id());
            if (old == null) {
                continue;
            }
            if (!old.url().equals(provider.url()) || !old.kind().equals(provider.kind())) {
                throw PlatformConfigErrors.invalid("服务地址或类型变更后，请重新填写 API Key。");
            }
        }
    }
}
