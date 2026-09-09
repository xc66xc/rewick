package com.interview.copilot.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EmbeddingProtocolTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test void input_maximumDesktopBatch_preservesTexts() {
        var texts = Collections.nCopies(10, "中".repeat(20000));
        assertThat(EmbeddingProtocol.input(json.valueToTree(Map.of("serviceId", "vector", "input", texts)))).isEqualTo(texts);
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "[\"\"]", "[1]", "null"})
    void input_invalidTexts_rejects(String input) throws Exception {
        var body = json.readTree("{\"serviceId\":\"vector\",\"input\":" + input + "}");
        assertThatThrownBy(() -> EmbeddingProtocol.input(body)).isInstanceOf(ApiException.class);
    }

    @Test void input_endpointInjection_rejects() {
        assertThatThrownBy(() -> EmbeddingProtocol.input(json.valueToTree(Map.of(
                "serviceId", "vector", "input", "hello", "url", "https://attacker.invalid")))).isInstanceOf(ApiException.class);
    }

    @Test void selection_unapprovedModel_rejects() {
        var config = new ProviderProperties.Embedding();
        config.setModel("approved");
        assertThatThrownBy(() -> EmbeddingProtocol.validateSelection(json.valueToTree(Map.of("model", "expensive")), config))
                .isInstanceOf(ApiException.class);
        assertThat(EmbeddingProtocol.request(List.of("hi"), config)).containsEntry("dimensions", 1024).containsEntry("model", "approved");
    }

    @Test void response_metadataRemovedAndIndexesPreserved() {
        var response = json.valueToTree(Map.of("secret", "hidden", "data", List.of(
                Map.of("index", 1, "embedding", List.of(1, 2), "metadata", "hidden"),
                Map.of("index", 0, "embedding", List.of(3, 4)))));
        var result = EmbeddingProtocol.response(response, 2, 2);
        assertThat(json.valueToTree(result).toString()).doesNotContain("hidden", "secret", "metadata");
        assertThat(json.valueToTree(result).path("data").get(0).path("index").asInt()).isEqualTo(1);
    }

    @Test void response_floatOverflowAndZeroNorm_rejects() {
        for (var vector : List.of(List.of(0.0, 0.0), List.of(1e100, 1.0), List.of(1e-100, 1e-100))) {
            var response = json.valueToTree(Map.of("data", List.of(Map.of("index", 0, "embedding", vector))));
            assertThatThrownBy(() -> EmbeddingProtocol.response(response, 1, 2)).isInstanceOf(ApiException.class);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"index\":0,\"embedding\":[1]}", "{\"index\":2,\"embedding\":[1,2]}", "{\"index\":0,\"embedding\":[1,\"2\"]}"})
    void response_invalidVector_rejects(String row) throws Exception {
        var response = json.readTree("{\"data\":[" + row + "]}");
        assertThatThrownBy(() -> EmbeddingProtocol.response(response, 1, 2)).isInstanceOf(ApiException.class);
    }
}
