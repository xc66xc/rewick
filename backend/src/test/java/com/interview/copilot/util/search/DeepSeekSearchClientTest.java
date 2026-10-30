package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeepSeekSearchClientTest {
    private final ObjectMapper json = new ObjectMapper();
    private final DeepSeekSearchClient client = new DeepSeekSearchClient();

    @Test
    void extract_summaryAndSnippet_preservesSourcesWithoutPretendingToBePageText() {
        var response = json.createObjectNode();
        var results = response.putArray("results");
        results.addObject().put("url", "https://example.com/first").put("title", "First")
                .put("summary", " Model summary ").put("snippet", "Short snippet").put("rerank_score", 2.4);
        results.addObject().put("url", "https://example.com/second").put("summary", " ")
                .put("snippet", " Snippet fallback ");

        var actual = client.extract(response, 5);

        assertThat(actual.status()).isEqualTo("ready");
        assertThat(actual.excerpts()).hasSize(2);
        assertThat(actual.excerpts().getFirst().text()).isEqualTo("网页摘要（非网页原文）：\nModel summary");
        assertThat(actual.excerpts().getFirst().url()).isEqualTo("https://example.com/first");
        assertThat(actual.excerpts().getFirst().title()).isEqualTo("First");
        assertThat(actual.excerpts().getLast().text()).isEqualTo("网页摘要（非网页原文）：\nSnippet fallback");
        assertThat(actual.excerpts()).allSatisfy(value -> {
            assertThat(value.generatedSummary()).isNull();
            assertThat(value.score()).isNull();
            assertThat(value.source()).isEqualTo("web");
            assertThat(value.documentId()).startsWith("web:");
        });
        assertThat(client.extract(response, 5).excerpts().getFirst().chunkId())
                .isEqualTo(actual.excerpts().getFirst().chunkId());
    }

    @Test
    void extract_unusableResults_areFilteredBeforeTopKAndShareTextBudget() {
        var response = json.createObjectNode();
        var results = response.putArray("results");
        results.addObject().put("url", "javascript:alert(1)").put("summary", "bad");
        results.addObject().put("url", "https://user:password@example.com").put("summary", "bad");
        results.addObject().put("url", "https://example.com/blank").put("content", "Do not fetch raw text")
                .put("summary", " ").put("snippet", " ");
        for (int i = 0; i < 8; i++) {
            results.addObject().put("url", "https://example.com/" + i).put("summary", "s".repeat(3000));
        }

        var actual = client.extract(response, 5);

        assertThat(actual.excerpts()).hasSize(5);
        assertThat(actual.excerpts().getFirst().url()).isEqualTo("https://example.com/0");
        assertThat(actual.excerpts().stream().mapToInt(value -> value.text().length()).sum())
                .isLessThanOrEqualTo(8000);
        assertThat(actual.excerpts()).allSatisfy(value -> assertThat(value.text().length()).isLessThanOrEqualTo(2000));
    }

    @Test
    void extract_emptyAndMalformedResponses_distinguishesNoMatchesFromProtocolFailure() {
        var empty = json.createObjectNode();
        empty.putArray("results");
        assertThat(client.extract(empty, 5).status()).isEqualTo("empty");
        assertThatThrownBy(() -> client.extract(json.createObjectNode(), 5))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
}
