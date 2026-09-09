package com.interview.copilot.platform;

import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** One request owns this immutable definition and secret set; endpoint beans are fresh copies. */
public final class PlatformSnapshot {
    private final PlatformConfig config;
    private final Map<String, String> keys;
    private final Map<String, PlatformConfig.Provider> providers;
    private final PlatformPolicy policy;
    private final Map<String, String> aliases;

    PlatformSnapshot(PlatformConfig input, Map<String, String> secrets, PlatformPolicy policy) {
        this(input, secrets, policy, Map.of());
    }

    PlatformSnapshot(PlatformConfig input, Map<String, String> secrets, PlatformPolicy policy, Map<String, String> aliases) {
        keys = Map.copyOf(secrets);
        this.policy = policy;
        this.aliases = Map.copyOf(aliases);
        List<PlatformConfig.Provider> redacted = input.providers().stream().map(provider -> new PlatformConfig.Provider(
                provider.id(), provider.name(), provider.kind(), provider.url(), provider.enabled(),
                !key(provider.id()).isEmpty(), null)).toList();
        config = new PlatformConfig(input.version(), redacted, input.models(), input.defaultModelId(), input.asr(), input.knowledge());
        Map<String, PlatformConfig.Provider> indexed = new LinkedHashMap<>();
        redacted.forEach(provider -> indexed.put(provider.id(), provider));
        providers = Map.copyOf(indexed);
    }

    public PlatformConfig view() { return config; }
    String key(String providerId) { return keys.getOrDefault(providerId, ""); }
    public String defaultModelId() { return config.defaultModelId(); }

    public List<AvailableModel> availableModels() {
        return config.models().stream().filter(this::available).map(model -> new AvailableModel(model.id(), model.name())).toList();
    }

    public List<AvailableService> availableAsrServices() {
        return serviceCatalog("asr", config.asr().providerId(), asr());
    }

    public List<AvailableService> availableKnowledgeServices() {
        return serviceCatalog("knowledge", config.knowledge().providerId(), knowledge());
    }

    private List<AvailableService> serviceCatalog(String kind, String providerId, ProviderProperties.Endpoint endpoint) {
        PlatformConfig.Provider provider = providers.get(providerId);
        if (provider == null || !provider.kind().equals(kind) || !endpoint.isEnabled()) { return List.of(); }
        return List.of(new AvailableService(provider.id(), provider.name()));
    }

    private boolean available(PlatformConfig.Model model) {
        PlatformConfig.Provider provider = providers.get(model.providerId());
        return model.enabled() && provider != null && provider.enabled() && !key(provider.id()).isEmpty();
    }

    public LlmSelection llm(String requestedId) {
        String selected = requestedId == null ? config.defaultModelId() : aliases.getOrDefault(requestedId, requestedId);
        if (requestedId == null && selected.isEmpty()) { throw ProviderErrors.unavailable(); }
        PlatformConfig.Model model = config.models().stream().filter(value -> value.id().equals(selected))
                .filter(this::available).findFirst().orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                        "MODEL_UNAVAILABLE", "所选平台模型已不可用，请重新选择"));
        ProviderProperties.Llm endpoint = new ProviderProperties.Llm();
        endpoint(providers.get(model.providerId()), endpoint);
        endpoint.setModel(model.model());
        endpoint.setMaxOutputTokens(model.maxOutputTokens());
        endpoint.setMaxConcurrent(policy.concurrentLlm());
        endpoint.setIdleTimeoutSeconds(policy.llmIdleSeconds());
        endpoint.setTotalTimeoutSeconds(policy.llmTotalSeconds());
        return new LlmSelection(model.id(), endpoint);
    }

    public ProviderProperties.Asr asr() {
        ProviderProperties.Asr endpoint = new ProviderProperties.Asr();
        PlatformConfig.Asr service = config.asr();
        if (service.enabled()) { endpoint(providers.get(service.providerId()), endpoint); }
        endpoint.setModel(service.model());
        endpoint.setMaxDurationSeconds(policy.asrSeconds());
        return endpoint;
    }

    public ProviderProperties.Asr asr(String serviceId) {
        requireSelection(serviceId, availableAsrServices(), "转写");
        return asr();
    }

    public ProviderProperties.Knowledge knowledge() {
        ProviderProperties.Knowledge endpoint = new ProviderProperties.Knowledge();
        PlatformConfig.Knowledge service = config.knowledge();
        if (service.enabled()) { endpoint(providers.get(service.providerId()), endpoint); }
        endpoint.setAgentId(service.agentId());
        endpoint.setTimeoutSeconds(policy.knowledgeSeconds());
        return endpoint;
    }

    public ProviderProperties.Knowledge knowledge(String serviceId) {
        requireSelection(serviceId, availableKnowledgeServices(), "知识库");
        return knowledge();
    }

    private void requireSelection(String serviceId, List<AvailableService> available, String capability) {
        if (serviceId == null) { return; }
        if (available.stream().noneMatch(service -> service.id().equals(serviceId))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_UNAVAILABLE", "所选平台" + capability + "服务已不可用，请重新选择");
        }
    }

    private void endpoint(PlatformConfig.Provider provider, ProviderProperties.Endpoint endpoint) {
        if (provider == null || !provider.enabled()) { return; }
        endpoint.setUrl(provider.url());
        endpoint.setApiKey(key(provider.id()));
    }

    public record AvailableModel(String id, String name) { }
    public record AvailableService(String id, String name) { }
    public record LlmSelection(String id, ProviderProperties.Llm config) { }
}
