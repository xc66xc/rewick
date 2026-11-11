package com.interview.copilot.util.rerank;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ai.ProviderFailure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

class BailianRerankProtocolTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void request_twoDocuments_usesNativeBatchAndRequestsCompleteRanking() {
        var body = json.valueToTree(BailianRerankProtocol.request("qwen3-rerank", "query", List.of("one", "two")));

        assertThat(body.path("input").path("documents").size()).isEqualTo(2);
        assertThat(body.path("parameters").path("top_n").asInt()).isEqualTo(2);
        assertThat(body.path("parameters").path("return_documents").asBoolean()).isFalse();
        assertThat(body.has("documents")).isFalse();
    }

    @Test
    void response_unsortedAndTiedScores_sortsByScoreThenOriginalIndex() throws Exception {
        var response = json.readTree("""
                {"output":{"results":[{"index":2,"relevance_score":0.2},
                {"index":1,"relevance_score":0.9,"document":{"text":"untrusted text"}},
                {"index":0,"relevance_score":0.9}]}}
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
