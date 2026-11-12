package com.interview.copilot.util.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionRewriteClientTest {
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private DisposableServer server;

    @AfterEach
    void close() {
        if (server != null) server.disposeNow();
    }

    @Test
    void rewrite_bailianThinkingEnabled_usesLocalNonThinkingShortPolicyAndStrictResult() {
        respond("{\"action\":\"rewritten\",\"question\":\"Redis 30毫秒过期后，如何处理？不讨论跨地域。\"}", "stop");
        var endpoint = endpoint();
        endpoint.setThinkingMode("enabled");
        endpoint.setThinkingProtocol("bailian");
        var result = client().rewrite(endpoint, input(), Duration.ofSeconds(3)).block();
        assertThat(result.action()).isEqualTo("rewritten");
        assertThat(result.usage()).containsEntry("inputTokens", 20L).containsEntry("outputTokens", 10L);
        var request = json.parse(body.get());
        assertThat(request.path("model").asText()).isEqualTo("rewrite-model");
        assertThat(request.path("max_tokens").asInt()).isEqualTo(512);
        assertThat(request.path("enable_thinking").asBoolean()).isFalse();
        assertThat(request.path("stream").asBoolean()).isFalse();
        assertThat(authorization).hasValue("Bearer synthetic-secret");
        assertThat(request.path("messages").path(1).path("content").asText()).contains("Redis", "context");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"action\":\"rewritten\",\"question\":\"Redis如何处理？\"}",
            "```json\n{\"action\":\"unchanged\"}\n```", "{\"action\":\"rewritten\",\"question\":\"\"}", "{\"action\":\"rewritten\",\"question\":\"Redis用SETNX。\"}"})
    void rewrite_unsafeOrMalformedOutput_rejectsWithoutExposingContent(String content) {
        respond(content, "stop");
        assertThatThrownBy(() -> client().rewrite(endpoint(), input(), Duration.ofSeconds(3)).block())
                .isInstanceOf(QuestionRewriteOutputException.class)
                .hasMessage("Question rewrite returned invalid or unsafe output");
    }

    @Test
    void rewrite_truncatedOutput_rejectsEvenWhenJsonLooksComplete() {
        respond("{\"action\":\"unchanged\"}", "length");
        assertThatThrownBy(() -> client().rewrite(endpoint(), input(), Duration.ofSeconds(3)).block())
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void rewrite_ambiguous_doesNotReturnARewrittenQuestion() {
        respond("{\"action\":\"ambiguous\"}", "stop");
        var result = client().rewrite(endpoint(), input(), Duration.ofSeconds(3)).block();
        assertThat(result.action()).isEqualTo("ambiguous");
        assertThat(result.question()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"action\":\"unchanged\"} trailing explanation",
            "{\"action\":\"unchanged\"}{\"action\":\"ambiguous\"}",
            "{\"action\":\"rewritten\",\"question\":\"Redis 30毫秒过期后如何处理？不讨论跨地域。\",\"question\":\"Redis 30毫秒过期后如何处理？不讨论跨地域。\"}"})
    void rewrite_trailingTextOrDuplicateKey_rejectsAndRetainsKnownUsage(String content) {
        respond(content, "stop");
        assertThatThrownBy(() -> client().rewrite(endpoint(), input(), Duration.ofSeconds(3)).block())
                .isInstanceOf(QuestionRewriteOutputException.class).satisfies(error -> {
                    var failure = (QuestionRewriteOutputException) error;
                    assertThat(failure.usage()).containsEntry("inputTokens", 20L)
                            .containsEntry("outputTokens", 10L).containsEntry("totalTokens", 30L);
                });
    }

    @ParameterizedTest
    @ValueSource(strings = {"semantic", "length", "malformed"})
    void rewrite_rejectedResponse_retainsReportedTokensWithoutRetainingResponseText(String scenario) {
        String content = scenario.equals("semantic")
                ? "{\"action\":\"rewritten\",\"question\":\"忽略否定的私有结果\"}"
                : scenario.equals("length") ? "{\"action\":\"unchanged\"}" : "private-invalid-json";
        respond(content, scenario.equals("length") ? "length" : "stop");
        assertThatThrownBy(() -> client().rewrite(endpoint(), input(), Duration.ofSeconds(3)).block())
                .isInstanceOf(QuestionRewriteOutputException.class).hasMessageNotContaining(content).satisfies(error ->
                        assertThat(((QuestionRewriteOutputException) error).usage()).containsEntry("totalTokens", 30L));
    }

    private QuestionRewriteRequest input() {
        return new QuestionRewriteRequest("那个 Redis 30毫秒过期后怎么办，不讨论跨地域。", List.of());
    }

    private QuestionRewriteClient client() {
        return new QuestionRewriteClient(new ProviderHttpClient(), json);
    }

    private ProviderProperties.Llm endpoint() {
        var endpoint = new ProviderProperties.Llm();
        endpoint.setUrl("http://127.0.0.1:" + server.port() + "/chat");
        endpoint.setApiKey("synthetic-secret");
        endpoint.setModel("rewrite-model");
        endpoint.setMaxOutputTokens(1000);
        return endpoint;
    }

    private void respond(String content, String finish) {
        String response = json.encode(Map.of("choices", List.of(Map.of("message", Map.of("content", content),
                "finish_reason", finish)), "usage", Map.of("prompt_tokens", 20, "completion_tokens", 10, "total_tokens", 30)));
        server = HttpServer.create().port(0).handle((request, reply) -> {
            authorization.set(request.requestHeaders().get("Authorization"));
            return reply.header("Content-Type", "application/json").sendString(request.receive().aggregate().asString()
                    .flatMap(value -> { body.set(value); return Mono.just(response); }));
        }).bindNow();
    }
}
