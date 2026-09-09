package com.interview.copilot.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.admin.audit.AuditService;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.LlmRequestPolicy;
import com.interview.copilot.asr.AsrProviderProbe;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

@Service
public final class PlatformProbeService {
    private final PlatformConfigService configs;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final AsrProviderProbe asr;
    private final AuditService audit;
    private final Semaphore capacity = new Semaphore(4);

    public PlatformProbeService(PlatformConfigService configs, ProviderHttpClient http, ProviderJson json,
                                AsrProviderProbe asr, AuditService audit) {
        this.configs = configs;
        this.http = http;
        this.json = json;
        this.asr = asr;
        this.audit = audit;
    }

    public Result test(long actorId, Request input) {
        if (input == null || input.capability() == null || !Set.of("llm", "asr", "knowledge", "embedding").contains(input.capability())) {
            throw PlatformConfigErrors.invalid("请选择需要测试的服务能力。");
        }
        PlatformSnapshot snapshot = configs.draft(input.config());
        if (!capacity.tryAcquire()) { throw ProviderErrors.busy(); }
        long started = System.nanoTime();
        boolean success = false;
        try {
            probe(snapshot, input);
            success = true;
            return new Result(true, "服务测试通过。", elapsed(started));
        } catch (RuntimeException error) {
            return new Result(false, "服务测试失败，请检查地址、密钥和模型配置。", elapsed(started));
        } finally {
            capacity.release();
            audit.record(actorId, success ? "platform.config.test.success" : "platform.config.test.failed", input.capability());
        }
    }

    private void probe(PlatformSnapshot snapshot, Request input) {
        switch (input.capability()) {
            case "llm" -> llm(snapshot, input.modelId());
            case "asr" -> asr.test(snapshot.asr());
            case "knowledge" -> knowledge(snapshot);
            case "embedding" -> embedding(snapshot);
            default -> throw PlatformConfigErrors.invalid("服务能力无效。");
        }
    }

    private void llm(PlatformSnapshot snapshot, String modelId) {
        var endpoint = snapshot.llm(modelId == null || modelId.isBlank() ? null : modelId).config();
        Map<String, Object> body = Map.of("model", endpoint.getModel(), "stream", false, "max_tokens", Math.min(16, endpoint.getMaxOutputTokens()),
                "messages", List.of(Map.of("role", "user", "content", "Reply OK.")));
        JsonNode response = http.json(endpoint, LlmRequestPolicy.request(json.parse(json.encode(body)), endpoint),
                Duration.ofSeconds(Math.min(8, endpoint.getTotalTimeoutSeconds()))).block();
        json.completion(response, "message");
    }

    private void embedding(PlatformSnapshot snapshot) {
        var endpoint = snapshot.embedding();
        if (!endpoint.isEnabled()) { throw ProviderErrors.unavailable(); }
        JsonNode response = http.json(endpoint, com.interview.copilot.embedding.EmbeddingProtocol.request(
                List.of("资料检索连接测试"), endpoint), Duration.ofSeconds(8)).block();
        com.interview.copilot.embedding.EmbeddingProtocol.response(response, 1, endpoint.getDimensions());
    }

    private void knowledge(PlatformSnapshot snapshot) {
        var endpoint = snapshot.knowledge();
        if (!endpoint.isEnabled()) { throw ProviderErrors.unavailable(); }
        JsonNode response = http.json(endpoint, Map.of("query", "连接测试", "agent_id", endpoint.getAgentId(), "images", List.of()),
                Duration.ofSeconds(Math.min(8, endpoint.getTimeoutSeconds()))).block();
        if (response == null || !response.path("success").asBoolean(false) || !response.path("data").path("nodes").isArray()) {
            throw ProviderErrors.failed();
        }
    }

    private long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000; }
    public record Request(PlatformConfig config, String capability, String modelId) { }
    public record Result(boolean success, String message, long latencyMs) { }
}
