package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.model.search.WebSearchEndpoint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TavilySearchClientTest {
    private final ObjectMapper json = new ObjectMapper();
    private final TavilySearchClient client = new TavilySearchClient();

    @Test
    void extract_validResults_preservesOrderAndEnforcesTextBudget() {
        var response = json.createObjectNode();
        var results = response.putArray("results");
        results.addObject().put("url", "javascript:alert(1)").put("content", "bad");
        results.addObject().put("url", "https://example.com/empty").put("content", " ");
        for (int i = 0; i < 7; i++) results.addObject().put("url", "https://example.com/" + i)
                .put("title", "title " + i).put("content", "x".repeat(3000)).put("score", 0.9);

        var actual = client.extract(response, 5);

        assertThat(actual.status()).isEqualTo("ready");
        assertThat(actual.excerpts()).hasSize(5);
        assertThat(actual.excerpts().getFirst().url()).isEqualTo("https://example.com/0");
        assertThat(actual.excerpts()).allSatisfy(value -> {
            assertThat(value.source()).isEqualTo("web");
            assertThat(value.text()).hasSize(1600);
        });
    }

    @Test
    void extract_validShortResults_respectsTopK() {
        var response = json.createObjectNode();
        var results = response.putArray("results");
        for (int i = 0; i < 8; i++) results.addObject().put("url", "https://example.com/" + i).put("content", "fact");
        assertThat(client.extract(response, 5).excerpts()).hasSize(5);
    }

    @Test
    void extract_emptyResults_returnsEmptyRatherThanFailure() {
        var response = json.createObjectNode();
        response.putArray("results");
        assertThat(client.extract(response, 5).status()).isEqualTo("empty");
        assertThatThrownBy(() -> client.extract(json.createObjectNode(), 5)).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }

    @Test
    void response_absentOptionalFields_omitsNullsForDesktopSchema() throws Exception {
        var response = json.createObjectNode();
        response.putArray("results").addObject().put("url", "https://example.com").put("content", "fact");
        var output = json.readTree(json.writeValueAsString(client.extract(response, 5)));
        assertThat(output.has("message")).isFalse();
        assertThat(output.path("excerpts").get(0).has("score")).isFalse();
        assertThat(output.path("excerpts").get(0).path("documentId").asText()).hasSize(68);
    }

    @Test
    void endpoint_toString_neverExposesKey() {
        assertThat(new WebSearchEndpoint(true, "https://api.tavily.com/search", "secret", 5, "advanced", 8000).toString())
                .doesNotContain("secret");
    }
    @Test
    void extract_requestedSummary_appendsMarkedSummaryWithoutInventedSource() {
        var response = json.createObjectNode();
        response.putArray("results").addObject().put("url", "https://example.com").put("content", "Page text");
        response.put("answer", " Summary text ");
        var excerpts = client.extract(response, 5, "basic").excerpts();
        assertThat(excerpts).hasSize(2);
        assertThat(excerpts.getFirst().generatedSummary()).isNull();
        var summary = excerpts.getLast();
        assertThat(summary.generatedSummary()).isTrue();
        assertThat(summary.url()).isNull();
        assertThat(summary.title()).isEqualTo("Tavily 生成摘要（非网页原文）");
        assertThat(summary.text()).isEqualTo("Summary text");
        assertThat(client.extract(response, 5, "basic").excerpts().getLast().chunkId()).isEqualTo(summary.chunkId());
        assertThat(client.extract(response, 5).excerpts()).hasSize(1);
    }

    @Test
    void extract_onlySummary_returnsReadyAndOmitsNullableUrl() throws Exception {
        var response = json.createObjectNode().put("answer", "summary only");
        var result = client.extract(response, 5, "advanced");
        assertThat(result.status()).isEqualTo("ready");
        assertThat(result.excerpts()).hasSize(1);
        var encoded = json.readTree(json.writeValueAsString(result.excerpts().getFirst()));
        assertThat(encoded.path("generatedSummary").asBoolean()).isTrue();
        assertThat(encoded.has("url")).isFalse();
        assertThat(encoded.has("score")).isFalse();
    }

    @Test
    void extract_invalidOrBlankSummary_keepsWebPages() {
        var response = json.createObjectNode();
        response.putArray("results").addObject().put("url", "https://example.com").put("content", "Page");
        response.putObject("answer").put("content", "not a string");
        assertThat(client.extract(response, 5, "advanced").excerpts()).hasSize(1);
        response.put("answer", " ");
        assertThat(client.extract(response, 5, "basic").excerpts()).hasSize(1);
    }

    @Test
    void extract_twentyPagesAndSummary_sharesEightThousandCharacterBudget() {
        var response = json.createObjectNode().put("answer", "s".repeat(3000));
        var results = response.putArray("results");
        for (int i = 0; i < 22; i++) results.addObject().put("url", "https://example.com/" + i).put("content", "p".repeat(3000));
        var excerpts = client.extract(response, 20, "advanced").excerpts();
        assertThat(excerpts).hasSize(21);
        assertThat(excerpts.stream().mapToInt(value -> value.text().length()).sum()).isLessThanOrEqualTo(8000);
        assertThat(excerpts).allSatisfy(value -> assertThat(value.text().length()).isLessThanOrEqualTo(2000));
        assertThat(excerpts.getLast().generatedSummary()).isTrue();
    }

}
