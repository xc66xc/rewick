package com.interview.copilot.util.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.questions.SpokenExtractionFixture;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.exception.questions.QuestionRewriteValidationRule;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.EnumSource;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class QuestionRewriteClientTest {
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicInteger requestCount = new AtomicInteger();
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
    @ValueSource(strings = {"```json\n{\"action\":\"unchanged\"}\n```", "{\"action\":\"rewritten\",\"question\":\"\"}"})
    void rewrite_malformedOutput_rejectsWithoutExposingContent(String content) {
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

    @Test
    void rewrite_questionsFormat_extractsOnceWithBoundedOutputAndNoScalarQuestion() {
        respond(json.encode(Map.of("action", "extracted", "questions", List.of(
                Map.of("question", "什么是 SSE？", "sourceTexts", List.of("什么是 SSE？")),
                Map.of("question", "MCP 有哪些方式？", "sourceTexts", List.of("MCP 有哪些方式？"))))), "stop");
        var endpoint = endpoint();
        endpoint.setMaxOutputTokens(4000);
        var result = client().rewrite(endpoint, new QuestionRewriteRequest("前面提到 Reactor。什么是 SSE？MCP 有哪些方式？",
                List.of(), "questions-v1"), Duration.ofSeconds(3)).block();

        assertThat(result.action()).isEqualTo("extracted");
        assertThat(result.question()).isNull();
        assertThat(result.questions()).extracting(q -> q.id()).containsExactly("q1", "q2");
        assertThat(json.parse(body.get()).path("max_tokens").asInt()).isEqualTo(1536);
        assertThat(json.parse(body.get()).path("messages").path(0).path("content").asText()).contains("全部独立问题");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void rewrite_spokenQuestionViaHttpSubstitute_acceptsNecessarySourcesInOneCall(int variant) {
        respond(json.encode(SpokenExtractionFixture.output(variant)), "stop");
        var endpoint = endpoint();
        endpoint.setMaxOutputTokens(4000);
        var result = client().rewrite(endpoint, new QuestionRewriteRequest(SpokenExtractionFixture.ORIGINAL,
                List.of(), "questions-v1"), Duration.ofSeconds(3)).block();

        assertThat(result.questions()).extracting(question -> question.id()).containsExactly("q1", "q2", "q3");
        assertThat(result.usage()).containsEntry("totalTokens", 30L);
        assertThat(json.parse(body.get()).path("max_tokens").asInt()).isEqualTo(1536);
    }

    @Test
    void rewrite_topicOnlyInSource_acceptsModelContentWithoutSemanticGuard() {
        var questions = new java.util.ArrayList<>(SpokenExtractionFixture.questions(0));
        var finalQuestion = new java.util.HashMap<>(questions.get(2));
        finalQuestion.put("question", "除了SSE之外，还有哪些协议？");
        questions.set(2, finalQuestion);
        respond(json.encode(Map.of("action", "extracted", "questions", questions)), "stop");

        var result = client().rewrite(endpoint(), new QuestionRewriteRequest(SpokenExtractionFixture.ORIGINAL,
                List.of(), "questions-v1"), Duration.ofSeconds(3)).block();

        assertThat(result.questions()).hasSize(3);
        assertThat(result.questions().get(2).question()).isEqualTo("除了SSE之外，还有哪些协议？");
        assertThat(result.usage()).containsEntry("totalTokens", 30L);
        assertThat(requestCount).hasValue(1);
    }

    @Test
    void rewrite_topicInLeadIn_sendsStandaloneTopicInstructionAndAcceptsOneBoundedResult() {
        String original = "什么是WebSocket？以及HTTP，除了GET之外，还有哪些请求方法？";
        String question = "HTTP除了GET之外，还有哪些请求方法？";
        respond(json.encode(Map.of("action", "extracted", "questions", List.of(
                Map.of("question", "什么是WebSocket？", "sourceTexts", List.of("什么是WebSocket？")),
                Map.of("question", question, "sourceTexts", List.of("以及HTTP，除了GET之外，还有哪些请求方法？"))))), "stop");
        var endpoint = endpoint();
        endpoint.setMaxOutputTokens(4000);

        var result = client().rewrite(endpoint, new QuestionRewriteRequest(original,
                List.of(), "questions-v1"), Duration.ofSeconds(3)).block();

        assertThat(result.questions()).extracting(value -> value.question()).containsExactly("什么是WebSocket？", question);
        assertThat(json.parse(body.get()).path("messages").path(0).path("content").asText())
                .contains("独立检索", "WebSocket", "HTTP", "GET");
        assertThat(json.parse(body.get()).path("max_tokens").asInt()).isEqualTo(1536);
        assertThat(requestCount).hasValue(1);
    }

    @ParameterizedTest
    @EnumSource(QuestionRewriteValidationRule.class)
    void rewrite_invalidOutputWithKnownUsage_preservesFixedRuleWithoutRawText(QuestionRewriteValidationRule rule) {
        String content = diagnosticContent(rule);
        respond(content, rule == QuestionRewriteValidationRule.TRUNCATED ? "length" : "stop");
        assertThatThrownBy(() -> client().rewrite(endpoint(), new QuestionRewriteRequest("什么是SSE？",
                List.of(), "questions-v1"), Duration.ofSeconds(3)).block())
                .isInstanceOf(QuestionRewriteOutputException.class)
                .hasMessage("Question rewrite returned invalid or unsafe output").satisfies(error -> {
                    var failure = (QuestionRewriteOutputException) error;
                    assertThat(failure.rule()).isEqualTo(rule);
                    assertThat(failure.usage()).containsEntry("totalTokens", 30L);
                });
    }

    @ParameterizedTest
    @ValueSource(strings = {"cancelled", "interrupted"})
    void rewrite_wrappedTerminalFailure_neverConvertsCancellationIntoInvalidOutput(String scenario) {
        var http = mock(ProviderHttpClient.class);
        var endpoint = new ProviderProperties.Llm();
        endpoint.setModel("synthetic-model");
        endpoint.setThinkingProtocol("none");
        var failure = new ProviderFailure("invalid_json", "Fixed provider failure");
        failure.initCause(scenario.equals("cancelled") ? new java.util.concurrent.CancellationException() : new InterruptedException());
        when(http.json(any(), any(), any())).thenReturn(Mono.error(failure));
        var client = new QuestionRewriteClient(http, json);

        assertThatThrownBy(() -> client.rewrite(endpoint, input(), Duration.ofSeconds(3)).block()).isSameAs(failure);
    }

    private String diagnosticContent(QuestionRewriteValidationRule rule) {
        return switch (rule) {
            case RESPONSE_FORMAT -> "";
            case JSON -> "private-invalid-json";
            case TRUNCATED -> "{\"action\":\"unchanged\"}";
            case EXTRACTION_STRUCTURE -> "{\"action\":\"extracted\",\"questions\":[]}";
        };
    }

    @Test
    void rewrite_questionsTruncated_retainsUsageAndRejectsWholeList() {
        respond("{\"action\":\"extracted\",\"questions\":[]}", "length");
        assertThatThrownBy(() -> client().rewrite(endpoint(), new QuestionRewriteRequest("什么是 SSE？", List.of(), "questions-v1"),
                Duration.ofSeconds(3)).block()).isInstanceOf(QuestionRewriteOutputException.class)
                .satisfies(error -> assertThat(((QuestionRewriteOutputException) error).usage()).containsEntry("totalTokens", 30L));
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
    @ValueSource(strings = {"empty", "length", "malformed"})
    void rewrite_rejectedResponse_retainsReportedTokensWithoutRetainingResponseText(String scenario) {
        String content = scenario.equals("empty")
                ? "{\"action\":\"rewritten\",\"question\":\"\"}"
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
                    .flatMap(value -> { requestCount.incrementAndGet(); body.set(value); return Mono.just(response); }));
        }).bindNow();
    }
}
