package com.interview.copilot.model.platform;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformPolicy;

import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** One request owns this immutable definition and secret set; endpoint beans are fresh copies. */
public final class PlatformSnapshot {
    private final PlatformConfig config;
    private final Map<String, String> keys;
    private final Map<String, PlatformConfig.Provider> providers;
    private final PlatformPolicy policy;
    private final Map<String, String> aliases;

    public PlatformSnapshot(
            PlatformConfig input, Map<String, String> secrets, PlatformPolicy policy) {
        this(input, secrets, policy, Map.of());
    }

    public PlatformSnapshot(
            PlatformConfig input,
            Map<String, String> secrets,
            PlatformPolicy policy,
            Map<String, String> aliases) {
        keys = Map.copyOf(secrets);
        this.policy = policy;
        this.aliases = Map.copyOf(aliases);
        List<PlatformConfig.Provider> redacted =
                input.providers().stream()
                        .map(
                                provider ->
                                        new PlatformConfig.Provider(
                                                provider.id(),
                                                provider.name(),
                                                provider.kind(),
                                                provider.url(),
                                                provider.enabled(),
                                                !key(provider.id()).isEmpty(),
                                                null, provider.searchProtocol()))
                        .toList();
        config =
                new PlatformConfig(
                        input.version(),
                        redacted,
                        input.models(),
                        input.defaultModelId(),
                        input.asr(),
                        input.embedding(), input.webSearch() == null ? PlatformConfig.WebSearch.disabled() : input.webSearch().withDefaultAnswer("none"));
        Map<String, PlatformConfig.Provider> indexed = new LinkedHashMap<>();
        redacted.forEach(provider -> indexed.put(provider.id(), provider));
        providers = Map.copyOf(indexed);
    }

    public PlatformConfig view() {
        return config;
    }

    public String key(String providerId) {
        return keys.getOrDefault(providerId, "");
    }

    public com.interview.copilot.model.search.WebSearchEndpoint webSearch() {
        var search = config.webSearch();
        var provider = providers.get(search.providerId());
        boolean enabled = search.enabled() && provider != null && provider.enabled()
                && "web-search".equals(provider.kind()) && !key(provider.id()).isBlank();
        return new com.interview.copilot.model.search.WebSearchEndpoint(enabled,
                provider == null ? "" : provider.url(), key(search.providerId()), search.topK(),
                search.searchDepth(), search.timeoutMs(), search.includeAnswer(),
                provider == null ? "tavily" : provider.searchProtocol());
    }

    public String defaultModelId() {
        return config.defaultModelId();
    }

    public List<AvailableModel> availableModels() {
        return config.models().stream()
                .filter(this::available)
                .map(model -> new AvailableModel(model.id(), model.name()))
                .toList();
    }

    public List<AvailableEmbedding> availableEmbeddingServices() {
        var endpoint = embedding();
        if (!endpoint.isEnabled()) {
            return List.of();
        }
        var provider = providers.get(config.embedding().providerId());
        return List.of(
                new AvailableEmbedding(
                        provider.id(),
                        provider.name(),
                        endpoint.getModel(),
                        endpoint.getDimensions(),
                        fingerprint(endpoint)));
    }

    private String fingerprint(ProviderProperties.Embedding endpoint) {
        try {
            String identity =
                    endpoint.getUrl()
                            + "\n"
                            + endpoint.getModel()
                            + "\n"
                            + endpoint.getDimensions();
            return java.util.HexFormat.of()
                    .formatHex(
                            java.security.MessageDigest.getInstance("SHA-256")
                                    .digest(
                                            identity.getBytes(
                                                    java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is required", error);
        }
    }

    public ProviderProperties.Embedding embedding() {
        var endpoint = new ProviderProperties.Embedding();
        var service = config.embedding();
        if (service.enabled()) {
            endpoint(providers.get(service.providerId()), endpoint);
        }
        endpoint.setModel(service.model());
        endpoint.setDimensions(service.dimensions());
        return endpoint;
    }

    public ProviderProperties.Embedding embedding(String serviceId) {
        if (serviceId == null
                || availableEmbeddingServices().stream()
                        .noneMatch(value -> value.id().equals(serviceId))) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "SERVICE_UNAVAILABLE", "所选平台向量服务已不可用，请重新选择");
        }
        return embedding();
    }

    public List<AvailableService> availableAsrServices() {
        return serviceCatalog("asr", config.asr().providerId(), asr());
    }

    private List<AvailableService> serviceCatalog(
            String kind, String providerId, ProviderProperties.Endpoint endpoint) {
        PlatformConfig.Provider provider = providers.get(providerId);
        if (provider == null || !provider.kind().equals(kind) || !endpoint.isEnabled()) {
            return List.of();
        }
        return List.of(new AvailableService(provider.id(), provider.name()));
    }

    private boolean available(PlatformConfig.Model model) {
        PlatformConfig.Provider provider = providers.get(model.providerId());
        return model.enabled()
                && provider != null
                && provider.enabled()
                && !key(provider.id()).isEmpty();
    }

    public LlmSelection llm(String requestedId) {
        String selected =
                requestedId == null
                        ? config.defaultModelId()
                        : aliases.getOrDefault(requestedId, requestedId);
        if (requestedId == null && selected.isEmpty()) {
            throw ProviderErrors.unavailable();
        }
        PlatformConfig.Model model =
                config.models().stream()
                        .filter(value -> value.id().equals(selected))
                        .filter(this::available)
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                HttpStatus.BAD_REQUEST,
                                                "MODEL_UNAVAILABLE",
                                                "所选平台模型已不可用，请重新选择"));
        ProviderProperties.Llm endpoint = new ProviderProperties.Llm();
        endpoint(providers.get(model.providerId()), endpoint);
        endpoint.setModel(model.model());
        endpoint.setMaxOutputTokens(model.maxOutputTokens());
        endpoint.setThinkingMode(model.thinkingMode());
        endpoint.setThinkingProtocol(model.thinkingProtocol());
        endpoint.setMaxConcurrent(policy.concurrentLlm());
        endpoint.setIdleTimeoutSeconds(policy.llmIdleSeconds());
        endpoint.setTotalTimeoutSeconds(policy.llmTotalSeconds());
        return new LlmSelection(model.id(), endpoint);
    }

    public ProviderProperties.Asr asr() {
        ProviderProperties.Asr endpoint = new ProviderProperties.Asr();
        PlatformConfig.Asr service = config.asr();
        if (service.enabled()) {
            endpoint(providers.get(service.providerId()), endpoint);
        }
        endpoint.setModel(service.model());
        endpoint.setMaxDurationSeconds(policy.asrSeconds());
        return endpoint;
    }

    public ProviderProperties.Asr asr(String serviceId) {
        requireSelection(serviceId, availableAsrServices(), "转写");
        return asr();
    }

    private void requireSelection(
            String serviceId, List<AvailableService> available, String capability) {
        if (serviceId == null) {
            return;
        }
        if (available.stream().noneMatch(service -> service.id().equals(serviceId))) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "SERVICE_UNAVAILABLE",
                    "所选平台" + capability + "服务已不可用，请重新选择");
        }
    }

    private void endpoint(PlatformConfig.Provider provider, ProviderProperties.Endpoint endpoint) {
        if (provider == null || !provider.enabled()) {
            return;
        }
        endpoint.setUrl(provider.url());
        endpoint.setApiKey(key(provider.id()));
    }

    public record AvailableEmbedding(
            String id, String name, String model, int dimensions, String fingerprint) {}

    public record AvailableModel(String id, String name) {}

    public record AvailableService(String id, String name) {}

    public record LlmSelection(String id, ProviderProperties.Llm config) {}
}
