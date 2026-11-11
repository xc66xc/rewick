package com.interview.copilot.util.rerank;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ai.ProviderFailure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

class BailianRerankProtocolTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {"qwen3-rerank", "qwen3.7-text-rerank"})
    void request_twoDocuments_usesNativeBatchAndModelSpecificParameters(String model) {
        var body = json.valueToTree(BailianRerankProtocol.request(model, "query", List.of("one", "two")));

        assertThat(body.path("model").asText()).isEqualTo(model);
        assertThat(body.path("input").path("query").asText()).isEqualTo("query");
        assertThat(body.path("input").path("documents").size()).isEqualTo(2);
        assertThat(body.path("parameters").path("top_n").asInt()).isEqualTo(2);
        if ("qwen3-rerank".equals(model)) {
            assertThat(body.path("parameters").has("return_documents")).isTrue();
            assertThat(body.path("parameters").path("return_documents").asBoolean()).isFalse();
        } else {
            assertThat(body.path("parameters").has("return_documents")).isFalse();
        }
        assertThat(body.has("documents")).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"other-rerank", "qwen3.7-text-rerank-extra", "QWEN3.7-text-rerank", " qwen3-rerank"})
    void request_unregisteredModel_rejectsWithoutExpandingWhitelist(String model) {
        assertThat(BailianRerankProtocol.supports(model)).isFalse();
        assertThatThrownBy(() -> BailianRerankProtocol.request(model, "query", List.of("one", "two")))
                .isInstanceOfSatisfying(ProviderFailure.class,
                        error -> assertThat(error.reason()).isEqualTo("invalid_input"));
    }

    @Test
    void response_unsortedAndTiedScores_sortsByScoreThenOriginalIndex() throws Exception {
        var response = json.readTree("""
                {"output":{"results":[{"index":2,"relevance_score":0.2},
                {"index":1,"relevance_score":0.9,"document":{"text":"untrusted text"}},
                {"index":0,"relevance_score":0.9}]},"usage":{"prompt_tokens":79,"total_tokens":79}}
                """);

        var result = BailianRerankProtocol.response(response, 3);

        assertThat(result).extracting(BailianRerankProtocol.Score::index).containsExactly(0, 1, 2);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"results\":[{\"index\":0,\"relevance_score\":1}]}",
            "{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1}]}}",
            "{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1},{\"index\":0,\"relevance_score\":2}]}}",
            "{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1},{\"index\":2,\"relevance_score\":2}]}}",
            "{\"output\":{\"results\":[{\"index\":0.1,\"relevance_score\":1},{\"index\":1,\"relevance_score\":2}]}}",
            "{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1},{\"index\":1,\"relevance_score\":\"NaN\"}]}}",
            "{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1},{\"index\":1,\"relevance_score\":1e999}]}}"
    })
    void response_invalidIndexSetOrScore_rejectsEntireRanking(String value) throws Exception {
        var response = json.readTree(value);

        assertThatThrownBy(() -> BailianRerankProtocol.response(response, 2))
                .isInstanceOfSatisfying(ProviderFailure.class, error -> assertThat(error.reason()).isEqualTo("protocol_error"));
    }
}
