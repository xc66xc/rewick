package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.WebSearchProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TavilySearchClientTest {
    private final ObjectMapper json = new ObjectMapper();
    private final WebSearchProperties config = new WebSearchProperties(false, "https://api.tavily.com/search", "", 5, "advanced", 8000);
    private final TavilySearchClient client = new TavilySearchClient(config);

    @Test
    void extract_validResults_preservesOrderAndEnforcesTextBudget() {
        var response = json.createObjectNode();
        var results = response.putArray("results");
        results.addObject().put("url", "javascript:alert(1)").put("content", "bad");
        results.addObject().put("url", "https://example.com/empty").put("content", " ");
        for (int i = 0; i < 7; i++) results.addObject().put("url", "https://example.com/" + i)
                .put("title", "title " + i).put("content", "x".repeat(3000)).put("score", 0.9);

        var actual = client.extract(response);

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
        assertThat(client.extract(response).excerpts()).hasSize(5);
    }

    @Test
    void extract_emptyResults_returnsEmptyRatherThanFailure() {
        var response = json.createObjectNode();
        response.putArray("results");
        assertThat(client.extract(response).status()).isEqualTo("empty");
        assertThatThrownBy(() -> client.extract(json.createObjectNode())).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }

    @Test
    void response_absentOptionalFields_omitsNullsForDesktopSchema() throws Exception {
        var response = json.createObjectNode();
        response.putArray("results").addObject().put("url", "https://example.com").put("content", "fact");
        var output = json.readTree(json.writeValueAsString(client.extract(response)));
        assertThat(output.has("message")).isFalse();
        assertThat(output.path("excerpts").get(0).has("score")).isFalse();
        assertThat(output.path("excerpts").get(0).path("documentId").asText()).hasSize(68);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 21, -1})
    void validate_invalidTopK_rejectsConfiguration(int topK) {
        assertThatThrownBy(() -> new WebSearchProperties(false, "https://api.tavily.com/search", "", topK, "advanced", 8000).validate())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://api.tavily.com/search", "https://api.tavily.com", "https://key@api.tavily.com/search"})
    void validate_invalidEnabledEndpoint_rejectsConfiguration(String url) {
        assertThatThrownBy(() -> new WebSearchProperties(true, url, "fixture", 5, "advanced", 8000).validate())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void validate_missingEnabledKey_rejectsWithoutExposingKey() {
        assertThatThrownBy(() -> new WebSearchProperties(true, config.url(), "", 5, "advanced", 8000).validate())
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new WebSearchProperties(true, config.url(), "secret", 5, "advanced", 8000).toString()).doesNotContain("secret");
    }
}
